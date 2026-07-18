# Inteligencia V3.1 — corrección de ventas, ranking y ticket real

- Las ventas del periodo se calculan desde las cabeceras de tickets cobrados, excluyendo anulados y gastos.
- Las líneas se normalizan por CAB_ID y total de cabecera para evitar instantáneas duplicadas.
- El ranking utiliza únicamente las líneas normalizadas del periodo seleccionado.
- En el detalle de franja cada fila abre el ticket fiscal real mediante el visor común del TPV.
- El resumen incorpora ventas, costes, beneficio bruto, margen, mejor franja, producto líder, lectura automática y recomendaciones.

Verificado con `npm run typecheck` y `npm run build`.
