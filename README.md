# Colibrí Sync 2.0 (.NET)

Aplicación Windows autónoma para leer `C:\NUMIER\DATOS` y enviar registros DBF a Supabase.

## Instalación

1. Copia las carpetas `sync/`, `sql/` y `.github/` en el repositorio.
2. Ejecuta en Supabase el SQL `sql/numier_raw_records.sql`.
3. Haz commit y push.
4. En GitHub Actions ejecuta `Build Colibri Sync .NET EXE`.
5. Descarga el artifact `ColibriSync-DotNet-Windows`.
6. En el PC del bar abre `config.json` y pega la anon key.
7. Ejecuta `ColibriSync.exe`.

