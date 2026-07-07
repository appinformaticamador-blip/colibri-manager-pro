# Colibri Sync Windows Builder

Este paquete genera `ColibriSync.exe` en Windows.

## Opcion recomendada: GitHub Actions
1. Sube estos archivos a un repositorio de GitHub.
2. Entra en **Actions**.
3. Ejecuta **Build Colibri Sync EXE**.
4. Descarga el artefacto **ColibriSync-Windows**.
5. Dentro estará `ColibriSync.exe`.

## Opcion local en Windows
1. Instala Python 3.12.
2. Ejecuta `build_exe.bat`.
3. El EXE queda en `dist/ColibriSync.exe`.

## Configuración en el PC del bar
La primera vez que ejecutes `ColibriSync.exe`, creará:

`%APPDATA%\ColibriSync\config.json`

Edita ese archivo y pega:
- `supabase_url`
- `supabase_anon_key`
- `numier_datos_path`: `C:\NUMIER\DATOS`

## Supabase
Ejecuta antes `supabase_numier_sync.sql` en SQL Editor.
