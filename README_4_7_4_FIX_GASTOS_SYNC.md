# COLIBRÍ ERP 4.7.4 · Gastos Numier G

## Causa corregida
El sincronizador guardaba los estados G en `numier_audit_events`, mientras algunos cálculos solo consultaban `numier_tickets`.

## Solución
- El ERP carga gastos G desde ambas tablas y los deduplica por CAB_ID.
- El Sync incluye desde ahora las cabeceras C y G en `numier_tickets`.
- Los G siguen excluidos de ventas, pero restan del resultado real.
