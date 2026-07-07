# Colibrí Sync 2.1

Corrección para NUMIER real:
- cabecera.DBF
- detalle.DBF

## Supabase
Ejecuta `sql/numier_sync_files.sql` una vez.

## Build
Sube `sync/`, `sql/` y `.github/` al repo. Ejecuta GitHub Actions: Build Colibri Sync .NET EXE.

## Config
Al descargar el artifact, copia `config.example.json` como `config.json` y edita anon key.
