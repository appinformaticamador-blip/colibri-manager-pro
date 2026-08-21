# COLIBRÍ ERP 5.1.4 — Conciliación por fecha y hora

- La conciliación SumUp/Numier permite indicar fecha y hora exactas de inicio.
- El mismo corte temporal se aplica a los cobros SumUp y a los tickets Numier.
- Opcionalmente se puede limitar también una fecha/hora final.
- El filtro de cuenta sigue aceptando solo Bar Colibri.
- El listado importado queda en memoria para cambiar el periodo y recalcular sin volver a subir el Excel.
- El informe Excel exportado incluye Desde/Hasta del periodo conciliado.

Nota de integración GitHub: el cambio de `src/App.jsx` y `src/styles.css` se aplica de forma reproducible antes de `dev`/`build` mediante `scripts/apply-colibri-5-1-4.mjs`, usando el parche versionado en `.github/patches/`.
