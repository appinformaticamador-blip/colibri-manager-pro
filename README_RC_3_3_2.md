# COLIBRÍ ERP PRO - RC 3.3.2

## Objetivo
Corregir definitivamente el problema de PC y móvil con cuadrantes distintos.

## Cambio clave
El cuadrante ya no se guarda como datos independientes por navegador. Ahora se guarda como una única fila JSON por semana en Supabase:

- Tabla: `work_schedule_weeks`
- Clave única: `restaurant_id + week_id`
- Campo principal: `data` JSONB
- Empleados: `employees` JSONB

## Instalación obligatoria
Antes de probar, ejecutar en Supabase SQL Editor:

`sql/colibri_erp_rc332_cuadrantes_fuente_unica.sql`

## Prueba correcta
1. Abrir beta en PC.
2. Entrar en Cuadrantes.
3. Añadir empleados en una franja.
4. Comprobar que arriba pone: `🟢 Guardado compartido activo`.
5. Abrir la misma semana en móvil.
6. Pulsar `Recargar de Supabase` o esperar unos segundos.
7. Debe verse exactamente lo mismo.

Si arriba aparece `Modo local` o `Error Supabase`, no hay sincronización real.
