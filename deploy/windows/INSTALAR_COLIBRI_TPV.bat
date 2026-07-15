@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Instalador COLIBRI TPV + Sync Guardian

rem Comprobar permisos de administrador.
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo.
  echo Solicitando permisos de administrador...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
  if errorlevel 1 (
    echo.
    echo ERROR: Windows no pudo solicitar permisos de administrador.
    echo Pulsa con el boton derecho sobre este archivo y elige Ejecutar como administrador.
    pause
  )
  exit /b
)

echo.
echo =========================================
echo   INSTALADOR COLIBRI TPV + SYNC GUARDIAN
echo =========================================
echo.

if not exist "%~dp0INSTALAR_COLIBRI_TPV.ps1" (
  echo ERROR: No se encuentra INSTALAR_COLIBRI_TPV.ps1 en esta carpeta.
  echo Debes descomprimir TODO el artefacto antes de ejecutar el instalador.
  pause
  exit /b 2
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_COLIBRI_TPV.ps1"
set "RC=%errorlevel%"

echo.
if not "%RC%"=="0" (
  echo =========================================
  echo  INSTALACION NO COMPLETADA - ERROR %RC%
  echo =========================================
  echo.
  echo Revisa el mensaje anterior y el archivo:
  echo C:\ProgramData\ColibriERP\Logs\installer.log
) else (
  echo =========================================
  echo  INSTALACION COMPLETADA CORRECTAMENTE
  echo =========================================
)
echo.
pause
exit /b %RC%
