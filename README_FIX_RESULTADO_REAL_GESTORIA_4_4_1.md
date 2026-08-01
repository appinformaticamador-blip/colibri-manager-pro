# COLIBRÍ ERP 4.4.1 · Resultado real y Gestoría

## Cambios
- El selector Hoy/Ayer actualiza también la fecha visible y el encabezado muestra el rango real consultado.
- Mes, 30 días y Año usan la carga paginada completa de Gestoría, evitando el límite de 10.000 registros.
- Todas las tarjetas de Resultado real son pulsables y muestran su composición.
- El detalle de producto muestra unidades, venta, coste y productos estimados.
- Gestoría incorpora el rendimiento real del mes o trimestre: producto, personal, fijos, variables, márgenes y beneficio.
- La hoja Resumen del Excel de Gestoría incluye también el rendimiento real.

## Verificación
- Imports locales revisados.
- `npm ci --no-audit --no-fund` intentado.
- El build no pudo ejecutarse en este entorno porque el proxy npm interno devuelve 404 para `xlsx-0.18.5.tgz`.
