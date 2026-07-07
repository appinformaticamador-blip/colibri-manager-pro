# Colibrí ERP v1.1 + Colibrí Sync 2.2

## Incluye
- Dashboard con selector de fecha: hoy, día anterior, día siguiente y fecha manual.
- Lectura de `numier_daily_sales` para ver ventas de días anteriores.
- Estado de última sincronización NUMIER.
- Colibrí Sync 2.2 automático cada 60 segundos.
- Upsert de `numier_sync_files` para no duplicar registros.

## Actualización web
Copia el contenido de `web/` a la raíz de tu repositorio (`index.html`, `package.json`, `src/`, `public/`, etc.).
Haz Commit + Push en GitHub Desktop. Vercel desplegará automáticamente.

## Actualización Sync
Copia estas carpetas a tu repositorio:
- `sync/`
- `.github/`
- `sql/`

Haz Commit + Push.
En GitHub Actions ejecuta: **Build Colibri Sync .NET EXE**.
Descarga el artifact `ColibriSync-DotNet-Windows-v2-2`.

## Supabase
Ejecuta una vez:
`sql/numier_dashboard_v52.sql`

## PC del bar
Edita `config.json`:
- `auto_sync`: true
- `interval_seconds`: 60
- `numier_path`: `C:\NUMIER\DATOS`

Abre `ColibriSync.exe`. Ya no tendrás que pulsar sincronizar manualmente.
