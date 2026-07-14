# Colibrí Launcher 3.1.1

Abre **Colibrí Sync** en oculto (solo si no está funcionando) y después abre **NUMIER**. Mientras NUMIER permanezca abierto, revisa cada 15 segundos que el Sync siga activo y lo reinicia si alguien lo cierra o falla.

## Integración en GitHub

Copia estas carpetas en la raíz de `develop`:

- `launcher/`
- `.github/workflows/build-colibri-launcher.yml`
- `scripts/`

Commit recomendado:

`3.1.1 Colibri Launcher y Watchdog`

Tras el push, abre **GitHub → Actions → Build Colibri Launcher Windows** y descarga el artifact:

`ColibriLauncher-Windows-v3-1-1`

## Instalación en el TPV

1. Crea `C:\ColibriERP`.
2. Coloca ahí `ColibriLauncher.exe`, `launcher.json`, `ColibriSync.exe` y el `config.json` real del Sync.
3. Revisa `launcher.json`. La ruta de NUMIER debe apuntar al `NUMIER.EXE` real.
4. Sustituye el acceso directo del escritorio de NUMIER para que apunte a `C:\ColibriERP\ColibriLauncher.exe`.

También se incluye `scripts/Instalar-ColibriLauncher.ps1`. Coloca junto al script el EXE descargado y ejecútalo como administrador. Conserva el acceso anterior con el nombre **NUMIER - acceso original**.

## Comportamiento

- Evita abrir dos Launcher.
- Evita abrir dos Sync.
- Si NUMIER ya estaba abierto, solo garantiza que Sync esté activo.
- El Sync arranca oculto.
- El Launcher permanece oculto como watchdog mientras NUMIER está abierto.
- Registra actividad en `C:\ColibriERP\logs\ColibriLauncher.log`.

## Rollback

Borra el nuevo acceso `NUMIER.lnk` y renombra `NUMIER - acceso original.lnk` a `NUMIER.lnk`.
