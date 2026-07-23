# COLIBRÍ ERP 4.1.1 — Costes rápidos y beneficio diario

## Cambios
- Los productos vendidos sin coste configurado usan automáticamente un coste provisional igual a 1/3 del PVP medio vendido.
- El beneficio del día se calcula desde el primer momento, aunque todavía haya costes provisionales.
- El ranking identifica cada coste provisional con la etiqueta «Estimado 1/3 PVP».
- Nuevo botón «Costes rápidos» para editar de una sola vez todos los artículos vendidos en el periodo seleccionado.
- Al pulsar un producto se puede cambiar su coste unitario y recalcular inmediatamente.
- Los costes manuales se guardan en Supabase y también en una copia local de seguridad del navegador.
- Si Supabase falla, el coste queda guardado localmente y se informa al usuario.
- Se ha reparado el modelo de rentabilidad que no estaba relacionando correctamente los costes manuales por código NUMIER.

## Comprobaciones
- Sintaxis JSX/JavaScript validada con TypeScript transpileModule: correcta.
- La instalación npm y el build completo no pudieron ejecutarse en el entorno de generación por una incidencia temporal 503 del registro npm interno al descargar `yallist-3.1.1.tgz`.

## Prueba recomendada
1. Abrir Inteligencia.
2. Seleccionar Hoy.
3. Comprobar que ya aparece coste y beneficio para todos los productos.
4. Pulsar «Costes rápidos».
5. Modificar varios costes y pulsar «Guardar todos y recalcular».
6. Recargar la página y comprobar que se conservan.
