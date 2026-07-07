# Colibrí ERP v2.4 — Estado de sincronización NUMIER

## Incluye
- Barra de progreso de Colibrí Sync en Manager.
- Estado `SINCRONIZANDO` / `LIVE` / `ACTUALIZADO 100%`.
- Tickets importados, tickets totales, pendientes y último CAB_ID.
- Tiempo de última sincronización y porcentaje visible en dashboard.
- Colibrí Sync v2.4 calcula el progreso leyendo `cabecera.DBF`.

## Instalación
1. En Supabase ejecuta `sql/colibri_erp_v24_sync_progress.sql`.
2. Sube a GitHub todo el contenido del proyecto.
3. Commit + Push.
4. Vercel actualizará el Manager.
5. En GitHub Actions compila el nuevo Sync y sustituye el EXE anterior.

## Nota
La primera carga histórica puede tardar. Mientras tanto verás `SINCRONIZANDO XX%`. Cuando llegue al final mostrará `ACTUALIZADO 100% / LIVE`.
