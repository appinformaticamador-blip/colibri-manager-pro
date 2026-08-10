# COLIBRÍ ERP 5.1.1 · Periodos de Análisis

- Corregido el desfase de zona horaria que podía mostrar el día 31 del mes anterior al seleccionar Mes.
- Las fechas de negocio se generan ahora con calendario local, no con UTC.
- Mes empieza exactamente el día 1. Para el mes actual termina hoy; para meses históricos, en el último día natural del mes.
- Añadido selector Rango con campos Desde/Hasta inclusivos.
- Los rangos usan carga paginada de Gestoría para periodos amplios.
- La comparación anterior conserva exactamente el mismo número de días.
