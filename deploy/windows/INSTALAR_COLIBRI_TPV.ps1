#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$InstallDir = 'C:\ColibriERP'
$ProgramDataDir = 'C:\ProgramData\ColibriERP'
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host '=========================================' -ForegroundColor Cyan
Write-Host '  INSTALADOR COLIBRI TPV + SYNC GUARDIAN' -ForegroundColor Cyan
Write-Host '=========================================' -ForegroundColor Cyan

$numier = @('C:\NUMIER\NUMIER.EXE','C:\NUMIER\Numier.exe','C:\Numier\numier.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $numier) { throw 'No se encuentra NUMIER.EXE en C:\NUMIER.' }

$syncSource = @((Join-Path $Source 'ColibriEngine.exe'), (Join-Path $Source 'ColibriSync.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
$guardianSource = Join-Path $Source 'ColibriGuardian.exe'
if (-not $syncSource) { throw 'Falta ColibriEngine.exe junto al instalador.' }
if (-not (Test-Path $guardianSource)) { throw 'Falta ColibriGuardian.exe junto al instalador.' }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ProgramDataDir 'Logs') | Out-Null
Copy-Item $syncSource (Join-Path $InstallDir 'ColibriEngine.exe') -Force
Copy-Item $guardianSource (Join-Path $InstallDir 'ColibriGuardian.exe') -Force

$config = @{
  numier_exe = $numier
  sync_exe = (Join-Path $InstallDir 'ColibriEngine.exe')
  watch_interval_seconds = 12
  start_sync_hidden = $true
  log_file = (Join-Path $ProgramDataDir 'Logs\guardian.log')
  maintenance_file = (Join-Path $ProgramDataDir 'maintenance.pause')
} | ConvertTo-Json
$config | Set-Content -Encoding UTF8 (Join-Path $InstallDir 'guardian.json')

$wsh = New-Object -ComObject WScript.Shell
function New-Link($Path) {
  $s = $wsh.CreateShortcut($Path)
  $s.TargetPath = Join-Path $InstallDir 'ColibriGuardian.exe'
  $s.WorkingDirectory = $InstallDir
  $s.Description = 'Abrir NUMIER y mantener Colibri Sync activo'
  $s.IconLocation = "$numier,0"
  $s.Save()
}

$desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
$startup = [Environment]::GetFolderPath('CommonStartup')
$old = Join-Path $desktop 'NUMIER.lnk'
if (Test-Path $old) { Copy-Item $old (Join-Path $desktop 'NUMIER - ACCESO ORIGINAL.lnk') -Force }
New-Link (Join-Path $desktop 'COLIBRI TPV.lnk')
New-Link (Join-Path $startup 'Colibri Sync Guardian.lnk')

Start-Process (Join-Path $InstallDir 'ColibriGuardian.exe')
Write-Host ''
Write-Host 'INSTALACION COMPLETADA.' -ForegroundColor Green
Write-Host 'Usa el acceso COLIBRI TPV del escritorio.' -ForegroundColor Green
Write-Host 'El Guardian arrancara tambien con Windows.' -ForegroundColor Green
Start-Sleep -Seconds 4
