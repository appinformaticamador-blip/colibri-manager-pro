# COLIBRÍ ERP PRO — RC 3.3.4

## Objetivo
Recuperar la función correcta de duplicar empleados por arrastre/copia en el módulo Cuadrantes, manteniendo Supabase como fuente única compartida entre PC y móvil.

## Cambios
- PC: arrastrar una etiqueta de empleado a otra celda DUPLICA al empleado en destino y mantiene el origen.
- PC: se usa `dataTransfer` real para que Chrome/Edge no pierdan el empleado arrastrado.
- Móvil/tablet: tocar empleado activa modo copia; tocar celda destino lo duplica.
- Mensaje visible de modo copia y confirmación.
- Mantiene máximo 3 empleados por franja.
- Mantiene guardado compartido en Supabase.

## SQL
No requiere SQL nuevo si ya está ejecutado el de RC 3.3.2.

## Prueba rápida
1. En PC, arrastra Sonia de Lunes 08:00-10:00 a Martes 08:00-10:00.
2. Debe aparecer en Martes y seguir en Lunes.
3. En móvil, toca Sonia y luego toca una celda vacía.
4. Debe copiarse y guardarse en Supabase.
5. Recarga PC y móvil: deben ver lo mismo.
