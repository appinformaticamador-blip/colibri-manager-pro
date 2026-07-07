# Colibrí ERP PRO 3.0 — Sprint 3.0.1

## Centro de Mando Ejecutivo

Esta entrega está pensada para instalarse primero en la rama `develop` y probarse en `beta.braseria-elcolibri.es`.

### Incluye

- Nuevo Centro de Mando PRO en el dashboard.
- KPIs principales: ventas, predicción, tickets, comparativa, personal.
- Objetivo diario inicial: 4.000 €.
- Tarjeta “Qué deberías saber ahora”.
- Alertas operativas no invasivas.
- Detección básica de empleados programados que no han fichado, usando el cuadrante local.
- Turnos de negocio: desayuno, almuerzo, tarde y cena.
- Productos TOP.
- Timeline del día.
- Visor de ticket al pulsar en últimos tickets.
- Botón para copiar ticket en formato WhatsApp.

### Instalación

1. Descomprime el ZIP.
2. Copia `src/App.jsx` y `src/styles.css` sobre tu proyecto actual.
3. Asegúrate de estar en la rama `develop`.
4. Haz commit:
   `Sprint 3.0.1 Centro de Mando PRO`
5. Haz push.
6. Prueba en `beta.braseria-elcolibri.es`.

### Notas

- No toca Supabase.
- No toca Colibrí Sync.
- No toca producción.
- Los nombres reales de productos aparecerán cuando el Engine sincronice `articulos.DBF`; mientras tanto usa la descripción/código ya disponible en las líneas.
