# Colibrí ERP 4.4 Core

## Cambios
- Nuevo módulo **Resultado real** con una fórmula única para todo el ERP.
- Ventas − productos − personal − gastos fijos − gastos variables.
- Alta, pausa y eliminación de gastos fijos.
- Alta y eliminación de gastos variables.
- Selector Hoy, Ayer, 7 días, 30 días, Mes, Año o fecha.
- Personal calculado desde cuadrantes con coste/hora individual del empleado y 7 €/h de respaldo.
- Corrección de sesiones con entradas duplicadas: un turno solo queda abierto cuando el último movimiento real es una entrada.
- Semana ISO corregida para que Personal y Cuadrantes consulten la misma semana.
- Inteligencia, Dashboard, Centro de Mando y Resultado real consumen `loadRealProfitability`.

## SQL
Ejecutar una vez `sql/COLIBRI_ERP_4_4_CORE_RENTABILIDAD.sql` en Supabase.

## Verificación
- TypeScript/JSX: correcto, sin errores.
- Imports locales: comprobados.
- `npm ci` no pudo completarse en el entorno por un error 404 del proxy interno de paquetes; no se afirma build Vite completo.
