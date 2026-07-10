# COLIBRÍ ERP PRO - Sprint 3.2.0 Cuadrantes PRO

## Objetivo
Reconstruir el módulo de cuadrantes desde cero como herramienta operativa semanal para asignar empleados por franjas, máximo 3 por franja, con salida directa para WhatsApp.

## Archivos modificados
- src/App.jsx
- src/styles.css

## Funcionalidad
- Cuadrante semanal por franjas.
- Máximo 3 empleados por franja.
- Selección desde empleados activos de Supabase.
- Alta manual rápida de empleado si no aparece en empleados.
- Guardado local compatible con fichajes y comparador (`localStorage.colibriSchedule`).
- Resumen de horas por empleado.
- Texto preparado para WhatsApp.
- Copia de imagen PNG al portapapeles si el navegador lo permite; si no, descarga PNG.

## Riesgo
Bajo/medio. No modifica SQL ni Supabase.

## Rollback
Restaurar `src/App.jsx` y `src/styles.css` anteriores.

## Pruebas realizadas
- `npm run build` correcto.
