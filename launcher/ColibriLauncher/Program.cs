using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace ColibriLauncher;

internal sealed class LauncherConfig
{
    public string NumierExe { get; set; } = @"C:\NUMIER\NUMIER.EXE";
    public string SyncExe { get; set; } = @"C:\ColibriERP\ColibriSync.exe";
    public string? SyncWorkingDirectory { get; set; } = @"C:\ColibriERP";
    public int WatchIntervalSeconds { get; set; } = 12;
    public int HeartbeatSeconds { get; set; } = 30;
    public bool KeepNumierRunning { get; set; } = true;
    public bool KeepSyncRunning { get; set; } = true;
    public bool StartSyncHidden { get; set; } = true;
    public bool StartWithWindows { get; set; } = true;
    public string MaintenanceFlag { get; set; } = @"C:\ColibriERP\maintenance.pause";
    public string LogFile { get; set; } = @"C:\ProgramData\ColibriERP\Logs\guardian.log";
    public string SupabaseUrl { get; set; } = "";
    public string SupabaseAnonKey { get; set; } = "";
    public string BusinessName { get; set; } = "Brasería El Colibrí";
    public string EquipmentName { get; set; } = "TPV Barra";
}

internal static class Program
{
    private const string MutexName = @"Global\ColibriERP_Guardian_SingleInstance";
    private static DateTime _startedAt = DateTime.UtcNow;
    private static DateTime? _lastSyncRestart;
    private static DateTime? _lastNumierRestart;
    private static string? _lastError;

    [STAThread]
    private static async Task Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, MutexName, out var isFirstInstance);
        if (!isFirstInstance) return;

        var baseDir = AppContext.BaseDirectory;
        var config = LoadConfig(baseDir);
        EnsureLogDirectory(config.LogFile);
        Log(config, "Colibrí Guardian iniciado.");

        try
        {
            config.SyncExe = ResolveExecutable(config.SyncExe, baseDir,
                "ColibriSync.exe", "ColibriEngine.exe", @"C:\ColibriERP\ColibriSync.exe", @"C:\ColibriERP\ColibriEngine.exe");
            config.NumierExe = ResolveExecutable(config.NumierExe, baseDir,
                "NUMIER.EXE", @"C:\NUMIER\NUMIER.EXE", @"C:\NUMIER\Numier.exe");

            if (!File.Exists(config.SyncExe))
                throw new FileNotFoundException("No se encuentra el ejecutable de Colibrí Sync.", config.SyncExe);
            if (!File.Exists(config.NumierExe))
                throw new FileNotFoundException("No se encuentra NUMIER.EXE.", config.NumierExe);

            if (config.StartWithWindows) TryInstallAutoStart(config, baseDir);

            var watch = TimeSpan.FromSeconds(Math.Clamp(config.WatchIntervalSeconds, 5, 300));
            var heartbeat = TimeSpan.FromSeconds(Math.Clamp(config.HeartbeatSeconds, 15, 300));
            var nextHeartbeat = DateTime.MinValue;

            while (true)
            {
                if (File.Exists(config.MaintenanceFlag))
                {
                    await SendHeartbeat(config, "MAINTENANCE", false, false, "Modo mantenimiento activo");
                    await Task.Delay(watch);
                    continue;
                }

                bool syncRunning = FindProcessByExecutable(config.SyncExe) is not null;
                bool numierRunning = FindProcessByExecutable(config.NumierExe) is not null;

                if (!syncRunning && config.KeepSyncRunning)
                {
                    syncRunning = StartSync(config);
                    _lastSyncRestart = DateTime.UtcNow;
                }

                if (!numierRunning && config.KeepNumierRunning)
                {
                    numierRunning = StartNumier(config);
                    _lastNumierRestart = DateTime.UtcNow;
                }

                if (DateTime.UtcNow >= nextHeartbeat)
                {
                    await SendHeartbeat(config, syncRunning && numierRunning ? "ONLINE" : "DEGRADED",
                        syncRunning, numierRunning, _lastError);
                    nextHeartbeat = DateTime.UtcNow.Add(heartbeat);
                }

                await Task.Delay(watch);
            }
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            Log(config, "ERROR CRÍTICO: " + ex);
            await SendHeartbeat(config, "ERROR", false, false, ex.Message);
            ShowError("Colibrí Guardian encontró un error. Revisa " + config.LogFile);
        }
    }

    private static bool StartSync(LauncherConfig config)
    {
        try
        {
            var workingDir = !string.IsNullOrWhiteSpace(config.SyncWorkingDirectory)
                ? config.SyncWorkingDirectory!
                : Path.GetDirectoryName(config.SyncExe)!;
            var psi = new ProcessStartInfo
            {
                FileName = config.SyncExe,
                WorkingDirectory = Directory.Exists(workingDir) ? workingDir : Path.GetDirectoryName(config.SyncExe)!,
                UseShellExecute = !config.StartSyncHidden,
                CreateNoWindow = config.StartSyncHidden,
                WindowStyle = config.StartSyncHidden ? ProcessWindowStyle.Hidden : ProcessWindowStyle.Minimized
            };
            var p = Process.Start(psi);
            Log(config, p is null ? "ERROR: no se pudo iniciar Sync." : $"Sync iniciado/reiniciado. PID {p.Id}.");
            _lastError = p is null ? "No se pudo iniciar Sync" : null;
            return p is not null;
        }
        catch (Exception ex)
        {
            _lastError = "Sync: " + ex.Message;
            Log(config, "ERROR iniciando Sync: " + ex);
            return false;
        }
    }

    private static bool StartNumier(LauncherConfig config)
    {
        try
        {
            var p = Process.Start(new ProcessStartInfo
            {
                FileName = config.NumierExe,
                WorkingDirectory = Path.GetDirectoryName(config.NumierExe)!,
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Normal
            });
            Log(config, p is null ? "ERROR: no se pudo iniciar NUMIER." : $"NUMIER iniciado/reiniciado. PID {p.Id}.");
            _lastError = p is null ? "No se pudo iniciar NUMIER" : null;
            return p is not null;
        }
        catch (Exception ex)
        {
            _lastError = "NUMIER: " + ex.Message;
            Log(config, "ERROR iniciando NUMIER: " + ex);
            return false;
        }
    }

    private static async Task SendHeartbeat(LauncherConfig c, string state, bool syncRunning, bool numierRunning, string? error)
    {
        if (string.IsNullOrWhiteSpace(c.SupabaseUrl) || string.IsNullOrWhiteSpace(c.SupabaseAnonKey)) return;
        try
        {
            using var http = new HttpClient { BaseAddress = new Uri(c.SupabaseUrl.TrimEnd('/') + "/rest/v1/") };
            http.DefaultRequestHeaders.Add("apikey", c.SupabaseAnonKey);
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", c.SupabaseAnonKey);
            var payload = new[]
            {
                new
                {
                    status_key = "guardian",
                    component = "guardian",
                    business_name = c.BusinessName,
                    machine_name = Environment.MachineName,
                    equipment_name = c.EquipmentName,
                    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "3.9.0",
                    state,
                    process_running = true,
                    sync_running = syncRunning,
                    numier_running = numierRunning,
                    internet_ok = true,
                    last_error = error,
                    started_at = _startedAt.ToString("O"),
                    last_sync_restart_at = _lastSyncRestart?.ToString("O"),
                    last_numier_restart_at = _lastNumierRestart?.ToString("O"),
                    heartbeat_at = DateTime.UtcNow.ToString("O")
                }
            };
            var req = new HttpRequestMessage(HttpMethod.Post, "colibri_runtime_status?on_conflict=status_key");
            req.Headers.Add("Prefer", "resolution=merge-duplicates,return=minimal");
            req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var resp = await http.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync();
                Log(c, $"Heartbeat rechazado: {(int)resp.StatusCode} {body}");
            }
        }
        catch (Exception ex)
        {
            Log(c, "Heartbeat no disponible: " + ex.Message);
        }
    }

    private static LauncherConfig LoadConfig(string baseDir)
    {
        var configPath = Path.Combine(baseDir, "launcher.json");
        var examplePath = Path.Combine(baseDir, "launcher.example.json");
        if (!File.Exists(configPath) && File.Exists(examplePath)) File.Copy(examplePath, configPath, false);
        if (!File.Exists(configPath)) return new LauncherConfig();
        try
        {
            return JsonSerializer.Deserialize<LauncherConfig>(File.ReadAllText(configPath),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true, PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower })
                ?? new LauncherConfig();
        }
        catch { return new LauncherConfig(); }
    }

    private static string ResolveExecutable(string configured, string baseDir, params string[] candidates)
    {
        var all = new List<string>();
        if (!string.IsNullOrWhiteSpace(configured)) all.Add(configured);
        all.AddRange(candidates);
        all.Add(Path.Combine(baseDir, Path.GetFileName(configured)));
        all.Add(Path.Combine(baseDir, "sync", Path.GetFileName(configured)));
        return all.Select(Environment.ExpandEnvironmentVariables).FirstOrDefault(File.Exists) ?? configured;
    }

    private static Process? FindProcessByExecutable(string executable)
    {
        var expectedName = Path.GetFileNameWithoutExtension(executable);
        foreach (var process in Process.GetProcessesByName(expectedName))
        {
            try
            {
                var actual = process.MainModule?.FileName;
                if (actual is not null && Path.GetFullPath(actual).Equals(Path.GetFullPath(executable), StringComparison.OrdinalIgnoreCase))
                    return process;
            }
            catch { return process; }
        }
        return null;
    }

    private static void TryInstallAutoStart(LauncherConfig c, string baseDir)
    {
        try
        {
            var startup = Environment.GetFolderPath(Environment.SpecialFolder.CommonStartup);
            var cmd = Path.Combine(startup, "ColibriGuardian.cmd");
            var exe = Path.Combine(baseDir, "ColibriLauncher.exe");
            File.WriteAllText(cmd, $"@echo off{Environment.NewLine}start \"\" \"{exe}\"{Environment.NewLine}", Encoding.ASCII);
        }
        catch (Exception ex) { Log(c, "No se pudo configurar autoarranque: " + ex.Message); }
    }

    private static void EnsureLogDirectory(string logFile)
    {
        try { var dir = Path.GetDirectoryName(logFile); if (!string.IsNullOrWhiteSpace(dir)) Directory.CreateDirectory(dir); } catch { }
    }

    private static void Log(LauncherConfig c, string message)
    {
        try
        {
            RotateLog(c.LogFile);
            File.AppendAllText(c.LogFile, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch { }
    }

    private static void RotateLog(string path)
    {
        try
        {
            var f = new FileInfo(path);
            if (!f.Exists || f.Length < 2_000_000) return;
            var backup = path + ".1";
            if (File.Exists(backup)) File.Delete(backup);
            File.Move(path, backup);
        }
        catch { }
    }

    private static void ShowError(string message)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -WindowStyle Hidden -Command \"Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('{message.Replace("'", "''")}', 'Colibrí Guardian')\"",
                UseShellExecute = false,
                CreateNoWindow = true
            });
        }
        catch { }
    }
}
