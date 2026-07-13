# COLIBRÍ ERP PRO · RC 3.9.1 · PVP real de NUMIER

## Causa corregida

El catálogo de Rentabilidad intentaba localizar el código de venta en alias genéricos como `article_code` o `cod_articulo`, pero las líneas sincronizadas reales usan `articulo`. El precio sí estaba disponible en `numier_ticket_lines.precio`, pero nunca se asociaba con `numier_articles.article_code`.

Además, las primeras 10.000 líneas se consultaban sin orden, por lo que no representaban necesariamente las ventas más recientes.

## Comportamiento nuevo

- Usa `numier_articles.price` cuando el catálogo NUMIER aporta un PVP positivo.
- Si el catálogo no tiene precio, usa la última venta real de `numier_ticket_lines.precio` por `articulo`.
- Las líneas recientes se consultan ordenadas por `cab_id` y `line_key` descendentes.
- Los artículos fuera de la ventana reciente se resuelven bajo demanda al buscarlos.
- `00432 · PROMO` recupera automáticamente su último PVP real de 1,30 €.
- Los vínculos múltiples conservan el precio real individual de cada código.
- Márgenes prioriza el PVP actual recuperado de NUMIER y recalcula coste, beneficio y porcentaje.
- Si no existe precio real, se muestra `Precio no disponible en NUMIER`.
- El PVP manual solo aparece como respaldo opcional cuando NUMIER no aporta precio.

## Base de datos y sincronizador

No requiere migración SQL. No se han añadido tablas ni columnas.

No requiere cambios en los sincronizadores C# o Python. El sincronizador C# ya guarda:

- catálogo: `numier_articles.price`;
- detalle histórico: `numier_ticket_lines.articulo`, `precio`, `cantidad` e `importe`.

## Rollback

Revertir el commit de RC 3.9.1 restaura el mapeo frontend anterior. No hay rollback SQL ni transformación de datos porque esta versión no modifica el esquema ni los registros existentes.
