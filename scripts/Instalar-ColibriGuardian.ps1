param(
  [string]$InstallDir = "C:\ColibriERP",
  [string]$NumierExe = "C:\NUMIER\NUMIER.EXE",
  [string]$SupabaseUrl = "",
  [string]$SupabaseAnonKey = "",
  [string]$BusinessName = "Brasería El Colibrí",
  [string]$EquipmentName = "TPV Barra"
)
$ErrorActionPreference = "Stop"

Write-Host "Instalando Colibrí Sync Guardian..." -ForegroundColor Cyan
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path "C:\ProgramData\ColibriERP\Logs" | Out-Null

$guardianSource = Join-Path $sourceDir "ColibriLauncher.exe"
$syncSource = Join-Path $sourceDir "ColibriSync.exe"
if (!(Test-Path $guardianSource)) { throw "Falta ColibriLauncher.exe junto al instalador." }
if (!(Test-Path $syncSource)) { throw "Falta ColibriSync.exe junto al instalador." }
if (!(Test-Path $NumierExe)) { throw "No se encuentra NUMIER en $NumierExe" }

Copy-Item $guardianSource (Join-Path $InstallDir "ColibriLauncher.exe") -Force
Copy-Item $syncSource (Join-Path $InstallDir "ColibriSync.exe") -Force

$configSource = Join-Path $sourceDir "config.json"
if (Test-Path $configSource) { Copy-Item $configSource (Join-Path $InstallDir "config.json") -Force }

$launcher = @{
  numier_exe = $NumierExe
  sync_exe = (Join-Path $InstallDir "ColibriSync.exe")
  sync_working_directory = $InstallDir
  watch_interval_seconds = 12
  heartbeat_seconds = 30
  keep_numier_running = $true
  keep_sync_running = $true
  start_sync_hidden = $true
  start_with_windows = $true
  maintenance_flag = (Join-Path $InstallDir "maintenance.pause")
  log_file = "C:\ProgramData\ColibriERP\Logs\guardian.log"
  supabase_url = $SupabaseUrl
  supabase_anon_key = $SupabaseAnonKey
  business_name = $BusinessName
  equipment_name = $EquipmentName
} | ConvertTo-Json
$launcher | Set-Content -Encoding UTF8 (Join-Path $InstallDir "launcher.json")

$desktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
$shortcutPath = Join-Path $desktop "COLIBRI TPV.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($shortcutPath)
$sc.TargetPath = Join-Path $InstallDir "ColibriLauncher.exe"
$sc.WorkingDirectory = $InstallDir
$sc.Description = "Abrir NUMIER y mantener Colibrí Sync activo"
$sc.IconLocation = "$NumierExe,0"
$sc.Save()

$startup = [Environment]::GetFolderPath("CommonStartup")
$startupShortcut = Join-Path $startup "Colibri Guardian.lnk"
$ss = $ws.CreateShortcut($startupShortcut)
$ss.TargetPath = Join-Path $InstallDir "ColibriLauncher.exe"
$ss.WorkingDirectory = $InstallDir
$ss.WindowStyle = 7
$ss.Save()

Start-Process (Join-Path $InstallDir "ColibriLauncher.exe")
Write-Host "Instalación terminada." -ForegroundColor Green
Write-Host "Acceso creado: $shortcutPath"
Write-Host "Logs: C:\ProgramData\ColibriERP\Logs\guardian.log"
Write-Host "Modo técnico: crear $InstallDir\maintenance.pause para detener reinicios automáticos."
