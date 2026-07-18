# Colibrí ERP — TPV Control Center

## Incluye

- Resumen de ventas con tickets, ticket medio, efectivo, tarjeta y pulso de 7 días.
- Control completo de tickets del día, apertura del contenido real, búsqueda por número/CAB_ID/importe/producto y filtros por pago/estado.
- Cuadre de caja con fondo inicial, entradas, salidas, efectivo contado, datáfono, diferencias, responsable y notas.
- Histórico de cierres con detalle de diferencias e incidencias.
- Pulso IA local basado en los últimos 7 días frente a los 7 anteriores.
- Diseño móvil adaptado.

## Paso obligatorio para guardar cierres en todos los dispositivos

Ejecutar una vez en Supabase SQL Editor:

`sql/colibri_erp_tpv_control_center.sql`

Si todavía no se ejecuta, el cierre se conserva localmente en el navegador como respaldo, pero no se comparte entre dispositivos.

## Verificación

Proyecto verificado con:

`npm ci`

`npm run build`
