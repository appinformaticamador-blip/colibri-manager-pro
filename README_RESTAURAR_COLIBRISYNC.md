# Restaurar carpeta ColibriSync v3.0.4

Este paquete restaura la carpeta completa:

`sync/ColibriSync/`

Incluye:
- `ColibriSync.csproj`
- `Program.cs`
- `config.example.json`
- `instalar_inicio_windows.bat`
- `quitar_inicio_windows.bat`

## Instalación

1. Descomprime este ZIP.
2. Copia la carpeta `sync/` completa en la raíz de tu repositorio, sustituyendo la carpeta borrada.
3. Copia también `.github/workflows/build-colibri-sync-dotnet.yml` si quieres asegurar el workflow correcto.
4. En GitHub Desktop: Commit + Push en `develop`.
5. Ejecuta GitHub Actions para compilar el artifact.

Clave de cierre del Engine: `131313`.
