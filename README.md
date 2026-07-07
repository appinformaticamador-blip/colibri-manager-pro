# Colibrí Sync 3.0 · Importador NUMIER

Esta versión lee `cabecera.DBF` y `detalle.DBF` de NUMIER e importa tickets y líneas a Supabase.

## Instalación
1. Copia estas carpetas al repositorio GitHub:
   - `sync/`
   - `sql/`
   - `.github/`
2. Ejecuta en Supabase: `sql/numier_import_v3.sql`.
3. Commit + Push.
4. GitHub Actions → `Build Colibri Sync .NET EXE`.
5. Descarga el artifact `ColibriSync-DotNet-Windows`.
6. Edita `config.json` con tu anon key.
7. Ejecuta `ColibriSync.exe`.

## DBF detectados
- cabecera: `cabecera.DBF`
- detalle: `detalle.DBF`
- unión: `cabecera.CAB_ID = detalle.DET_ID`
