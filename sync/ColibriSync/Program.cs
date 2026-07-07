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
    public string sync_mode { get; set; } = "raw_metadata";
    public bool auto_sync { get; set; } = true;
    public int interval_seconds { get; set; } = 60;
}

public class MainForm : Form
{
    private readonly TextBox log = new() { Multiline = true, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical, ReadOnly = true };
    private readonly Button syncButton = new() { Text = "Sincronizar ahora", Dock = DockStyle.Top, Height = 34 };
    private readonly Button autoButton = new() { Text = "Pausar automático", Dock = DockStyle.Top, Height = 34 };
    private readonly Button configButton = new() { Text = "Abrir config.json", Dock = DockStyle.Top, Height = 34 };
    private readonly System.Windows.Forms.Timer autoTimer = new();
    private bool autoEnabled = true;
    private bool syncing = false;
    private readonly string configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
    private SyncConfig config = new();

    public MainForm()
    {
        Text = "Colibrí Sync 2.2";
        Width = 760;
        Height = 520;
        Controls.Add(log);
        Controls.Add(configButton);
        Controls.Add(autoButton);
        Controls.Add(syncButton);
        syncButton.Click += async (_, _) => await SyncNow();
        autoButton.Click += (_, _) => ToggleAuto();
        configButton.Click += (_, _) => OpenConfig();
        LoadConfig();
        autoEnabled = config.auto_sync;
        autoTimer.Tick += async (_, _) => { if (autoEnabled && !syncing) await SyncNow(true); };
        autoTimer.Interval = Math.Max(10, config.interval_seconds) * 1000;
        autoTimer.Start();
        autoButton.Text = autoEnabled ? "Pausar automático" : "Activar automático";
        Log("Listo. Ruta NUMIER: " + config.numier_path);
        Log("Archivos: " + config.cabecera_file + " / " + config.detalle_file);
        Log("Auto-sync: " + (autoEnabled ? $"activo cada {config.interval_seconds}s" : "pausado"));
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

    private void ToggleAuto()
    {
        autoEnabled = !autoEnabled;
        autoButton.Text = autoEnabled ? "Pausar automático" : "Activar automático";
        Log("Auto-sync " + (autoEnabled ? "activado" : "pausado"));
    }

    private async Task SyncNow(bool automatic=false)
    {
        if (syncing) return;
        syncing = true;
        LoadConfig();
        try
        {
            var cab = Path.Combine(config.numier_path, config.cabecera_file);
            var det = Path.Combine(config.numier_path, config.detalle_file);
            Log((automatic?"Auto: ":"") + "Comprobando ruta: " + config.numier_path);
            if (!Directory.Exists(config.numier_path)) { Log("ERROR: No existe la ruta NUMIER."); return; }
            if (!File.Exists(cab)) { Log("No encontrado: " + config.cabecera_file); return; }
            if (!File.Exists(det)) { Log("No encontrado: " + config.detalle_file); return; }

            var cabInfo = new FileInfo(cab);
            var detInfo = new FileInfo(det);
            Log($"OK cabecera: {cabInfo.Length:N0} bytes · modificado {cabInfo.LastWriteTime}");
            Log($"OK detalle: {detInfo.Length:N0} bytes · modificado {detInfo.LastWriteTime}");

            if (string.IsNullOrWhiteSpace(config.supabase_url) || string.IsNullOrWhiteSpace(config.supabase_anon_key) || config.supabase_anon_key.Contains("PEGA_AQUI"))
            {
                Log("Supabase no configurado. Edita config.json.");
                return;
            }

            using var http = new HttpClient();
            http.DefaultRequestHeaders.Add("apikey", config.supabase_anon_key);
            http.DefaultRequestHeaders.Add("Authorization", "Bearer " + config.supabase_anon_key);
            var payload = new[] {
                new { source="numier", file_name=config.cabecera_file, file_size=cabInfo.Length, modified_at=cabInfo.LastWriteTimeUtc.ToString("O"), synced_at=DateTime.UtcNow.ToString("O") },
                new { source="numier", file_name=config.detalle_file, file_size=detInfo.Length, modified_at=detInfo.LastWriteTimeUtc.ToString("O"), synced_at=DateTime.UtcNow.ToString("O") }
            };
            var url = config.supabase_url.TrimEnd('/') + "/rest/v1/numier_sync_files?on_conflict=file_name";
            var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.Add("Prefer", "resolution=merge-duplicates");
            req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var res = await http.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();
            Log(res.IsSuccessStatusCode ? "Sincronización registrada en Supabase." : "Error Supabase: " + res.StatusCode + " " + body);
        }
        catch (Exception ex) { Log("ERROR: " + ex); }
        finally { syncing = false; }
    }

    private void Log(string msg) => log.AppendText($"[{DateTime.Now:HH:mm:ss}] {msg}{Environment.NewLine}");
}
