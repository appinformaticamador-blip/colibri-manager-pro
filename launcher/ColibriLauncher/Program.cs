using System.Diagnostics;
using System.Text.Json;

namespace ColibriLauncher;

internal sealed class LauncherConfig
{
    public string NumierExe { get; set; } = @"C:\NUMIER\NUMIER.EXE";
    public string SyncExe { get; set; } = @"C:\ColibriERP\ColibriSync.exe";
    public string? SyncWorkingDirectory { get; set; } = @"C:\ColibriERP";
    public int WatchIntervalSeconds { get; set; } = 15;
    public bool RestartSyncWhileNumierIsOpen { get; set; } = true;
    public bool StartSyncHidden { get; set; } = true;
    public string LogFile { get; set; } = @"C:\ColibriERP\logs\ColibriLauncher.log";
}

internal static class Program
{
    private const string MutexName = @"Global\ColibriERP_Launcher_SingleInstance";

    [STAThread]
    private static async Task Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, MutexName, out var isFirstInstance);
        if (!isFirstInstance)
        {
            // Another launcher is already supervising Numier and Sync.
            return;
        }

        var baseDir = AppContext.BaseDirectory;
        var config = LoadConfig(baseDir);
        EnsureLogDirectory(config.LogFile);
        Log(config, "Launcher iniciado.");

        try
        {
            config.SyncExe = ResolveExecutable(config.SyncExe, baseDir,
                "ColibriSync.exe", @"C:\ColibriERP\ColibriSync.exe", @"C:\NUMIER\ColibriSync.exe");
            config.NumierExe = ResolveExecutable(config.NumierExe, baseDir,
                "NUMIER.EXE", @"C:\NUMIER\NUMIER.EXE", @"C:\NUMIER\Numier.exe");

            if (!File.Exists(config.SyncExe))
            {
                Log(config, $"ERROR: No se encuentra ColibriSync.exe: {config.SyncExe}");
                ShowError("No se encuentra ColibriSync.exe. Revisa launcher.json o instala el Sync en C:\\ColibriERP.");
                return;
            }

            if (!File.Exists(config.NumierExe))
            {
                Log(config, $"ERROR: No se encuentra NUMIER.EXE: {config.NumierExe}");
                ShowError("No se encuentra NUMIER.EXE. Revisa launcher.json y la ruta de Numier.");
                return;
            }

            EnsureSyncRunning(config);
            await Task.Delay(1500);

            var numier = FindProcessByExecutable(config.NumierExe) ?? StartNumier(config);
            if (numier is null)
            {
                Log(config, "ERROR: No se pudo iniciar Numier.");
                ShowError("No se pudo iniciar Numier.");
                return;
            }

            Log(config, $"Numier activo. PID {numier.Id}.");

            if (!config.RestartSyncWhileNumierIsOpen)
                return;

            var interval = TimeSpan.FromSeconds(Math.Clamp(config.WatchIntervalSeconds, 5, 300));
            while (IsProcessAlive(numier))
            {
                EnsureSyncRunning(config);
                await Task.Delay(interval);
            }

            Log(config, "Numier se ha cerrado. Launcher finalizado.");
        }
        catch (Exception ex)
        {
            Log(config, $"ERROR NO CONTROLADO: {ex}");
            ShowError("Colibrí Launcher encontró un error. Revisa el archivo de log.");
        }
    }

    private static LauncherConfig LoadConfig(string baseDir)
    {
        var configPath = Path.Combine(baseDir, "launcher.json");
        var examplePath = Path.Combine(baseDir, "launcher.example.json");

        if (!File.Exists(configPath) && File.Exists(examplePath))
        {
            File.Copy(examplePath, configPath, overwrite: false);
        }

        if (!File.Exists(configPath))
            return new LauncherConfig();

        try
        {
            var json = File.ReadAllText(configPath);
            return JsonSerializer.Deserialize<LauncherConfig>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
            }) ?? new LauncherConfig();
        }
        catch
        {
            return new LauncherConfig();
        }
    }

    private static string ResolveExecutable(string configured, string baseDir, params string[] candidates)
    {
        var all = new List<string>();
        if (!string.IsNullOrWhiteSpace(configured)) all.Add(configured);
        all.AddRange(candidates);
        all.Add(Path.Combine(baseDir, Path.GetFileName(configured)));
        all.Add(Path.Combine(baseDir, "sync", "ColibriSync.exe"));

        return all.Select(Environment.ExpandEnvironmentVariables)
            .FirstOrDefault(File.Exists) ?? configured;
    }

    private static void EnsureSyncRunning(LauncherConfig config)
    {
        var existing = FindProcessByExecutable(config.SyncExe);
        if (existing is not null)
            return;

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

        var process = Process.Start(psi);
        Log(config, process is null
            ? "ERROR: No se pudo iniciar ColibriSync."
            : $"ColibriSync iniciado. PID {process.Id}.");
    }

    private static Process? StartNumier(LauncherConfig config)
    {
        var psi = new ProcessStartInfo
        {
            FileName = config.NumierExe,
            WorkingDirectory = Path.GetDirectoryName(config.NumierExe)!,
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Normal
        };
        return Process.Start(psi);
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
            catch
            {
                // Access to MainModule can fail; name match is enough for our local POS use-case.
                return process;
            }
        }
        return null;
    }

    private static bool IsProcessAlive(Process process)
    {
        try { return !process.HasExited; }
        catch { return false; }
    }

    private static void EnsureLogDirectory(string logFile)
    {
        try
        {
            var dir = Path.GetDirectoryName(logFile);
            if (!string.IsNullOrWhiteSpace(dir)) Directory.CreateDirectory(dir);
        }
        catch { }
    }

    private static void Log(LauncherConfig config, string message)
    {
        try
        {
            File.AppendAllText(config.LogFile, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
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
                Arguments = $"-NoProfile -WindowStyle Hidden -Command \"Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('{message.Replace("'", "''")}', 'Colibrí Launcher')\"",
                UseShellExecute = false,
                CreateNoWindow = true
            });
        }
        catch { }
    }
}
