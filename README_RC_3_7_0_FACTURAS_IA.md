# COLIBRÍ ERP PRO · RC 3.7.0 · Facturas IA

## Qué añade

- Procesamiento automático de fotos y PDF de facturas.
- Estados: En cola, Procesando IA, Revisar, Completada y Error.
- Progreso visible y actualización automática cada 5 segundos.
- Detección de proveedor, número, fecha, totales y líneas.
- Proveedor nuevo: se propone y se crea solo tras confirmarlo.
- Artículos nuevos: quedan pendientes para clasificarlos una sola vez.
- Categorías de compras: materias primas, bebidas, consumibles, limpieza, menaje, utensilios, energía, mantenimiento y otros.
- Los datos no afectan a costes ni márgenes hasta completar la revisión.
- Fotos/PDF conservados 4 meses. Después se elimina el archivo, pero se mantienen todos los datos extraídos y el histórico.

## Instalación obligatoria

### 1. SQL

Ejecuta en Supabase SQL Editor:

`sql/colibri_erp_rc370_facturas_ia_retencion.sql`

### 2. Desplegar Edge Functions

Desde Supabase CLI, en la raíz del proyecto:

```bash
supabase functions deploy process-purchase-invoice
supabase functions deploy cleanup-purchase-invoices
```

### 3. Configurar secretos

```bash
supabase secrets set OPENAI_API_KEY=TU_CLAVE
supabase secrets set OPENAI_INVOICE_MODEL=gpt-4.1-mini
```

`OPENAI_INVOICE_MODEL` es opcional. Puedes sustituirlo por otro modelo compatible con imagen/PDF y salida estructurada.

## Eliminación automática a los 4 meses

El ERP llama a la función de limpieza al abrir el módulo Rentabilidad. Así, cualquier archivo vencido se elimina automáticamente. Los datos estructurados permanecen.

Para garantizar la limpieza aunque nadie abra el ERP, programa `cleanup-purchase-invoices` una vez al día desde Supabase Cron/Integrations.

## Flujo

1. Subir foto/PDF.
2. Se crea la factura en estado `En cola`.
3. La IA extrae datos.
4. El estado cambia a `Revisar`.
5. Confirmar proveedor y clasificar artículos nuevos.
6. Pulsar `Finalizar revisión`.
7. Costes e históricos quedan activos.

## Rollback

La RC 3.6.0 sigue siendo compatible con las tablas ampliadas. Para volver, restaura `src/App.jsx`, `src/styles.css` y `package.json` de la versión anterior. No es necesario borrar las nuevas columnas.
