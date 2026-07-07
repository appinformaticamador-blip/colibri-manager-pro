using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net.Http.Headers;
using System.Collections.Concurrent;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
Console.OutputEncoding = Encoding.UTF8;

var debug = args.Any(a => a.Equals("--debug", StringComparison.OrdinalIgnoreCase));
var config = AppConfig.Load();
var sync = new ColibriSync(config, debug);

Console.WriteLine("🐦 Colibrí Sync 1.2 limpio - NUMIER → Supabase");
Console.WriteLine("------------------------------------------------");
Console.WriteLine($"Ruta NUMIER: {config.NumierPath}");
Console.WriteLine($"Archivos: {config.CabeceraFile} / {config.DetalleFile}");
Console.WriteLine($"Auto-sync: cada {config.AutoSyncSeconds}s");
Console.WriteLine("Pulsa S para sincronizar ahora, Q para salir.\n");

using var timer = new PeriodicTimer(TimeSpan.FromSeconds(config.AutoSyncSeconds));
var cts = new CancellationTokenSource();
_ = Task.Run(async () =>
{
    while (await timer.WaitForNextTickAsync(cts.Token))
    {
        await sync.RunOnce();
    }
});

await sync.RunOnce();
while (true)
{
    var key = Console.ReadKey(true).Key;
    if (key == ConsoleKey.Q) { cts.Cancel(); break; }
    if (key == ConsoleKey.S) await sync.RunOnce();
}

public sealed class AppConfig
{
    [JsonPropertyName("numier_path")] public string NumierPath { get; set; } = @"C:\NUMIER\DATOS";
    [JsonPropertyName("cabecera_file")] public string CabeceraFile { get; set; } = "cabecera.DBF";
    [JsonPropertyName("detalle_file")] public string DetalleFile { get; set; } = "detalle.DBF";
    [JsonPropertyName("supabase_url")] public string SupabaseUrl { get; set; } = "";
    [JsonPropertyName("supabase_anon_key")] public string SupabaseAnonKey { get; set; } = "";
    [JsonPropertyName("auto_sync_seconds")] public int AutoSyncSeconds { get; set; } = 60;
    [JsonPropertyName("batch_size")] public int BatchSize { get; set; } = 500;
    public static AppConfig Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "config.json");
        if (!File.Exists(path))
        {
            var cfg = new AppConfig();
            File.WriteAllText(path, JsonSerializer.Serialize(cfg, new JsonSerializerOptions { WriteIndented = true }));
            return cfg;
        }
        return JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(path)) ?? new AppConfig();
    }
}

public sealed class ColibriSync
{
    private readonly AppConfig _cfg;
    private readonly bool _debug;
    private readonly SupabaseRest _supabase;
    public ColibriSync(AppConfig cfg, bool debug)
    {
        _cfg = cfg; _debug = debug; _supabase = new SupabaseRest(cfg);
    }
    private void Log(string msg) => Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {msg}");

    public async Task RunOnce()
    {
        try
        {
            Log("Comprobando NUMIER...");
            var cabPath = Path.Combine(_cfg.NumierPath, _cfg.CabeceraFile);
            var detPath = Path.Combine(_cfg.NumierPath, _cfg.DetalleFile);
            if (!File.Exists(cabPath)) { Log($"ERROR: no existe {cabPath}"); return; }
            if (!File.Exists(detPath)) { Log($"ERROR: no existe {detPath}"); return; }

            var cab = DbfTable.Open(cabPath);
            var det = DbfTable.Open(detPath);
            if (_debug)
            {
                Log($"CAB campos: {string.Join(", ", cab.Fields.Select(f => f.Name))}");
                Log($"DET campos: {string.Join(", ", det.Fields.Select(f => f.Name))}");
                Log($"CAB registros: {cab.RecordCount:N0}. DET registros: {det.RecordCount:N0}");
            }

            await _supabase.UpsertSyncFile("numier", _cfg.CabeceraFile, new FileInfo(cabPath));
            await _supabase.UpsertSyncFile("numier", _cfg.DetalleFile, new FileInfo(detPath));

            var lastCabId = await _supabase.GetLastCabId();
            var headers = cab.ReadAll().Select(NumierHeader.From).Where(x => x.CabId > lastCabId && x.Estado == "C").OrderBy(x => x.CabId).ToList();
            Log($"Último CAB_ID en Supabase: {lastCabId}. Nuevos cobrados detectados: {headers.Count}");
            if (_debug)
            {
                foreach (var h in headers.Take(5)) Log($"Ejemplo CAB_ID={h.CabId} Fecha={h.Fecha:yyyy-MM-dd} Pago={h.FormaPago} NumDoc={h.NumDoc}");
            }
            if (headers.Count == 0) { Log("Sin tickets nuevos."); return; }

            var ids = headers.Select(h => h.CabId).ToHashSet();
            Log("Calculando importes desde detalle.DBF...");
            var sums = new Dictionary<long, decimal>();
            var lineCounts = new Dictionary<long, int>();
            foreach (var r in det.ReadAll())
            {
                var id = r.GetLong("DET_ID");
                if (!ids.Contains(id)) continue;
                var imp = r.GetDecimal("DET_IMPORT");
                sums[id] = sums.GetValueOrDefault(id) + imp;
                lineCounts[id] = lineCounts.GetValueOrDefault(id) + 1;
            }

            var tickets = new List<Dictionary<string, object?>>();
            foreach (var h in headers)
            {
                var total = sums.GetValueOrDefault(h.CabId);
                var tarjeta = h.FormaPago == "T" ? total : (h.FormaPago == "A" ? h.Tarjeta : 0m);
                var cheque = h.Cheque;
                var efectivo = h.FormaPago == "E" ? total : (h.FormaPago == "A" ? Math.Max(0, total - tarjeta - cheque) : 0m);
                tickets.Add(new Dictionary<string, object?>
                {
                    ["cab_id"] = h.CabId,
                    ["fecha"] = h.Fecha?.ToString("yyyy-MM-dd"),
                    ["hora"] = h.Hora?.ToUniversalTime().ToString("O"),
                    ["estado"] = h.Estado,
                    ["forma_pago"] = h.FormaPago,
                    ["numdoc"] = h.NumDoc,
                    ["total"] = total,
                    ["efectivo"] = efectivo,
                    ["tarjeta"] = tarjeta,
                    ["cheque"] = cheque,
                    ["lineas"] = lineCounts.GetValueOrDefault(h.CabId)
                });
            }
            var imported = 0;
            foreach (var batch in tickets.Chunk(_cfg.BatchSize))
            {
                await _supabase.UpsertTickets(batch);
                imported += batch.Length;
                Log($"Tickets enviados: {imported}/{tickets.Count}");
            }
            await _supabase.RefreshDailySales();
            Log($"OK. Importados/actualizados {tickets.Count} tickets. Resumen diario recalculado.");
        }
        catch (Exception ex)
        {
            Log("ERROR: " + ex.Message);
            if (_debug) Console.WriteLine(ex);
        }
    }
}

public sealed class SupabaseRest
{
    private readonly AppConfig _cfg;
    private readonly HttpClient _http = new();
    private readonly JsonSerializerOptions _json = new() { PropertyNamingPolicy = null };
    public SupabaseRest(AppConfig cfg)
    {
        _cfg = cfg;
        if (!cfg.SupabaseUrl.StartsWith("http") || cfg.SupabaseAnonKey.Contains("PEGA_AQUI")) return;
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", cfg.SupabaseAnonKey);
        _http.DefaultRequestHeaders.Add("apikey", cfg.SupabaseAnonKey);
    }
    private string Rest(string path) => _cfg.SupabaseUrl.TrimEnd('/') + "/rest/v1/" + path;
    public async Task<long> GetLastCabId()
    {
        var url = Rest("numier_tickets?select=cab_id&order=cab_id.desc&limit=1");
        var s = await _http.GetStringAsync(url);
        using var doc = JsonDocument.Parse(s);
        if (doc.RootElement.GetArrayLength() == 0) return 0;
        return doc.RootElement[0].GetProperty("cab_id").GetInt64();
    }
    public async Task UpsertSyncFile(string source, string fileName, FileInfo fi)
    {
        var payload = new[] { new Dictionary<string, object?> {
            ["source"] = source, ["file_name"] = fileName, ["file_size"] = fi.Length,
            ["modified_at"] = fi.LastWriteTimeUtc.ToString("O"), ["synced_at"] = DateTime.UtcNow.ToString("O")
        }};
        await Post("numier_sync_files?on_conflict=source,file_name", payload);
    }
    public async Task UpsertTickets(IEnumerable<Dictionary<string, object?>> tickets)
    {
        await Post("numier_tickets?on_conflict=cab_id", tickets);
    }
    public async Task RefreshDailySales()
    {
        var resp = await _http.PostAsync(_cfg.SupabaseUrl.TrimEnd('/') + "/rest/v1/rpc/refresh_numier_daily_sales", new StringContent("{}", Encoding.UTF8, "application/json"));
        if (!resp.IsSuccessStatusCode) throw new Exception("Refresh daily sales: " + await resp.Content.ReadAsStringAsync());
    }
    private async Task Post(string path, object payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, Rest(path));
        req.Headers.Add("Prefer", "resolution=merge-duplicates,return=minimal");
        req.Content = new StringContent(JsonSerializer.Serialize(payload, _json), Encoding.UTF8, "application/json");
        var resp = await _http.SendAsync(req);
        if (!resp.IsSuccessStatusCode) throw new Exception("Supabase " + (int)resp.StatusCode + ": " + await resp.Content.ReadAsStringAsync());
    }
}

public record NumierHeader(long CabId, DateTime? Fecha, DateTime? Hora, string Estado, string FormaPago, string NumDoc, decimal Tarjeta, decimal Cheque)
{
    public static NumierHeader From(DbfRecord r) => new(
        r.GetLong("CAB_ID"), r.GetDate("CAB_FECHA"), r.GetDateTime("CAB_HORA", r.GetDate("CAB_FECHA")),
        r.GetString("CAB_ESTADO"), r.GetString("CAB_COBRO"), r.GetString("CAB_NUMDOC"),
        r.GetDecimal("CAB_ENT_TA"), r.GetDecimal("CAB_ENT_CH"));
}

public sealed class DbfField { public string Name=""; public char Type; public int Length; public int Decimal; public int Offset; }
public sealed class DbfRecord
{
    private readonly Dictionary<string, object?> _v;
    public DbfRecord(Dictionary<string, object?> v) => _v = v;
    public string GetString(string k) => _v.TryGetValue(k, out var x) ? (x?.ToString()?.Trim() ?? "") : "";
    public long GetLong(string k) => long.TryParse(GetString(k), NumberStyles.Any, CultureInfo.InvariantCulture, out var n) ? n : (_v.TryGetValue(k, out var x) && x is int i ? i : 0);
    public decimal GetDecimal(string k) => decimal.TryParse(GetString(k), NumberStyles.Any, CultureInfo.InvariantCulture, out var n) ? n : 0m;
    public DateTime? GetDate(string k) => _v.TryGetValue(k, out var x) && x is DateTime d ? d : null;
    public DateTime? GetDateTime(string k, DateTime? baseDate)
    {
        if (_v.TryGetValue(k, out var x) && x is DateTime d) return d;
        return baseDate;
    }
}
public sealed class DbfTable
{
    public List<DbfField> Fields { get; } = new();
    public int RecordCount { get; private set; }
    private string _path=""; private int _headerLen; private int _recordLen; private Encoding _enc = Encoding.GetEncoding(1252);
    public static DbfTable Open(string path)
    {
        var t = new DbfTable(); t._path = path;
        using var fs = File.OpenRead(path); using var br = new BinaryReader(fs);
        br.ReadByte(); br.ReadBytes(3);
        t.RecordCount = br.ReadInt32(); t._headerLen = br.ReadUInt16(); t._recordLen = br.ReadUInt16(); br.ReadBytes(20);
        int offset = 1;
        while (true)
        {
            var first = br.ReadByte(); if (first == 0x0D) break;
            var nameBytes = new byte[11]; nameBytes[0] = first; br.Read(nameBytes,1,10);
            var name = Encoding.ASCII.GetString(nameBytes).Split('\0')[0].Trim();
            var type = (char)br.ReadByte(); br.ReadBytes(4); var len = br.ReadByte(); var dec = br.ReadByte(); br.ReadBytes(14);
            t.Fields.Add(new DbfField { Name=name, Type=type, Length=len, Decimal=dec, Offset=offset }); offset += len;
        }
        return t;
    }
    public IEnumerable<DbfRecord> ReadAll()
    {
        using var fs = File.OpenRead(_path); fs.Seek(_headerLen, SeekOrigin.Begin); var buf = new byte[_recordLen];
        for (int i=0;i<RecordCount;i++)
        {
            if (fs.Read(buf,0,_recordLen) != _recordLen) yield break;
            if (buf[0] == 0x2A) continue;
            var dict = new Dictionary<string, object?>();
            foreach (var f in Fields)
            {
                var raw = buf.Skip(f.Offset).Take(f.Length).ToArray();
                dict[f.Name] = Parse(f, raw);
            }
            yield return new DbfRecord(dict);
        }
    }
    private object? Parse(DbfField f, byte[] raw)
    {
        if (f.Type == 'I' && raw.Length == 4) return BitConverter.ToInt32(raw,0);
        if (f.Type == 'D')
        {
            var s = Encoding.ASCII.GetString(raw).Trim();
            if (DateTime.TryParseExact(s,"yyyyMMdd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var d)) return d;
            return null;
        }
        if (f.Type == 'T' && raw.Length == 8)
        {
            var days = BitConverter.ToInt32(raw,0); var ms = BitConverter.ToInt32(raw,4);
            if (days > 0) return new DateTime(4713,1,1).AddDays(days - 1721426).AddMilliseconds(ms);
            return null;
        }
        var text = _enc.GetString(raw).Trim();
        return text;
    }
}
