# RC 3.6.0 · Costes y Rentabilidad

## Incluye
- Nuevo módulo Rentabilidad en la navegación.
- Proveedores dinámicos.
- Subida de facturas en foto o PDF a Supabase Storage.
- Bandeja de facturas pendientes de revisión.
- Introducción y confirmación de artículos por factura.
- Cálculo de coste unitario por bulto y unidades.
- Histórico y variación de precios.
- Comparación de proveedores.
- PVP, beneficio unitario y margen.
- Avisos por subidas superiores al 8%.
- Exportación CSV.

## Instalación
1. Sustituir los archivos del proyecto o usar el ZIP completo.
2. Ejecutar en Supabase SQL Editor: `sql/colibri_erp_rc360_costes_rentabilidad.sql`.
3. Commit y push a `develop`.

## Nota sobre lectura automática
La factura se almacena y queda en estado `Pendiente de revisión`. La extracción OCR/IA requiere una función segura de servidor y un proveedor de visión configurado; esta RC no inventa datos a partir de imágenes. La estructura `extraction_payload` queda preparada para incorporar esa automatización sin cambiar las tablas.
