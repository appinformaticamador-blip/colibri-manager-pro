# RC 3.7.1 · Vinculación NUMIER y Márgenes

## Novedades
- La pestaña Costes ahora permite clasificar cada artículo como vendible, receta, consumible, equipamiento o gasto.
- Vinculación con artículos reales de NUMIER mediante buscador.
- PVP obtenido de las líneas de venta sincronizadas cuando está disponible, con PVP manual como respaldo.
- La pestaña Márgenes calcula coste, PVP, beneficio y porcentaje.
- Los artículos no vendibles siguen formando parte del histórico de gastos, pero no aparecen en márgenes.
- Botón Sincronizar catálogo para consolidar facturas ya procesadas.

## SQL obligatorio
Ejecutar una sola vez:
`sql/colibri_erp_rc371_vinculacion_numier_margenes.sql`

No modifica las Edge Functions de procesamiento de facturas.
