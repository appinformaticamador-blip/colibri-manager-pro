# RC 3.3.3 - Cuadrantes copia por arrastre

## Objetivo
Recuperar el comportamiento productivo del cuadrante: arrastrar en PC debe copiar empleados a otra franja, no moverlos.

## Cambios
- Drag & drop en PC ahora copia, conserva el empleado en origen.
- En móvil se añade modo copiar: tocar empleado, tocar celda destino.
- Se mantiene Supabase como fuente única compartida.
- No requiere SQL nuevo si ya está ejecutado RC 3.3.2.

## Prueba
1. Crear empleado en una franja desde PC.
2. Arrastrarlo a otra franja: debe aparecer en ambas.
3. Abrir móvil y recargar: debe verse igual.
4. En móvil tocar empleado y luego otra celda: debe copiarse.
