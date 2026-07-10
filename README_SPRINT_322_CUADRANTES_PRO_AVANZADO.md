# SPRINT 3.2.2 - Cuadrantes PRO avanzado

## Objetivo
Convertir el módulo de cuadrantes en una herramienta diaria de gerente para preparar la semana, reutilizar turnos anteriores y enviar el horario al grupo de WhatsApp.

## Cambios incluidos
- Gestión rápida de empleados desde el módulo.
- Categoría por empleado: Sala, Barra, Cocina, Terraza, Extra.
- Selector visual de empleados por celda.
- Máximo 3 empleados por franja horaria.
- Copiar semana anterior.
- Duplicar cuadrante a semana siguiente.
- Copiar un día completo a otro día.
- Mover empleados por arrastrar y soltar entre celdas.
- Resumen automático de horas semanales por empleado.
- Avisos si un empleado supera 40 h o trabaja 6 o más días.
- Texto profesional listo para WhatsApp.
- Exportación/copiar imagen PNG del cuadrante semanal.
- Persistencia local compatible con el comparador/fichajes actual.

## Archivos modificados
- src/App.jsx
- src/styles.css

## Riesgo
Bajo-medio. No se modifica Supabase ni tablas. No se toca TPV, Gestoría, Inteligencia ni Sync.

## Rollback
Restaurar los archivos `src/App.jsx` y `src/styles.css` de Sprint 3.2.1.

## Pruebas realizadas
- `npm run build` correcto.
