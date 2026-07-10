# Sprint 3.0.3 · Mejoras Estado del Servicio

Incluye mejoras visuales y operativas sobre el módulo Estado del Servicio:

- Semáforo de tiempo de mesas abiertas:
  - Verde: menos de 30 min
  - Amarillo: 30-60 min
  - Naranja: 60-90 min
  - Rojo: más de 90 min
- Consumo integrado dentro del círculo de cada mesa abierta.
- Barras visuales de ocupación.
- Facturación potencial: vendido hoy + pendiente de cobro.
- Lectura IA del servicio en tiempo real.
- Ficha de mesa al pulsar una mesa abierta.
- Firma profesional C.G. 21 S.L. actualizada a versión 3.0.3 Beta.

No incluye datos de camarero en mesa para evitar información errónea.

## Instalación

1. Trabajar siempre en rama `develop`.
2. Sustituir:
   - `src/App.jsx`
   - `src/styles.css`
3. Commit recomendado:
   `Sprint 3.0.3 mejoras estado del servicio`
4. Push.
5. Probar en `beta.braseria-elcolibri.es`.

No requiere SQL nuevo ni recompilar el Engine si ya tienes funcionando el Sprint 3.0.2.
