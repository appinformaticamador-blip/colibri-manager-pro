# COLIBRÍ ERP 4.4 CORE

Versión unificada del ERP de gestión de Brasería El Colibrí.

## Núcleo compartido

- `employees` es la fuente principal para identidad, nombre, PIN, puesto, color, coste/hora, estado y permiso de fichaje.
- Los cuadrantes conservan referencias por ID y migran referencias antiguas por nombre al guardar una ficha.
- El estado trabajando se reconstruye mediante secuencia Entrada → Salida. Una entrada duplicada no cierra artificialmente un turno.
- El coste de personal devengado se calcula con fichajes reales y tarifa individual. Si no existen fichajes en el periodo, el cuadrante se utiliza como previsión explícita.
- Gastos fijos se prorratean por día natural y vigencia.
- Gastos variables se imputan íntegramente en su fecha.
- Rentabilidad, Inteligencia y Dashboard consumen el mismo cargador `loadRealProfitability` y el mismo motor `calculateProfitability`.

## Entradas separadas

- Gerencia: `beta.braseria-elcolibri.es` → `src/App.jsx`
- Empleados: `fichar.braseria-elcolibri.es` → `src/people-entry.jsx`

La selección se mantiene en `src/main.jsx`. Ambos frontends comparten Supabase, pero no el punto de entrada.

## SQL requerido

Ejecutar en Supabase SQL Editor:

1. `sql/COLIBRI_ERP_4_3_PERSONAL_UNIFICADO.sql` si no se aplicó anteriormente.
2. `sql/COLIBRI_ERP_4_4_CORE_RENTABILIDAD.sql`.

La migración 4.4 es idempotente y no elimina datos. Añade campos de ciclo de vida, gastos completos y la función transaccional `close_employee_open_shift`.

## Instalación y despliegue

```bash
npm ci --no-audit --no-fund
npm run build
```

Después, desplegar la rama `develop` en Vercel con Node.js 22.x y las variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Cambios principales

- Motor común en `src/modules/coreBusiness.js`.
- Reparación de turnos abiertos y entradas duplicadas.
- Cierre manual validado y auditado mediante RPC con compatibilidad de respaldo.
- Costes por empleado desde `hourly_rate`, con 7 €/h únicamente como valor por defecto.
- Personal devengado desde `clock_records`; cuadrante como previsión cuando no hay fichajes.
- Portal del empleado protegido contra entradas o salidas incoherentes.
- Versión de paquete actualizada a 4.4.0.

## Limitaciones conocidas

- El SQL debe aplicarse antes de usar el cierre transaccional; el frontend conserva un respaldo compatible con instalaciones anteriores.
- Los cuadrantes históricos que solo contienen nombres se convierten a ID cuando se guarda la ficha del empleado afectado.
- La compilación requiere acceso completo al registro npm. En el entorno de generación, el proxy del registro no sirvió `xlsx@0.18.5`, por lo que debe repetirse `npm ci` y `npm run build` en GitHub Actions, Vercel o un equipo con acceso normal a npm.
