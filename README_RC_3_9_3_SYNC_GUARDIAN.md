# RC 3.9.3 · Colibrí Sync Guardian

## Objetivo
Mantener NUMIER y Colibrí Sync activos durante la jornada, recuperarlos tras cierres o reinicios y mostrar su estado en el ERP.

## Componentes
- `ColibriLauncher.exe`: Guardian residente.
- `ColibriSync.exe`: sincronizador continuo sin depender de teclado/consola.
- `sql/colibri_erp_rc393_sync_guardian.sql`: estado y heartbeat.
- `scripts/Instalar-ColibriGuardian.ps1`: instalación en Windows.

## Instalación
1. Ejecutar el SQL en Supabase.
2. Hacer push y ejecutar GitHub Action `Build Colibri Sync Guardian Windows`.
3. Descargar el artifact.
4. Copiar `config.json` real del Sync dentro de la carpeta descargada.
5. Ejecutar PowerShell como administrador:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Instalar-ColibriGuardian.ps1 -SupabaseUrl "https://TU-PROYECTO.supabase.co" -SupabaseAnonKey "TU_ANON_KEY"
```

## Comportamiento
- Arranque automático con Windows.
- Reinicio de NUMIER y Sync cada 12 segundos si se cierran.
- Heartbeat cada 30 segundos.
- Estado visible en Configuración del ERP.
- Log rotativo en `C:\ProgramData\ColibriERP\Logs\guardian.log`.

## Modo mantenimiento
Crear el archivo:

`C:\ColibriERP\maintenance.pause`

Mientras exista, Guardian no relanza procesos. Eliminarlo para volver al modo normal.
