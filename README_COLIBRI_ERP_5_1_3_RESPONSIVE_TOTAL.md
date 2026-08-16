# COLIBRÍ ERP 5.1.3 · Responsive total PC + móvil

## Objetivo
Mantener todas las vistas completas en escritorio y hacer que toda la interfaz sea utilizable en móvil sin conservar anchos de PC ni provocar desplazamiento lateral de página.

## Cuadrante
- En escritorio conserva la tabla semanal completa.
- En móvil la tabla se transforma visualmente en tarjetas verticales por franja horaria.
- Cada día aparece como fila pulsable dentro de la franja.
- Se conservan asignación, CERRADO, copia táctil y edición de celdas.
- Botonera de control semanal, copia de días, empleados y resumen se adaptan a 1/2 columnas según ancho.

## Revisión global
- Blindaje de `min-width`, overflow horizontal y contenido largo.
- Tablas grandes permanecen contenidas dentro de su bloque.
- Modales limitados al viewport móvil.
- Formularios, botones y grids no pueden ensanchar la página.
- Mantiene intacta la experiencia de escritorio.
