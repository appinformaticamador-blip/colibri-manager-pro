# Colibrí Sync limpio - instalación

## 1. Supabase
Ejecuta en SQL Editor:

`sql/colibri_numier_clean_v1.sql`

Este SQL borra solo las tablas NUMIER (`numier_*`) y las crea limpias.
No toca empleados, fichajes ni cuadrantes.

## 2. GitHub
Copia al repositorio estas carpetas:

- `sync/`
- `sql/`
- `.github/`
- `docs/`

Haz Commit y Push.

## 3. GitHub Actions
En GitHub → Actions ejecuta:

`Build Colibri Sync Clean EXE`

Descarga el artifact:

`ColibriSync-Clean-Windows`

## 4. PC del bar
Descomprime el artifact.
Edita `config.json`:

```json
{
  "numier_path": "C:\\NUMIER\\DATOS",
  "cabecera_file": "cabecera.DBF",
  "detalle_file": "detalle.DBF",
  "supabase_url": "https://xccyaoziutlxxklcofrw.supabase.co",
  "supabase_anon_key": "TU_ANON_KEY",
  "auto_sync_seconds": 60,
  "max_tickets_per_sync": 500,
  "business_name": "Brasería El Colibrí"
}
```

Ejecuta `ColibriSync.exe`.

## Notas
La primera versión limpia importa cabeceras/tickets y registra esquema DBF.
Si algún campo de NUMIER tiene otro nombre, el programa guarda el esquema en `numier_dbf_schema` para ajustar el mapeo en la siguiente versión.
