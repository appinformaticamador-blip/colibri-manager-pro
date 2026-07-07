# Colibrí Sync Clean v1.2

Corrección del mapeo real NUMIER:

- cabecera.DBF: `CAB_ID`, `CAB_FECHA`, `CAB_HORA`, `CAB_ESTADO`, `CAB_COBRO`, `CAB_NUMDOC`, `CAB_ENT_TA`, `CAB_ENT_CH`
- detalle.DBF: `DET_ID`, `DET_IMPORT`

## Instalación

1. Ejecuta en Supabase `sql/colibri_numier_clean_v12.sql`.
2. Sube `sync/`, `sql/`, `.github/` y este README a GitHub.
3. Commit + Push.
4. GitHub Actions → `Build Colibri Sync Clean EXE`.
5. Descarga artifact `ColibriSync-Clean-Windows-v1-2`.
6. Edita `config.json` y pega tu anon key.
7. Ejecuta `ColibriSync.exe`.

## Depuración

En PowerShell:

```powershell
.\ColibriSync.exe --debug
```
