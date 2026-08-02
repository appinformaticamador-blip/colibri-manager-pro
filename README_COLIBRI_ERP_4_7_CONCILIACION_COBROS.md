# COLIBRÍ ERP 4.7 · Conciliación de cobros

## Nueva función

En **Operación → TPV y caja → Conciliación** se puede subir el Excel real del datáfono para compararlo con los tickets sincronizados de Numier.

El importador reconoce el formato aportado con columnas Fecha, Tipo, ID de transacción, Forma de pago, Precio bruto/neto y Cuenta. También admite variaciones habituales de esos encabezados.

## Incidencias detectadas

- Cobro correcto por importe y hora.
- Coincidencia probable.
- Ticket registrado como efectivo que coincide con un cobro real de tarjeta.
- Diferencia de importe.
- Cobro real sin ticket.
- Ticket de tarjeta sin cobro real.
- Identificadores de transacción duplicados.
- Pagos mixtos, comparando únicamente la parte de tarjeta.

## Criterio de conciliación

Se priorizan fecha, importe exacto, proximidad horaria y orden de las operaciones. Las coincidencias no confirmadas se muestran como incidencias para revisión, sin modificar automáticamente los tickets originales.

## Exportación

El resultado se puede exportar a Excel con hojas Resumen y Conciliación.
