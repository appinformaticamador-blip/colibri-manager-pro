# Colibrí ERP v2.2 - Live Business

Versión con ventas NUMIER LIVE y sincronizador seguro para usar NUMIER abierto.

## Incluye

- Dashboard ventas NUMIER.
- Selector de fecha: hoy, ayer y fecha concreta.
- Ventas, tickets, ticket medio, efectivo, tarjeta y cheque.
- Ventas por hora y últimos tickets.
- Estado de última sincronización.
- Colibrí Sync 2.2 con copia temporal segura de `cabecera.DBF` y `detalle.DBF`.
- Reintentos si NUMIER tiene los DBF ocupados.
- Auto-sync cada 60 segundos.

## Actualizar web

1. Sustituir en GitHub los archivos/carpetas del proyecto web:
   - `src/`
   - `public/`
   - `index.html`
   - `package.json`
   - `README.md`
2. Commit + Push.
3. Vercel desplegará automáticamente.

## Actualizar sincronizador

1. Sustituir en GitHub:
   - `sync/`
   - `sql/`
   - `.github/`
2. Commit + Push.
3. GitHub → Actions → ejecutar `Build Colibri Sync 2.2 EXE`.
4. Descargar artifact `ColibriSync-2-2-Windows`.
5. En el PC del bar, sustituir el EXE anterior por el nuevo.

## Supabase

Si ya ejecutaste el SQL de NUMIER v2 y te está sincronizando tickets reales, no hace falta repetir SQL.

Si partes de cero, ejecuta:

`sql/colibri_numier_sync_v2.sql`

## Importante

Colibrí Sync 2.2 ya no lee directamente los DBF bloqueados. Primero crea una copia temporal segura y lee esa copia. Esto permite trabajar con NUMIER abierto.
