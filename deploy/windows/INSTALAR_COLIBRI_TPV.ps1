#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$InstallDir = 'C:\ColibriERP'
$ProgramDataDir = 'C:\ProgramData\ColibriERP'
$LogDir = Join-Path $ProgramDataDir 'Logs'
$LogFile = Join-Path $LogDir 'installer.log'
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Start-Transcript -Path $LogFile -Append | Out-Null

function Step([string]$Message) {
  Write-Host "`n>> $Message" -ForegroundColor Cyan
}

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'El instalador necesita permisos de administrador.'
  }

  Write-Host ''
  Write-Host '=========================================' -ForegroundColor Cyan
  Write-Host '  INSTALADOR COLIBRI TPV + SYNC GUARDIAN' -ForegroundColor Cyan
  Write-Host '  RC 3.9.5 - Instalador con diagnostico' -ForegroundColor DarkCyan
  Write-Host '=========================================' -ForegroundColor Cyan

  Step 'Buscando NUMIER.EXE'
  $numierCandidates = @(
    'C:\NUMIER\NUMIER.EXE',
    'C:\NUMIER\Numier.exe',
    'C:\NUMIER\numier.exe',
    'C:\Numier\NUMIER.EXE',
    'C:\Numier\Numier.exe',
    'C:\Numier\numier.exe'
  )
  $numier = $numierCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $numier) {
    $found = Get-ChildItem -Path 'C:\' -Filter 'numier.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $numier = $found.FullName }
  }
  if (-not $numier) { throw 'No se encuentra NUMIER.EXE. Comprueba que este instalado en C:\NUMIER.' }
  Write-Host "Encontrado: $numier" -ForegroundColor Green

  Step 'Comprobando archivos del paquete'
  $syncCandidates = @(
    (Join-Path $Source 'ColibriEngine.exe'),
    (Join-Path $Source 'ColibriSync.exe')
  )
  $syncSource = $syncCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  $guardianCandidates = @(
    (Join-Path $Source 'ColibriGuardian.exe'),
    (Join-Path $Source 'ColibriLauncher.exe')
  )
  $guardianSource = $guardianCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

  if (-not $syncSource) {
    throw 'Falta ColibriEngine.exe o ColibriSync.exe. Ejecuta el instalador desde el artefacto COMPLETO descargado de GitHub Actions.'
  }
  if (-not $guardianSource) {
    throw 'Falta ColibriGuardian.exe o ColibriLauncher.exe. Ejecuta el instalador desde el artefacto COMPLETO descargado de GitHub Actions.'
  }
  Write-Host "Sync: $syncSource" -ForegroundColor Green
  Write-Host "Guardian: $guardianSource" -ForegroundColor Green

  Step 'Cerrando versiones anteriores'
  Get-Process -Name 'ColibriGuardian','ColibriLauncher','ColibriEngine','ColibriSync' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 700

  Step 'Instalando archivos en C:\ColibriERP'
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  Copy-Item -LiteralPath $syncSource -Destination (Join-Path $InstallDir 'ColibriEngine.exe') -Force
  Copy-Item -LiteralPath $guardianSource -Destination (Join-Path $InstallDir 'ColibriGuardian.exe') -Force

  $config = [ordered]@{
    numier_exe = $numier
    sync_exe = (Join-Path $InstallDir 'ColibriEngine.exe')
    watch_interval_seconds = 12
    start_sync_hidden = $true
    log_file = (Join-Path $LogDir 'guardian.log')
    maintenance_file = (Join-Path $ProgramDataDir 'maintenance.pause')
  } | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText((Join-Path $InstallDir 'guardian.json'), $config, (New-Object System.Text.UTF8Encoding($false)))

  Step 'Creando accesos directos'
  $wsh = New-Object -ComObject WScript.Shell
  function New-Link([string]$Path) {
    $shortcut = $wsh.CreateShortcut($Path)
    $shortcut.TargetPath = Join-Path $InstallDir 'ColibriGuardian.exe'
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Description = 'Abrir NUMIER y mantener Colibri Sync activo'
    $shortcut.IconLocation = "$numier,0"
    $shortcut.Save()
  }

  $desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
  if ([string]::IsNullOrWhiteSpace($desktop)) { $desktop = [Environment]::GetFolderPath('Desktop') }
  $startup = [Environment]::GetFolderPath('CommonStartup')
  if ([string]::IsNullOrWhiteSpace($startup)) {
    $startup = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Startup'
  }
  New-Item -ItemType Directory -Force -Path $desktop | Out-Null
  New-Item -ItemType Directory -Force -Path $startup | Out-Null

  $old = Join-Path $desktop 'NUMIER.lnk'
  $backup = Join-Path $desktop 'NUMIER - ACCESO ORIGINAL.lnk'
  if ((Test-Path -LiteralPath $old) -and -not (Test-Path -LiteralPath $backup)) {
    Copy-Item -LiteralPath $old -Destination $backup -Force
  }
  New-Link (Join-Path $desktop 'COLIBRI TPV.lnk')
  New-Link (Join-Path $startup 'Colibri Sync Guardian.lnk')

  Step 'Iniciando Guardian, Sync y NUMIER'
  Start-Process -FilePath (Join-Path $InstallDir 'ColibriGuardian.exe') -WorkingDirectory $InstallDir
  Start-Sleep -Seconds 3

  $guardianRunning = Get-Process -Name 'ColibriGuardian','ColibriLauncher' -ErrorAction SilentlyContinue
  if (-not $guardianRunning) { throw 'El Guardian se instalo pero no pudo iniciarse. Revisa guardian.log.' }

  Write-Host ''
  Write-Host 'INSTALACION COMPLETADA.' -ForegroundColor Green
  Write-Host 'Usa el acceso COLIBRI TPV del escritorio.' -ForegroundColor Green
  Write-Host 'El Guardian arrancara automaticamente con Windows.' -ForegroundColor Green
  Write-Host "Registro: $LogFile" -ForegroundColor DarkGray
  exit 0
}
catch {
  Write-Host ''
  Write-Host 'ERROR DURANTE LA INSTALACION:' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ''
  Write-Host "Registro completo: $LogFile" -ForegroundColor Yellow
  exit 1
}
finally {
  try { Stop-Transcript | Out-Null } catch {}
}
