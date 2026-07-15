# RC 3.9.4 — Colibrí Sync Guardian One Click

- No requiere `config.json`.
- El Sync incorpora la configuración actual de esta instalación.
- El instalador detecta NUMIER en `C:\NUMIER`.
- Instala Sync y Guardian en `C:\ColibriERP`.
- Crea acceso `COLIBRI TPV` en el escritorio.
- Crea autoarranque en Windows.
- Reinicia NUMIER o Sync si se cierran.
- Incluye modo mantenimiento y log rotativo.

## Compilación
Ejecutar en GitHub Actions: `Build Colibri Guardian One Click`.
Descargar el artefacto `COLIBRI-TPV-SYNC-GUARDIAN-RC-3.9.4`.

## Instalación
Copiar la carpeta del artefacto al TPV y ejecutar `INSTALAR_COLIBRI_TPV.bat`.
