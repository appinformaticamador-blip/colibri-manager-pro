param(
  [string]$InstallDir = "C:\ColibriERP",
  [string]$NumierExe = "C:\NUMIER\NUMIER.EXE",
  [string]$SyncExe = "C:\ColibriERP\ColibriSync.exe"
)
$ErrorActionPreference = "Stop"

Write-Host "Instalando Colibri Launcher..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "logs") | Out-Null

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherSource = Join-Path $sourceDir "ColibriLauncher.exe"
if (!(Test-Path $launcherSource)) { throw "ColibriLauncher.exe debe estar junto a este script." }
Copy-Item $launcherSource (Join-Path $InstallDir "ColibriLauncher.exe") -Force

$config = @{
  numier_exe = $NumierExe
  sync_exe = $SyncExe
  sync_working_directory = (Split-Path -Parent $SyncExe)
  watch_interval_seconds = 15
  restart_sync_while_numier_is_open = $true
  start_sync_hidden = $true
  log_file = (Join-Path $InstallDir "logs\ColibriLauncher.log")
} | ConvertTo-Json
$config | Set-Content -Encoding UTF8 (Join-Path $InstallDir "launcher.json")

$desktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
$shortcutPath = Join-Path $desktop "NUMIER.lnk"
if (Test-Path $shortcutPath) {
  Copy-Item $shortcutPath (Join-Path $desktop "NUMIER - acceso original.lnk") -Force
}
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($shortcutPath)
$sc.TargetPath = Join-Path $InstallDir "ColibriLauncher.exe"
$sc.WorkingDirectory = $InstallDir
$sc.Description = "Abrir NUMIER y asegurar Colibri Sync"
if (Test-Path $NumierExe) { $sc.IconLocation = "$NumierExe,0" }
$sc.Save()

Write-Host "Instalacion terminada." -ForegroundColor Green
Write-Host "Acceso creado: $shortcutPath"
Write-Host "El acceso original se conserva como: NUMIER - acceso original.lnk"
