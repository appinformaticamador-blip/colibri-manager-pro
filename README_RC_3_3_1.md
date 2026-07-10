# COLIBRÍ ERP PRO - RC 3.3.1

## Objetivo
Cuadrantes con una única fuente de datos en Supabase para que PC, móvil y tablet vean exactamente la misma semana.

## Cambios
- El módulo Cuadrantes ya no usa el navegador como fuente principal.
- Al abrir una semana hace SELECT en Supabase.
- Cada cambio guarda automáticamente en Supabase.
- Copiar semana anterior lee de Supabase.
- Duplicar semana siguiente escribe en Supabase.
- Botón “Recargar desde Supabase”.
- Mensaje claro si faltan tablas o hay error de conexión.

## SQL obligatorio
Ejecutar en Supabase SQL Editor:

`sql/colibri_erp_rc331_cuadrantes_supabase_unico.sql`

## Prueba obligatoria
1. Abrir beta en PC.
2. Crear un turno en cuadrantes.
3. Abrir beta en móvil.
4. Entrar en la misma semana.
5. Debe aparecer exactamente el mismo turno.
6. Modificar en móvil.
7. Refrescar PC.
8. Debe aparecer la modificación.

## Rollback
Volver a RC 3.3 o Sprint 3.2.8.
