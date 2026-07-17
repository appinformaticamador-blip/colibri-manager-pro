# Colibrí Engine 4.0 — corrección de compilación

Se ha corregido el cierre de la clase `ColibriSyncApp` en `sync/ColibriSync/Program.cs`.
El fallo anterior producía `CS1513: } expected` al final del archivo.

El workflow válido es `.github/workflows/build-colibri-engine-windows.yml`.
Al finalizar correctamente genera el artefacto `COLIBRI_ENGINE_4_0_WINDOWS`.
