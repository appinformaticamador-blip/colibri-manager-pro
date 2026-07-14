# Colibrí ERP PRO · RC 3.9.2

Versión única de Márgenes Editables y Editor Profesional de Escandallos. Se publica como 3.9.2 —y no como la numeración 3.8.4 del documento funcional— para mantener la secuencia posterior a RC 3.9.1.

## Entrega funcional

- Coste efectivo con prioridad: corrección manual, última compra confirmada, media histórica y estado sin coste.
- Correcciones y exclusiones auditadas con motivo, usuario y fecha.
- Los productos excluidos siguen visibles, pero no participan en medias, rankings ni indicadores de margen.
- Un coste corregido recalcula todos los vínculos NUMIER y escandallos afectados.
- Editor con gramos, kilogramos, mililitros, litros, unidades, mermas, coste fijo y costes indirectos.
- Catálogo final NUMIER con filtros de productos con/sin escandallo y orden por margen, coste o ventas.
- Búsqueda de materias primas y subrecetas, trazabilidad de último coste, coste medio, proveedor, unidad y merma.
- Copia de ingredientes desde otro producto, duplicado y reordenación sin perder el original.
- Subrecetas con conversión de unidades y prevención de referencias circulares.
- Borradores separados de producción, publicación atómica, histórico y restauración como nueva versión.
- PVP real de catálogo o última venta NUMIER; si falta, se indica como no disponible y se conserva el respaldo manual.
- Ordenación por nombre, margen, coste y volumen de ventas sincronizado.

## Instalación

1. Aplicar `sql/colibri_erp_rc392_margenes_editables_editor_profesional.sql` en Supabase.
2. Desplegar la aplicación RC 3.9.2.
3. Validar un coste corregido, una exclusión, un borrador, una publicación y una restauración.

La migración es aditiva, conserva recetas, ingredientes, vínculos y versiones anteriores. El rollback está en `sql/rollback_colibri_erp_rc392.sql` y se detiene si detecta datos nuevos que pudieran perderse.

## Validación técnica

- TypeScript estricto.
- Pruebas de conversión, prioridad de costes, ausencia de coste, mermas, subrecetas, ciclos, vínculos múltiples y exclusiones.
- Compilación Vite de producción.
