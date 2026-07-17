# Colibrí Engine 4.0 — Integridad automática

## Cambio crítico aplicado

La sincronización ya no da por importados todos los tickets anteriores al CAB_ID máximo. Ahora consulta qué CAB_ID existen realmente en Supabase y recupera los huecos.

## Funcionamiento

- Primer arranque de cada día: auditoría completa de todos los tickets cobrados.
- Resto del día: reconciliación rápida de hoy, ayer y cualquier CAB_ID nuevo.
- Si Internet o Supabase fallan, la auditoría no se marca como completada y se repite.
- Los envíos usan upsert y no generan duplicados.
- Numier se lee mediante copia temporal con FileShare.ReadWrite; no se modifica ni se bloquea.
- Estado local: `C:\ProgramData\ColibriERP\audit-state.json`.

## Generar el EXE

Al subir el proyecto a GitHub se ejecuta la acción **Build Colibri Engine Windows**. En Actions, descarga el artefacto `COLIBRI_ENGINE_4_0_WINDOWS`.

También puede compilarse en Windows con .NET 8:

```bat
dotnet publish sync\ColibriSync\ColibriSync.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o salida\ColibriEngine
```

## Sustitución en el bar

1. Detener Colibri Guardian/Engine.
2. Guardar una copia del `ColibriEngine.exe` actual.
3. Sustituirlo por el nuevo EXE.
4. Arrancar Guardian.
5. En el primer arranque hará automáticamente la auditoría diaria y recuperará los tickets faltantes.
