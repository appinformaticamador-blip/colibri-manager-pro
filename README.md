# Colibrí Sync 2.0

Sincronizador NUMIER → Supabase para Brasería El Colibrí.

## Configuración incluida

No hay que editar `config.json`. La configuración va integrada:

- Ruta NUMIER: `C:\NUMIER\DATOS`
- Cabecera: `cabecera.DBF`
- Detalle: `detalle.DBF`
- Supabase: proyecto de Brasería El Colibrí
- Auto-sync: 60 segundos
- Límite por sincronización: 500 tickets

## Instalación

1. Ejecutar en Supabase `sql/colibri_numier_sync_v2.sql`.
2. Subir al repositorio:
   - `sync/`
   - `sql/`
   - `.github/`
   - `README.md`
3. Commit + Push.
4. GitHub → Actions → `Build Colibri Sync 2.0 EXE`.
5. Descargar artifact `ColibriSync-2-0-Windows`.
6. En el PC del bar, ejecutar `ColibriSync.exe`.

## Uso

- Pulsa `S` para sincronizar manualmente.
- Pulsa `Q` para salir.
- También sincroniza solo cada 60 segundos.

## Mapeo NUMIER

- `cabecera.CAB_ID` → ID ticket
- `cabecera.CAB_FECHA` → fecha
- `cabecera.CAB_HORA` → hora
- `cabecera.CAB_ESTADO` → estado (`C` cobrado)
- `cabecera.CAB_COBRO` → forma de cobro
- `cabecera.CAB_NUMDOC` → número documento
- `cabecera.CAB_ENT_TA` → tarjeta
- `cabecera.CAB_ENT_CH` → cheque
- `detalle.DET_ID` → relación con `CAB_ID`
- `detalle.DET_IMPORT` → importe línea
- `detalle.DET_TIPO_I` → IVA
