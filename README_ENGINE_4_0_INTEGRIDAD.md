# Colibrí Engine 4.0 — Integridad automática

Esta versión parte del proyecto beta estable original y sustituye la selección basada únicamente en el CAB_ID máximo.

## Funcionamiento

- Primer arranque de cada día: compara todos los tickets cobrados de NUMIER con los CAB_ID existentes en Supabase.
- Resto del día: reconcilia hoy, ayer y los CAB_ID nuevos.
- Recupera huecos intermedios mediante upsert, sin duplicar tickets.
- Si una auditoría no termina, no se marca como completada y se reintenta en el siguiente ciclo.
- Guarda el estado en `C:\ProgramData\ColibriERP\audit-state.json`.
- Continúa leyendo copias temporales de los DBF con acceso compartido, sin escribir en NUMIER.

## Compilación

GitHub Actions > Build Colibri Engine Windows. El artefacto resultante se llama `COLIBRI_ENGINE_4_0_WINDOWS`.
