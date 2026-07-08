@echo off
cd /d "%~dp0"
echo Quitando Colibri Engine del inicio de Windows...
ColibriEngine.exe --uninstall-startup
pause
