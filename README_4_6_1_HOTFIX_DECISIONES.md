# COLIBRÍ ERP 4.6.1 — Hotfix Centro de decisiones

- Corrige el uso de `buildClockSessions`, que devuelve `{ sessions, openSession, anomalies }`.
- El Centro de decisiones ahora extrae correctamente `sessions` antes de filtrar turnos abiertos.
- Corrige la referencia temporal de cada sesión abierta de `entry.created_at` a `start.created_at`.
- Mantiene intactos el resto de módulos y el portal de empleados.
