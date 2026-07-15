using System.Diagnostics;
using System.Text.Json;

namespace ColibriLauncher;

internal sealed class LauncherConfig
{
    public string NumierExe { get; set; } = @"C:\NUMIER\NUMIER.EXE";
    public string SyncExe { get; set; } = @"C:\ColibriERP\ColibriEngine.exe";
    public int WatchIntervalSeconds { get; set; } = 12;
    public bool StartSyncHidden { get; set; } = true;
    public string LogFile { get; set; } = @"C:\ProgramData\ColibriERP\Logs\guardian.log";
    public string MaintenanceFile { get; set; } = @"C:\ProgramData\ColibriERP\maintenance.pause";
}

internal static class Program
{
    private const string MutexName = @"Global\ColibriERP_Guardian_SingleInstance";

    [STAThread]
    private static async Task Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, MutexName, out var firstInstance);
        if (!firstInstance) return;

        var baseDir = AppContext.BaseDirectory;
        var cfg = LoadConfig(baseDir);
        Directory.CreateDirectory(Path.GetDirectoryName(cfg.LogFile)!);
        Log(cfg, "Guardian iniciado.");

        cfg.NumierExe = FindNumier(cfg.NumierExe) ?? cfg.NumierExe;
        cfg.SyncExe = FindSync(baseDir, cfg.SyncExe) ?? cfg.SyncExe;

        if (!File.Exists(cfg.NumierExe))
        {
            Log(cfg, $"ERROR: NUMIER no encontrado. Ruta esperada: {cfg.NumierExe}");
            ShowError("No se encuentra NUMIER.EXE en C:\\NUMIER. Revisa la instalación de NUMIER.");
            return;
        }
        if (!File.Exists(cfg.SyncExe))
        {
            Log(cfg, $"ERROR: Sync no encontrado. Ruta esperada: {cfg.SyncExe}");
            ShowError("No se encuentra ColibriEngine.exe. Vuelve a ejecutar INSTALAR_COLIBRI_TPV.bat.");
            return;
        }

        var delay = TimeSpan.FromSeconds(Math.Clamp(cfg.WatchIntervalSeconds, 5, 300));
        while (true)
        {
            try
            {
                if (File.Exists(cfg.MaintenanceFile))
                {
                    await Task.Delay(delay);
                    continue;
                }

                EnsureRunning(cfg.SyncExe, hidden: cfg.StartSyncHidden, cfg);
                EnsureRunning(cfg.NumierExe, hidden: false, cfg);
            }
            catch (Exception ex)
            {
                Log(cfg, "ERROR vigilancia: " + ex.Message);
            }
            await Task.Delay(delay);
        }
    }

    private static LauncherConfig LoadConfig(string baseDir)
    {
        var path = Path.Combine(baseDir, "guardian.json");
        if (!File.Exists(path)) return new LauncherConfig();
        try
        {
            return JsonSerializer.Deserialize<LauncherConfig>(File.ReadAllText(path), new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
            }) ?? new LauncherConfig();
        }
        catch { return new LauncherConfig(); }
    }

    private static string? FindNumier(string configured)
    {
        var candidates = new[]
        {
            configured,
            @"C:\NUMIER\NUMIER.EXE",
            @"C:\Numier\numier.exe",
            @"C:\NUMIER\Numier.exe"
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    private static string? FindSync(string baseDir, string configured)
    {
        var candidates = new[]
        {
            configured,
            Path.Combine(baseDir, "ColibriEngine.exe"),
            Path.Combine(baseDir, "ColibriSync.exe"),
            @"C:\ColibriERP\ColibriEngine.exe",
            @"C:\ColibriERP\ColibriSync.exe",
            @"C:\NUMIER\ColibriEngine.exe",
            @"C:\NUMIER\ColibriSync.exe"
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    private static void EnsureRunning(string exe, bool hidden, LauncherConfig cfg)
    {
        if (FindProcess(exe) is not null) return;
        var psi = new ProcessStartInfo
        {
            FileName = exe,
            WorkingDirectory = Path.GetDirectoryName(exe)!,
            UseShellExecute = !hidden,
            CreateNoWindow = hidden,
            WindowStyle = hidden ? ProcessWindowStyle.Hidden : ProcessWindowStyle.Normal
        };
        var p = Process.Start(psi);
        Log(cfg, p is null ? $"ERROR al iniciar {Path.GetFileName(exe)}" : $"Iniciado {Path.GetFileName(exe)} PID {p.Id}");
    }

    private static Process? FindProcess(string exe)
    {
        var name = Path.GetFileNameWithoutExtension(exe);
        foreach (var p in Process.GetProcessesByName(name))
        {
            try
            {
                var actual = p.MainModule?.FileName;
                if (actual is null || Path.GetFullPath(actual).Equals(Path.GetFullPath(exe), StringComparison.OrdinalIgnoreCase)) return p;
            }
            catch { return p; }
        }
        return null;
    }

    private static void Log(LauncherConfig cfg, string message)
    {
        try
        {
            Rotate(cfg.LogFile);
            File.AppendAllText(cfg.LogFile, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch { }
    }

    private static void Rotate(string path)
    {
        try
        {
            if (!File.Exists(path) || new FileInfo(path).Length < 2_000_000) return;
            var old = path + ".1";
            if (File.Exists(old)) File.Delete(old);
            File.Move(path, old);
        }
        catch { }
    }

    private static void ShowError(string message)
    {
        try
        {
            System.Windows.Forms.MessageBox.Show(message, "Colibrí Sync Guardian", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
        }
        catch { }
    }
}
