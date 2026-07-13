# COLIBRÍ ERP PRO · RC 3.9.0 · Escandallos profesionales

## Resultado

- Escandallos conectados con artículos y PVP de NUMIER.
- Conversión segura entre gramos/kilogramos y mililitros/litros.
- Coste por unidad para ingredientes contables.
- Coste basado en la compra más reciente, con proveedor y fecha visibles.
- Coste manual como respaldo cuando la unidad de factura no es convertible.
- Merma por ingrediente y coste indirecto configurable por receta.
- Coste total del lote, coste por ración, beneficio, margen y PVP objetivo.
- Avisos por ingredientes sin coste, unidades incompatibles o PVP ausente.
- Alta, edición, duplicado guiado, archivado y reactivación.
- Guardado atómico mediante función SQL y versionado de cada escandallo.
- Estados de carga, notificaciones de éxito/error y diseño móvil adaptado.
- Pruebas automáticas del motor de conversiones y costes.

## Instalación obligatoria

Ejecutar en Supabase SQL Editor:

`sql/colibri_erp_rc390_escandallos_profesionales.sql`

La migración es acumulativa sobre RC 3.8.0. No elimina recetas, ingredientes ni vínculos NUMIER existentes.

## Validación local

```text
npm ci
npm run typecheck
npm test
npm run build
```

No requiere volver a desplegar las Edge Functions.
