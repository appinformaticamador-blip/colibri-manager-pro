using System.Text;
using System.Text.Json;
using System.Net.Http.Headers;
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
    public string SupabaseUrl { get; set; } = "https://xccyaoziutlxxklcofrw.supabase.co";
    public string SupabaseAnonKey { get; set; } = "PEGA_AQUI_TU_ANON_KEY";
    public string NumierPath { get; set; } = @"C:\NUMIER\DATOS";
    public string[] DbFiles { get; set; } = ["CAB.DBF", "DET.DBF"];
}

public class MainForm : Form
{
    private readonly TextBox _log = new() { Multiline = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill, ReadOnly = true };
    private readonly Button _syncButton = new() { Text = "Sincronizar ahora", Dock = DockStyle.Top, Height = 42 };
    private readonly Button _openConfigButton = new() { Text = "Abrir config.json", Dock = DockStyle.Top, Height = 36 };
    private readonly Label _status = new() { Text = "Colibrí Sync 2.0", Dock = DockStyle.Top, Height = 36, TextAlign = System.Drawing.ContentAlignment.MiddleCenter };
    private readonly string _baseDir = AppContext.BaseDirectory;
    private SyncConfig _config;

    public MainForm()
    {
        Text = "Colibrí Sync 2.0";
        Width = 760;
        Height = 520;
        Controls.Add(_log);
        Controls.Add(_openConfigButton);
        Controls.Add(_syncButton);
        Controls.Add(_status);
        _config = LoadConfig();
        _syncButton.Click += async (_, _) => await SyncNow();
        _openConfigButton.Click += (_, _) => OpenConfig();
        Log("Listo. Ruta NUMIER: " + _config.NumierPath);
    }

    private SyncConfig LoadConfig()
    {
        var path = Path.Combine(_baseDir, "config.json");
        if (!File.Exists(path))
        {
            var cfg = new SyncConfig();
            File.WriteAllText(path, JsonSerializer.Serialize(cfg, new JsonSerializerOptions { WriteIndented = true }), Encoding.UTF8);
            return cfg;
        }
        return JsonSerializer.Deserialize<SyncConfig>(File.ReadAllText(path)) ?? new SyncConfig();
    }

    private void OpenConfig()
    {
        var path = Path.Combine(_baseDir, "config.json");
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
    }

    private async Task SyncNow()
    {
        try
        {
            _syncButton.Enabled = false;
            _config = LoadConfig();
            if (_config.SupabaseAnonKey.Contains("PEGA_AQUI"))
            {
                Log("ERROR: abre config.json y pega tu anon key de Supabase.");
                return;
            }
            if (!Directory.Exists(_config.NumierPath))
            {
                Log("ERROR: no existe la carpeta: " + _config.NumierPath);
                return;
            }
            int total = 0;
            foreach (var fileName in _config.DbFiles)
            {
                var file = Path.Combine(_config.NumierPath, fileName);
                if (!File.Exists(file)) { Log("No encontrado: " + fileName); continue; }
                Log("Leyendo " + fileName + "...");
                var rows = DbfReader.Read(file, maxRows: 5000);
                Log($"{fileName}: {rows.Count} registros leídos.");
                total += await UploadRows(fileName, rows);
            }
            Log($"Sincronización terminada. Registros enviados: {total}");
        }
        catch (Exception ex)
        {
            Log("ERROR: " + ex.Message);
        }
        finally { _syncButton.Enabled = true; }
    }

    private async Task<int> UploadRows(string sourceFile, List<Dictionary<string, object?>> rows)
    {
        using var http = new HttpClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _config.SupabaseAnonKey);
        http.DefaultRequestHeaders.Add("apikey", _config.SupabaseAnonKey);
        http.DefaultRequestHeaders.Add("Prefer", "resolution=merge-duplicates");
        var endpoint = _config.SupabaseUrl.TrimEnd('/') + "/rest/v1/numier_raw_records?on_conflict=source_file,record_index";
        int sent = 0;
        const int chunkSize = 200;
        for (int i = 0; i < rows.Count; i += chunkSize)
        {
            var chunk = rows.Skip(i).Take(chunkSize).Select((r, idx) => new
            {
                source_file = sourceFile,
                record_index = i + idx,
                payload = r,
                synced_at = DateTimeOffset.UtcNow
            }).ToList();
            var json = JsonSerializer.Serialize(chunk);
            var res = await http.PostAsync(endpoint, new StringContent(json, Encoding.UTF8, "application/json"));
            if (!res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync();
                throw new Exception($"Supabase {res.StatusCode}: {body}");
            }
            sent += chunk.Count;
            Log($"Subidos {sent}/{rows.Count} de {sourceFile}");
        }
        return sent;
    }

    private void Log(string text)
    {
        if (InvokeRequired) { Invoke(() => Log(text)); return; }
        _log.AppendText($"[{DateTime.Now:HH:mm:ss}] {text}{Environment.NewLine}");
    }
}

public static class DbfReader
{
    public static List<Dictionary<string, object?>> Read(string path, int maxRows = 10000)
    {
        using var fs = File.OpenRead(path);
        using var br = new BinaryReader(fs, Encoding.ASCII);
        br.ReadByte(); br.ReadBytes(3);
        int recordCount = br.ReadInt32();
        short headerLength = br.ReadInt16();
        short recordLength = br.ReadInt16();
        br.ReadBytes(20);
        var fields = new List<(string Name, char Type, int Length, int Decimals)>();
        while (fs.Position < headerLength - 1)
        {
            var nameBytes = br.ReadBytes(11);
            if (nameBytes[0] == 0x0D) break;
            var name = Encoding.ASCII.GetString(nameBytes).TrimEnd('\0',' ');
            char type = (char)br.ReadByte();
            br.ReadBytes(4);
            int length = br.ReadByte();
            int decimals = br.ReadByte();
            br.ReadBytes(14);
            fields.Add((name, type, length, decimals));
        }
        fs.Position = headerLength;
        var result = new List<Dictionary<string, object?>>();
        int rowsToRead = Math.Min(recordCount, maxRows);
        for (int r = 0; r < rowsToRead; r++)
        {
            if (fs.Position + recordLength > fs.Length) break;
            byte deleted = br.ReadByte();
            var dict = new Dictionary<string, object?>();
            dict["_deleted"] = deleted == (byte)'*';
            foreach (var f in fields)
            {
                var raw = br.ReadBytes(f.Length);
                var s = Encoding.GetEncoding(1252).GetString(raw).Trim();
                dict[f.Name] = ParseValue(s, f.Type);
            }
            result.Add(dict);
        }
        return result;
    }

    private static object? ParseValue(string s, char type)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        if (type == 'N' || type == 'F')
        {
            if (decimal.TryParse(s.Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d)) return d;
        }
        if (type == 'L') return s.Equals("T", StringComparison.OrdinalIgnoreCase) || s.Equals("Y", StringComparison.OrdinalIgnoreCase);
        if (type == 'D' && s.Length == 8 && DateTime.TryParseExact(s, "yyyyMMdd", null, System.Globalization.DateTimeStyles.None, out var dt)) return dt.ToString("yyyy-MM-dd");
        return s;
    }
}
