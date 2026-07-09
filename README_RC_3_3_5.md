# COLIBRÍ ERP PRO — RC 3.3.5

## Objetivo
Corregir el comportamiento del módulo Cuadrantes sobre la RC 3.3.4.

## Cambios
- Iván corregido a Kathy.
- Migración automática de datos antiguos `ivan` a `kathy`.
- Arrastrar y soltar en PC para duplicar empleado a otra celda manteniendo origen.
- Duplicación en móvil mediante tocar empleado y tocar celda destino.
- Nueva opción `CERRADO` en cada franja.
- Las franjas cerradas se muestran en negro con texto blanco.
- Supabase se mantiene como fuente única compartida.

## SQL
No requiere SQL nuevo.

## Pruebas
- Build Vite OK.
- Tabla de cuadrantes renderiza.
- Selector de empleados incluye CERRADO.
- Datos antiguos de Iván se muestran como Kathy.
