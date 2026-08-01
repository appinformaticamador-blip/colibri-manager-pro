# COLIBRÍ ERP 4.4.2 · Detalle y trazabilidad real

## Resultado real
- Ventas: listado de tickets del periodo con fecha, pago, total y apertura del ticket real.
- Productos: unidades, venta, coste, indicador de coste estimado/configurado y edición rápida del coste unitario.
- Personal: fuente del cálculo, horas, tarifa individual, coste y anomalías disponibles.
- Gastos fijos: categoría, importe mensual, días imputados e importe del periodo.
- Gastos variables: fecha, categoría, pago e importe.
- Beneficio real: fórmula completa desde ventas hasta beneficio.

## Gestoría
- Porcentajes de producto, personal, fijos, variables, margen bruto, margen operativo y beneficio.
- Desglose del personal y los gastos fijos imputados.
- Nuevas hojas Excel: Rendimiento real, Personal real y Fijos imputados.
- El PDF incluye el resultado económico real antes de las incidencias.

## Verificación
- Imports locales revisados: sin destinos inexistentes.
- `npm ci --no-audit --no-fund` intentado: bloqueado por 404 del proxy npm para `xlsx-0.18.5.tgz`.
- `npm run build` no puede ejecutarse después porque Vite no queda instalado.
