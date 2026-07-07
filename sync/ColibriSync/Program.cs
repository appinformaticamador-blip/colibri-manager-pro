using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

namespace ColibriSync;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

public class SyncConfig
{
    public string numier_path { get; set; } = @"C:\NUMIER\DATOS";
    public string cabecera_file { get; set; } = "cabecera.DBF";
    public string detalle_file { get; set; } = "detalle.DBF";
    public string supabase_url { get; set; } = "";
    public string supabase_anon_key { get; set; } = "";
    public int auto_sync_seconds { get; set; } = 60;
    public int initial_import_days { get; set; } = 7;
    public int max_tickets_per_sync { get; set; } = 2000;
}

public class MainForm : Form
{
    private readonly TextBox log = new() { Multiline = true, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical, ReadOnly = true };
    private readonly Button syncButton = new() { Text = "Sincronizar ahora", Dock = DockStyle.Top, Height = 34 };
    private readonly Button configButton = new() { Text = "Abrir config.json", Dock = DockStyle.Top, Height = 34 };
    private readonly string configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
    private SyncConfig config = new();
    private System.Windows.Forms.Timer timer = new();
    private bool syncing = false;

    public MainForm()
    {
        Text = "Colibrí Sync 3.0 · NUMIER Import";
        Width = 860; Height = 560;
        Controls.Add(log); Controls.Add(configButton); Controls.Add(syncButton);
        syncButton.Click += async (_, _) => await SyncNow(false);
        configButton.Click += (_, _) => OpenConfig();
        LoadConfig();
        timer.Interval = Math.Max(30, config.auto_sync_seconds) * 1000;
        timer.Tick += async (_, _) => await SyncNow(true);
        timer.Start();
        Log("Listo. Ruta NUMIER: " + config.numier_path);
        Log("Archivos: " + config.cabecera_file + " / " + config.detalle_file);
        Log($"Auto-sync: activo cada {Math.Max(30, config.auto_sync_seconds)}s");
    }

    private void LoadConfig()
    {
        try
        {
            if (!File.Exists(configPath))
            {
                var example = Path.Combine(AppContext.BaseDirectory, "config.example.json");
                if (File.Exists(example)) File.Copy(example, configPath);
                else File.WriteAllText(configPath, JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }));
            }
            config = JsonSerializer.Deserialize<SyncConfig>(File.ReadAllText(configPath)) ?? new SyncConfig();
        }
        catch (Exception ex) { Log("Error cargando config: " + ex.Message); }
    }

    private void OpenConfig()
    {
        LoadConfig();
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(configPath) { UseShellExecute = true });
    }

    private async Task SyncNow(bool auto)
    {
        if (syncing) return;
        syncing = true;
        try
        {
            LoadConfig();
            var cabPath = Path.Combine(config.numier_path, config.cabecera_file);
            var detPath = Path.Combine(config.numier_path, config.detalle_file);
            if (!Directory.Exists(config.numier_path)) { Log("ERROR: No existe la ruta NUMIER."); return; }
            if (!File.Exists(cabPath)) { Log("No encontrado: " + config.cabecera_file); return; }
            if (!File.Exists(detPath)) { Log("No encontrado: " + config.detalle_file); return; }
            if (!HasSupabase()) { Log("Supabase no configurado. Edita config.json."); return; }

            var cabInfo = new FileInfo(cabPath); var detInfo = new FileInfo(detPath);
            if (!auto) Log($"OK cabecera: {cabInfo.Length:N0} bytes · detalle: {detInfo.Length:N0} bytes");

            using var http = NewHttp();
            await RegisterFiles(http, cabInfo, detInfo);
            var lastCabId = await GetLastCabId(http);
            var headers = Dbf.Read(cabPath);
            var headerRows = headers.Rows
                .Select(r => MapHeader(r))
                .Where(t => t.CabId > 0 && t.Estado == "C")
                .Where(t => lastCabId > 0 ? t.CabId > lastCabId : t.Fecha >= DateTime.Today.AddDays(-Math.Max(1, config.initial_import_days)))
                .OrderBy(t => t.CabId)
                .Take(Math.Max(100, config.max_tickets_per_sync))
                .ToList();

            if (headerRows.Count == 0) { Log(auto ? "Auto-sync: sin tickets nuevos." : "Sin tickets nuevos."); return; }
            Log($"Tickets a importar: {headerRows.Count} (desde CAB_ID {headerRows.First().CabId} hasta {headerRows.Last().CabId})");

            var ids = headerRows.Select(t => t.CabId).ToHashSet();
            var detailRows = new List<LineRow>();
            foreach (var r in Dbf.ReadRows(detPath))
            {
                var line = MapLine(r);
                if (ids.Contains(line.CabId)) detailRows.Add(line);
            }

            var sums = detailRows.GroupBy(l => l.CabId).ToDictionary(g => g.Key, g => Math.Round(g.Sum(x => x.Importe), 2));
            foreach (var t in headerRows)
            {
                t.Total = sums.TryGetValue(t.CabId, out var total) ? total : 0m;
                if (t.FormaPago == "T") t.Tarjeta = t.Total;
                else if (t.FormaPago == "E") t.Efectivo = t.Total;
                else if (t.FormaPago == "A") { t.Tarjeta = Math.Min(t.Total, t.TarjetaDeclarada); t.Cheque = t.ChequeDeclarado; t.Efectivo = Math.Max(0, t.Total - t.Tarjeta - t.Cheque); }
                else t.Efectivo = t.Total;
            }

            await UpsertTickets(http, headerRows);
            await UpsertLines(http, detailRows);
            foreach (var f in headerRows.Select(h => h.Fecha.Date).Distinct()) await RefreshDaily(http, f);
            Log($"Importación OK: {headerRows.Count} tickets · {detailRows.Count} líneas.");
        }
        catch (Exception ex) { Log("ERROR: " + ex.Message); }
        finally { syncing = false; }
    }

    private bool HasSupabase() => !string.IsNullOrWhiteSpace(config.supabase_url) && !string.IsNullOrWhiteSpace(config.supabase_anon_key) && !config.supabase_anon_key.Contains("PEGA_AQUI");
    private HttpClient NewHttp()
    {
        var h = new HttpClient();
        h.DefaultRequestHeaders.Add("apikey", config.supabase_anon_key);
        h.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", config.supabase_anon_key);
        return h;
    }
    private string Rest(string path) => config.supabase_url.TrimEnd('/') + "/rest/v1/" + path;

    private async Task RegisterFiles(HttpClient http, FileInfo cab, FileInfo det)
    {
        var payload = new[] {
            new { source="numier", file_name=config.cabecera_file, file_size=cab.Length, modified_at=cab.LastWriteTimeUtc.ToString("O"), synced_at=DateTime.UtcNow.ToString("O") },
            new { source="numier", file_name=config.detalle_file, file_size=det.Length, modified_at=det.LastWriteTimeUtc.ToString("O"), synced_at=DateTime.UtcNow.ToString("O") }
        };
        await PostJson(http, Rest("numier_sync_files"), payload, false);
    }

    private async Task<long> GetLastCabId(HttpClient http)
    {
        var res = await http.GetAsync(Rest("numier_tickets?select=cab_id&order=cab_id.desc&limit=1"));
        if (!res.IsSuccessStatusCode) return 0;
        var txt = await res.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(txt);
        if (doc.RootElement.GetArrayLength() == 0) return 0;
        return doc.RootElement[0].GetProperty("cab_id").GetInt64();
    }

    private async Task UpsertTickets(HttpClient http, List<TicketRow> tickets)
    {
        var payload = tickets.Select(t => new {
            cab_id=t.CabId, numdoc=t.Numdoc, fecha=t.Fecha.ToString("yyyy-MM-dd"), hora=t.Hora?.ToUniversalTime().ToString("O"),
            estado=t.Estado, forma_pago=t.FormaPago, total=t.Total, efectivo=t.Efectivo, tarjeta=t.Tarjeta, cheque=t.Cheque,
            mesa=t.Mesa, comensales=t.Comensales,
            raw=new { cab_ent_ta=t.TarjetaDeclarada, cab_ent_ch=t.ChequeDeclarado }
        }).ToList();
        await PostJson(http, Rest("numier_tickets?on_conflict=cab_id"), payload, true);
    }

    private async Task UpsertLines(HttpClient http, List<LineRow> lines)
    {
        const int chunk = 1000;
        for (int i = 0; i < lines.Count; i += chunk)
        {
            var payload = lines.Skip(i).Take(chunk).Select(l => new {
                cab_id=l.CabId, line_hash=l.LineHash, articulo=l.Articulo, cantidad=l.Cantidad, importe=l.Importe,
                precio=l.Precio, iva=l.Iva, descripcion=l.Descripcion
            }).ToList();
            await PostJson(http, Rest("numier_ticket_lines?on_conflict=cab_id,line_hash"), payload, true);
        }
    }

    private async Task RefreshDaily(HttpClient http, DateTime fecha)
    {
        var payload = new { p_fecha = fecha.ToString("yyyy-MM-dd") };
        await PostJson(http, config.supabase_url.TrimEnd('/') + "/rest/v1/rpc/refresh_numier_daily_sales", payload, false);
    }

    private async Task PostJson(HttpClient http, string url, object payload, bool upsert)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        if (upsert) req.Headers.Add("Prefer", "resolution=merge-duplicates,return=minimal");
        else req.Headers.Add("Prefer", "return=minimal");
        var res = await http.SendAsync(req);
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode) throw new Exception($"Supabase {res.StatusCode}: {body}");
    }

    private TicketRow MapHeader(Dictionary<string, object?> r)
    {
        var fecha = ParseDate(r.Get("CAB_FECHA"));
        var hora = ParseTimestamp(r.Get("CAB_HORA"));
        return new TicketRow {
            CabId = Convert.ToInt64(r.Get("CAB_ID") ?? 0),
            Fecha = fecha,
            Hora = hora ?? fecha,
            Estado = (r.Get("CAB_ESTADO")?.ToString() ?? "").Trim(),
            FormaPago = (r.Get("CAB_COBRO")?.ToString() ?? "").Trim(),
            Numdoc = (r.Get("CAB_NUMDOC")?.ToString() ?? "").Trim(),
            TarjetaDeclarada = ToDec(r.Get("CAB_ENT_TA")), ChequeDeclarado = ToDec(r.Get("CAB_ENT_CH")),
            Mesa = ToDec(r.Get("CAB_MESA")), Comensales = ToDec(r.Get("CAB_COMENS"))
        };
    }
    private LineRow MapLine(Dictionary<string, object?> r)
    {
        var cabId = Convert.ToInt64(ToDec(r.Get("DET_ID")));
        var art = (r.Get("DET_ARTICU")?.ToString() ?? "").Trim();
        var cant = ToDec(r.Get("DET_CANTID")); var imp = ToDec(r.Get("DET_IMPORT")); var precio = ToDec(r.Get("DET_PRECIO")); var iva = ToDec(r.Get("DET_TIPO_I"));
        var desc = (r.Get("DET_CAD_PR")?.ToString() ?? "").Trim();
        var raw = $"{cabId}|{art}|{cant}|{imp}|{precio}|{desc}|{r.Get("DET_ORDEN")}";
        return new LineRow { CabId=cabId, Articulo=art, Cantidad=cant, Importe=imp, Precio=precio, Iva=iva, Descripcion=desc, LineHash=Hash(raw) };
    }
    private static decimal ToDec(object? v) => v == null ? 0m : Convert.ToDecimal(v, CultureInfo.InvariantCulture);
    private static DateTime ParseDate(object? v)
    {
        var s = (v?.ToString() ?? "").Trim();
        return DateTime.TryParseExact(s, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : DateTime.Today;
    }
    private static DateTime? ParseTimestamp(object? v)
    {
        if (v is DbfTimestamp ts) return ts.ToDateTime();
        return null;
    }
    private static string Hash(string s) => Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();
    private void Log(string msg) => log.AppendText($"[{DateTime.Now:HH:mm:ss}] {msg}{Environment.NewLine}");
}

public record TicketRow { public long CabId; public DateTime Fecha; public DateTime? Hora; public string Estado=""; public string FormaPago=""; public string Numdoc=""; public decimal Total; public decimal Efectivo; public decimal Tarjeta; public decimal Cheque; public decimal TarjetaDeclarada; public decimal ChequeDeclarado; public decimal Mesa; public decimal Comensales; }
public record LineRow { public long CabId; public string LineHash=""; public string Articulo=""; public decimal Cantidad; public decimal Importe; public decimal Precio; public decimal Iva; public string Descripcion=""; }

public record DbfTimestamp(int JulianDay, int Milliseconds)
{
    public DateTime ToDateTime()
    {
        var l = JulianDay + 68569; var n = 4 * l / 146097; l = l - (146097 * n + 3) / 4;
        var i = 4000 * (l + 1) / 1461001; l = l - 1461 * i / 4 + 31;
        var j = 80 * l / 2447; var day = l - 2447 * j / 80; l = j / 11;
        var month = j + 2 - 12 * l; var year = 100 * (n - 49) + i + l;
        return new DateTime(year, month, day).AddMilliseconds(Milliseconds);
    }
}

public static class DictExt { public static object? Get(this Dictionary<string, object?> d, string k) => d.TryGetValue(k, out var v) ? v : null; }

public class Dbf
{
    public List<Dictionary<string, object?>> Rows { get; set; } = new();
    public static Dbf Read(string path) => new() { Rows = ReadRows(path).ToList() };
    public static IEnumerable<Dictionary<string, object?>> ReadRows(string path)
    {
        using var fs = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var br = new BinaryReader(fs, Encoding.GetEncoding("ISO-8859-1"));
        fs.Seek(4, SeekOrigin.Begin); var count = br.ReadInt32(); var headerLen = br.ReadUInt16(); var recLen = br.ReadUInt16();
        fs.Seek(32, SeekOrigin.Begin);
        var fields = new List<Field>(); int offset = 1;
        while (true)
        {
            var desc = br.ReadBytes(32); if (desc.Length < 32 || desc[0] == 0x0D) break;
            var name = Encoding.GetEncoding("ISO-8859-1").GetString(desc,0,11).Split('\0')[0].Trim();
            var type = (char)desc[11]; var len = desc[16]; var dec = desc[17]; fields.Add(new Field(name,type,len,dec,offset)); offset += len;
        }
        fs.Seek(headerLen, SeekOrigin.Begin);
        for (int i=0; i<count; i++)
        {
            var rec = br.ReadBytes(recLen); if (rec.Length < recLen) yield break; if (rec[0] == (byte)'*') continue;
            var row = new Dictionary<string, object?>();
            foreach (var f in fields)
            {
                var raw = rec.Skip(f.Offset).Take(f.Length).ToArray();
                row[f.Name] = Parse(raw, f.Type, f.Decimals);
            }
            yield return row;
        }
    }
    private static object? Parse(byte[] raw, char type, int dec)
    {
        var enc = Encoding.GetEncoding("ISO-8859-1");
        if (type == 'C' || type == 'M') return enc.GetString(raw).Trim();
        if (type == 'D') return enc.GetString(raw).Trim();
        if (type == 'N' || type == 'F') { var s = enc.GetString(raw).Trim().Replace(',', '.'); return decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : null; }
        if (type == 'I' && raw.Length >= 4) return BitConverter.ToInt32(raw,0);
        if (type == 'L') return raw.Length > 0 && (raw[0] == 'T' || raw[0] == 't' || raw[0] == 'Y' || raw[0] == 'y');
        if (type == 'T' && raw.Length >= 8) return new DbfTimestamp(BitConverter.ToInt32(raw,0), BitConverter.ToInt32(raw,4));
        return enc.GetString(raw).Trim();
    }
    record Field(string Name, char Type, int Length, int Decimals, int Offset);
}
