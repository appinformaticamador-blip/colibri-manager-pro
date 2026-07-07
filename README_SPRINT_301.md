# Sprint 3.0.1 · Centro de Mando PRO

Instalación en beta:

1. Copia todo el contenido de este paquete sobre tu proyecto local `colibri-manager-pro`.
2. Asegúrate en GitHub Desktop de estar en la rama `develop`.
3. Commit: `Sprint 3.0.1 Centro de Mando PRO`.
4. Push origin.
5. Prueba en `https://beta.braseria-elcolibri.es`.

## Incluye

- Nuevo Centro de Mando PRO 3.0.
- Tarjetas ejecutivas: ventas, tickets, previsión, comparativa semanal, personal y estado LIVE.
- Objetivo diario inicial: 4.000 €.
- Tarjeta “Qué deberías saber ahora”.
- Ventas por hora.
- Alertas inteligentes iniciales:
  - Sync parado más de 15 minutos.
  - Empleado con turno en cuadrante local y sin fichar tras 10 minutos.
  - Previsión de cierre por debajo del 80% del objetivo.
- Rentabilidad por turnos con coste personal de 7 €/h.
- Productos TOP.
- Timeline del día.
- Últimos tickets.

## Importante

No requiere SQL nuevo. No toca Supabase ni borra datos.

Este sprint solo modifica el frontend (`src/App.jsx` y `src/styles.css`).
