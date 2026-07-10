# Sprint 3.0.2 · Estado del Servicio LIVE

## Incluye

- Nuevo módulo `servicio` en el ERP.
- Lectura de cuentas abiertas de NUMIER: `CAB_ESTADO = P`.
- Lectura de mesa mediante `CAB_MESA` / alternativas.
- Zonas:
  - 00–19: Terraza.
  - 20–30: Salón.
  - 31+: Barra / cuenta rápida.
- Consumo actual por mesa.
- Tiempo desde apertura.
- Pendiente de cobro.
- Ocupación por zona.
- Panel profesional con firma de C.G. 21 S.L.

## Instalación

1. En Supabase ejecuta:
   `sql/colibri_erp_pro_302_estado_servicio.sql`

2. Sustituye en tu rama `develop`:
   - `src/App.jsx`
   - `src/styles.css`
   - `sync/ColibriSync/Program.cs`
   - `sql/colibri_erp_pro_302_estado_servicio.sql`

3. Commit en `develop`:
   `Sprint 3.0.2 Estado del Servicio LIVE`

4. Push.

5. Vercel desplegará Beta.

6. Compila el nuevo Colibrí Engine desde GitHub Actions y sustituye el EXE en el PC de NUMIER.

## Nota importante

El módulo muestra cuentas abiertas que el Engine haya visto en los últimos 5 minutos.
Si una cuenta se cierra en NUMIER, desaparecerá de la pantalla al dejar de verse como `P`.
