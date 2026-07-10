# COLIBRÍ ERP PRO — RC 3.3.6

## Objetivo
Corregir y ampliar el módulo de Cuadrantes sobre la RC 3.3.5.

## Cambios incluidos
- Límite máximo por franja aumentado de 3 a 4 empleados.
- El módulo de Cuadrantes carga automáticamente empleados activos del módulo Empleados de Supabase.
- Los empleados añadidos con PIN para fichar aparecen también en Cuadrantes.
- Corrección de Iván -> Kathy.
- Se mantiene opción CERRADO, con celda negra y texto blanco.
- PC: arrastrar etiqueta de empleado a otra celda para duplicar, manteniendo el origen.
- Móvil/tablet: arrastrar con el dedo o tocar empleado + tocar celda destino para duplicar.
- No requiere SQL nuevo sobre la RC 3.3.2/3.3.5.

## Pruebas mínimas
1. Crear empleado nuevo en Empleados con PIN y activo.
2. Ir a Cuadrantes y pulsar Recargar de Supabase.
3. Verificar que aparece en el selector.
4. Añadir hasta 4 empleados en una franja.
5. Marcar una franja como CERRADO.
6. Arrastrar un empleado en PC a otra celda.
7. En móvil, tocar empleado y después celda destino.
8. Comprobar en PC y móvil que el cuadrante queda compartido.
