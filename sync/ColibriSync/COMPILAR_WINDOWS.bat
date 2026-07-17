@echo off
setlocal
cd /d "%~dp0"
where dotnet >nul 2>nul || (echo ERROR: instala .NET 8 SDK & pause & exit /b 1)
dotnet restore ColibriSync.csproj || goto :error
dotnet publish ColibriSync.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "%~dp0..\..\salida\ColibriEngine" || goto :error
echo.
echo EXE creado en salida\ColibriEngine
pause
exit /b 0
:error
echo ERROR al compilar.
pause
exit /b 1
