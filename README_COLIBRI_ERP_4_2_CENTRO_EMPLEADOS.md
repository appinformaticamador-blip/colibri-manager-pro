# COLIBRÍ ERP 4.2 · Centro de control de empleados

## Novedades
- Fichas individuales editables: nombre, PIN, puesto, color, coste/hora, permiso de fichaje y estado.
- Resumen por empleado de horas semanales, mensuales, jornadas y turno abierto.
- La tabla `employees` pasa a ser la fuente principal del cuadrante.
- El cuadrante conserva el UUID de Supabase y deja de depender del nombre visible.
- Renovación de Fichajes y Puntualidad con filtros, indicadores y diseño móvil.
- Cierre manual de turnos con fecha, hora y motivo auditado en la nota.

## Supabase
Ejecutar una vez `sql/COLIBRI_ERP_4_2_CENTRO_EMPLEADOS.sql`.

## Verificación
- `npm ci --no-audit --no-fund`
- `npm run build`
