# COLIBRÍ ERP 4.4.3 — Corrección de personal en rentabilidad

## Correcciones

- Los marcadores `__cerrado__`, `cerrado`, `__closed__` y equivalentes representan un local cerrado y generan **0 horas y 0 €**.
- Un UUID o nombre guardado en el cuadrante solo genera coste si puede resolverse contra un empleado real de la tabla `employees`.
- Los identificadores huérfanos se excluyen del cálculo y se registran internamente en `details.invalidScheduleEntries` para diagnóstico.
- Cuando el cuadrante contiene un UUID válido, el detalle muestra el nombre actual del empleado, nunca el UUID.
- Se conserva la compatibilidad con cuadrantes antiguos que almacenaban el nombre, siempre que ese nombre corresponda a un empleado existente.

## Regla aplicada

Solo los empleados reales de la fuente única `employees` pueden generar horas previstas y coste de personal.
