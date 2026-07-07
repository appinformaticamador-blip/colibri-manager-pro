using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

Console.OutputEncoding = Encoding.UTF8;
Console.WriteLine("🐦 Colibrí Sync 1.0 limpio - NUMIER → Supabase");
Console.WriteLine("------------------------------------------------");

var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
if (!File.Exists(configPath))
{
    var example = Path.Combine(AppContext.BaseDirectory, "config.example.json");
    if (File.Exists(example)) File.Copy(example, configPath);
    Console.WriteLine("Se ha creado config.json. Edítalo con tu anon key y vuelve a abrir el programa.");
    Console.ReadKey();
    return;
}

var config = AppConfig.Load(configPath);
var sync = new NumierSync(config);

Console.WriteLine($"Ruta NUMIER: {config.NumierPath}");
Console.WriteLine($"Archivos: {config.CabeceraFile} / {config.DetalleFile}");
Console.WriteLine($"Auto-sync: cada {config.AutoSyncSeconds}s");
Console.WriteLine("Pulsa S para sincronizar ahora, Q para salir.\n");

await sync.SyncOnceAsync();

var cts = new CancellationTokenSource();
_ = Task.Run(async () =>
{
    while (!cts.Token.IsCancellationRequested)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(config.AutoSyncSeconds), cts.Token);
            await sync.SyncOnceAsync();
        }
        catch (TaskCanceledException) { }
        catch (Exception ex) { Log($"Error auto-sync: {ex.Message}"); }
    }
});

while (true)
{
    var key = Console.ReadKey(true).Key;
    if (key == ConsoleKey.Q) { cts.Cancel(); break; }
    if (key == ConsoleKey.S) await sync.SyncOnceAsync();
}

static void Log(string msg) => Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {msg}");

public sealed class AppConfig
{
    public string NumierPath { get; set; } = @"C:\NUMIER\DATOS";
    public string CabeceraFile { get; set; } = "cabecera.DBF";
    public string DetalleFile { get; set; } = "detalle.DBF";
    public string SupabaseUrl { get; set; } = "";
    public string SupabaseAnonKey { get; set; } = "";
    public int AutoSyncSeconds { get; set; } = 60;
    public int MaxTicketsPerSync { get; set; } = 500;
    public string BusinessName { get; set; } = "Brasería El Colibrí";

    public static AppConfig Load(string path)
    {
        var json = File.ReadAllText(path);
        var doc = JsonDocument.Parse(json).RootElement;
        return new AppConfig
        {
            NumierPath = doc.GetPropertyOrDefault("numier_path", @"C:\NUMIER\DATOS"),
            CabeceraFile = doc.GetPropertyOrDefault("cabecera_file", "cabecera.DBF"),
            DetalleFile = doc.GetPropertyOrDefault("detalle_file", "detalle.DBF"),
            SupabaseUrl = doc.GetPropertyOrDefault("supabase_url", ""),
            SupabaseAnonKey = doc.GetPropertyOrDefault("supabase_anon_key", ""),
            AutoSyncSeconds = doc.GetPropertyOrDefault("auto_sync_seconds", 60),
            MaxTicketsPerSync = doc.GetPropertyOrDefault("max_tickets_per_sync", 500),
            BusinessName = doc.GetPropertyOrDefault("business_name", "Brasería El Colibrí")
        };
    }
}

public static class JsonExt
{
    public static string GetPropertyOrDefault(this JsonElement e, string name, string def) => e.TryGetProperty(name, out var p) ? p.GetString() ?? def : def;
    public static int GetPropertyOrDefault(this JsonElement e, string name, int def) => e.TryGetProperty(name, out var p) && p.TryGetInt32(out var v) ? v : def;
}

public sealed class NumierSync
{
    private readonly AppConfig _cfg;
    private readonly HttpClient _http = new();

    public NumierSync(AppConfig cfg)
    {
        _cfg = cfg;
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", cfg.SupabaseAnonKey);
        _http.DefaultRequestHeaders.Add("apikey", cfg.SupabaseAnonKey);
        _http.DefaultRequestHeaders.Add("Prefer", "resolution=merge-duplicates,return=minimal");
    }

    public async Task SyncOnceAsync()
    {
        try
        {
            Log("Comprobando NUMIER...");
            var cabPath = Path.Combine(_cfg.NumierPath, _cfg.CabeceraFile);
            var detPath = Path.Combine(_cfg.NumierPath, _cfg.DetalleFile);
            if (!File.Exists(cabPath)) { Log($"No encuentro cabecera: {cabPath}"); return; }
            if (!File.Exists(detPath)) { Log($"No encuentro detalle: {detPath}"); return; }

            await RegisterFileAsync(cabPath);
            await RegisterFileAsync(detPath);

            var cab = DbfTable.Read(cabPath);
            var det = DbfTable.Read(detPath, maxRows: 0); // por ahora solo esquema del detalle; líneas en v1.1
            await UpsertSchemaAsync("cabecera", cab.Fields);
            await UpsertSchemaAsync("detalle", det.Fields);

            var idField = Pick(cab.Fields, "CAB_ID", "ID", "CABID");
            if (idField is null) { Log("No encuentro campo CAB_ID/ID en cabecera. Esquema enviado a Supabase."); return; }

            var lastId = await GetLastCabIdAsync();
            var newRows = cab.Rows
                .Where(r => ToLong(r.GetValueOrDefault(idField)) > lastId)
                .OrderBy(r => ToLong(r.GetValueOrDefault(idField)))
                .Take(_cfg.MaxTicketsPerSync)
                .ToList();

            Log($"Último CAB_ID en Supabase: {lastId}. Nuevos detectados: {newRows.Count}");
            if (newRows.Count == 0) { Log("Sin tickets nuevos."); return; }

            var payload = newRows.Select(r => MapTicket(r, idField)).ToList();
            await PostJsonAsync("numier_tickets?on_conflict=cab_id", payload);
            await RebuildDailySalesAsync();
            Log($"Tickets enviados: {payload.Count}");
        }
        catch (Exception ex)
        {
            Log($"ERROR: {ex.Message}");
        }
    }

    private Dictionary<string, object?> MapTicket(Dictionary<string, string?> r, string idField)
    {
        var fechaRaw = First(r, "CAB_FECHA", "FECHA", "FEC", "CAB_FEC");
        var horaRaw = First(r, "CAB_HORA", "HORA", "FECHAHORA", "CAB_FH");
        var totalRaw = First(r, "CAB_TOTAL", "TOTAL", "IMPORTE", "TOTALIVA", "CAB_TOT");
        var fpRaw = First(r, "CAB_PAGO", "FPAGO", "FORMA_PAGO", "PAGO", "CAB_FP");
        var estadoRaw = First(r, "CAB_ESTADO", "ESTADO", "SITUACION");
        var numdocRaw = First(r, "NUMDOC", "DOCUMENTO", "TICKET", "SERIE");

        var cabId = ToLong(r.GetValueOrDefault(idField));
        var total = ToDecimal(totalRaw);
        var fp = (fpRaw ?? "").Trim().ToUpperInvariant();
        decimal efectivo = 0, tarjeta = 0, cheque = 0;
        if (fp == "E") efectivo = total;
        else if (fp == "T") tarjeta = total;
        else if (fp == "C" || fp == "CH") cheque = total;

        var fecha = ParseDate(fechaRaw, horaRaw);
        return new Dictionary<string, object?>
        {
            ["cab_id"] = cabId,
            ["fecha"] = fecha?.ToString("yyyy-MM-dd"),
            ["hora"] = fecha?.ToString("o"),
            ["estado"] = estadoRaw,
            ["forma_pago"] = fpRaw,
            ["numdoc"] = numdocRaw,
            ["total"] = total,
            ["efectivo"] = efectivo,
            ["tarjeta"] = tarjeta,
            ["cheque"] = cheque,
            ["raw_json"] = r
        };
    }

    private async Task RegisterFileAsync(string path)
    {
        var fi = new FileInfo(path);
        var payload = new [] { new Dictionary<string, object?> {
            ["source"] = "numier",
            ["file_name"] = fi.Name,
            ["file_size"] = fi.Length,
            ["modified_at"] = fi.LastWriteTimeUtc.ToString("o"),
            ["synced_at"] = DateTime.UtcNow.ToString("o")
        }};
        await PostJsonAsync("numier_sync_files?on_conflict=source,file_name", payload);
    }

    private async Task UpsertSchemaAsync(string table, List<DbfField> fields)
    {
        var payload = fields.Select(f => new Dictionary<string, object?> {
            ["source"] = "numier",
            ["dbf_table"] = table,
            ["field_name"] = f.Name,
            ["field_type"] = f.Type.ToString(),
            ["field_length"] = f.Length,
            ["field_decimal"] = f.DecimalCount
        }).ToList();
        await PostJsonAsync("numier_dbf_schema?on_conflict=source,dbf_table,field_name", payload);
    }

    private async Task<long> GetLastCabIdAsync()
    {
        var url = $"{_cfg.SupabaseUrl.TrimEnd('/')}/rest/v1/numier_tickets?select=cab_id&order=cab_id.desc&limit=1";
        var res = await _http.GetAsync(url);
        var txt = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode) throw new Exception($"Supabase GET last cab_id: {txt}");
        var arr = JsonDocument.Parse(txt).RootElement;
        if (arr.GetArrayLength() == 0) return 0;
        return arr[0].GetProperty("cab_id").GetInt64();
    }

    private async Task RebuildDailySalesAsync()
    {
        var rpc = $"{_cfg.SupabaseUrl.TrimEnd('/')}/rest/v1/rpc/rebuild_numier_daily_sales";
        var res = await _http.PostAsync(rpc, new StringContent("{}", Encoding.UTF8, "application/json"));
        var txt = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode) Log($"Aviso: no se pudo recalcular ventas diarias: {txt}");
    }

    private async Task PostJsonAsync(string endpoint, object payload)
    {
        var url = $"{_cfg.SupabaseUrl.TrimEnd('/')}/rest/v1/{endpoint}";
        var json = JsonSerializer.Serialize(payload);
        var res = await _http.PostAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));
        var txt = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode) throw new Exception($"Supabase POST {endpoint}: {txt}");
    }

    static string? Pick(List<DbfField> fields, params string[] names) => names.FirstOrDefault(n => fields.Any(f => f.Name.Equals(n, StringComparison.OrdinalIgnoreCase)));
    static string? First(Dictionary<string,string?> r, params string[] names) => names.Select(n => r.FirstOrDefault(kv => kv.Key.Equals(n, StringComparison.OrdinalIgnoreCase)).Value).FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
    static long ToLong(string? s) => long.TryParse((s ?? "").Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : 0;
    static decimal ToDecimal(string? s) { var x=(s??"").Trim().Replace(",", "."); return decimal.TryParse(x, NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : 0; }
    static DateTime? ParseDate(string? fecha, string? hora)
    {
        var s = ((fecha ?? "") + " " + (hora ?? "")).Trim();
        string[] formats = {"yyyy-MM-dd HH:mm:ss", "dd/MM/yyyy HH:mm:ss", "yyyyMMdd HHmmss", "yyyyMMdd", "dd/MM/yyyy", "yyyy-MM-dd"};
        if (DateTime.TryParseExact(s, formats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dt)) return dt;
        if (DateTime.TryParse(s, out dt)) return dt;
        return null;
    }
    static void Log(string msg) => Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {msg}");
}

public record DbfField(string Name, char Type, int Length, int DecimalCount);
public sealed class DbfTable
{
    public List<DbfField> Fields { get; } = new();
    public List<Dictionary<string, string?>> Rows { get; } = new();

    public static DbfTable Read(string path, int? maxRows = null)
    {
        using var fs = File.OpenRead(path);
        using var br = new BinaryReader(fs, Encoding.GetEncoding(1252));
        br.ReadByte(); br.ReadBytes(3);
        var rowCount = br.ReadInt32();
        var headerLen = br.ReadInt16();
        var recordLen = br.ReadInt16();
        br.ReadBytes(20);

        var t = new DbfTable();
        while (fs.Position < headerLen - 1)
        {
            var first = br.ReadByte();
            if (first == 0x0D) break;
            var nameBytes = new byte[11]; nameBytes[0] = first; br.Read(nameBytes, 1, 10);
            var name = Encoding.ASCII.GetString(nameBytes).TrimEnd('\0', ' ');
            var type = (char)br.ReadByte();
            br.ReadBytes(4);
            var len = br.ReadByte();
            var dec = br.ReadByte();
            br.ReadBytes(14);
            if (!string.IsNullOrWhiteSpace(name)) t.Fields.Add(new DbfField(name, type, len, dec));
        }
        fs.Position = headerLen;
        var rowsToRead = maxRows.HasValue ? Math.Min(rowCount, maxRows.Value) : rowCount;
        var enc = Encoding.GetEncoding(1252);
        for (int i = 0; i < rowsToRead; i++)
        {
            var rec = br.ReadBytes(recordLen);
            if (rec.Length < recordLen) break;
            if (rec[0] == 0x2A) continue;
            int offset = 1;
            var row = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            foreach (var f in t.Fields)
            {
                var raw = enc.GetString(rec, offset, f.Length).Trim();
                row[f.Name] = raw.Length == 0 ? null : raw;
                offset += f.Length;
            }
            t.Rows.Add(row);
        }
        return t;
    }
}
