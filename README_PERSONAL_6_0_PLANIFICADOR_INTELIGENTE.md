# Colibrí Personal 6.0 — Planificador inteligente

## Incluye
- Análisis de los últimos 90 días de tickets cobrados de Numier.
- Predicción de ventas y tickets por día de la semana y franja horaria.
- Recomendación automática de 1 a 4 empleados por franja.
- Comparación entre plantilla programada y recomendada.
- Coste previsto de personal a 7 €/hora y porcentaje sobre ventas.
- Botón para aplicar la propuesta a la semana seleccionada.
- Reparto automático equilibrando las horas entre empleados activos.
- Diseño responsive para móvil.

## Seguridad
La propuesta nunca marca una franja como cerrada. Las franjas ya marcadas como CERRADO se respetan. Tras aplicar la propuesta debe revisarse antes de publicar.

## Base de datos
No requiere SQL nuevo. Usa `numier_tickets` y `work_schedule_weeks` existentes.
