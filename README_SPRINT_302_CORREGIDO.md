# Sprint 3.0.2 corregido · Estado del Servicio LIVE

Este paquete corrige el fallo de GitHub Actions:

`MSBUILD : error MSB1009: Project file does not exist. Switch: sync/ColibriSync/ColibriSync.csproj`

Ahora incluye el proyecto .NET completo mínimo para compilar:

- `sync/ColibriSync/ColibriSync.csproj`
- `sync/ColibriSync/Program.cs`
- `.github/workflows/build-colibri-sync-dotnet.yml`

## Instalación

1. Copia el contenido del ZIP sobre el repositorio en la rama `develop`.
2. Confirma que existe esta ruta:
   `sync/ColibriSync/ColibriSync.csproj`
3. Commit: `Fix Sprint 3.0.2 Engine project`
4. Push.
5. GitHub Actions generará el artifact `ColibriEngine-Windows-v3-0-2`.

## Nota

El ejecutable resultante se llama `ColibriEngine.exe`. Si quieres conservar el nombre anterior,
puedes renombrarlo a `ColibriSync.exe` en el PC del bar, aunque el nombre comercial recomendado es Colibrí Engine.
