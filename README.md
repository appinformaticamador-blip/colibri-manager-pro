# Colibrí ERP v1.2 - Cierre manual de turnos

ERP Cloud para Brasería El Colibrí.

## Instalación rápida

1. Ejecutar `supabase/colibri_erp_clean_v1.sql` en Supabase SQL Editor.
2. Subir este proyecto a GitHub.
3. Vercel despliega automáticamente.
4. Variables necesarias en Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

Accesos:
- Manager: `manager.braseria-elcolibri.es`
- Fichaje: `fichar.braseria-elcolibri.es`

Clave manager temporal: `131313`.

## Novedad v1.2

- En **Manager → Fichajes** aparece una sección **Fichajes abiertos**.
- Permite cerrar manualmente el turno de un empleado si olvidó fichar salida.
- El cierre queda registrado como `SALIDA MANUAL POR MANAGER` con motivo y hora real.

## Actualización

1. Ejecuta en Supabase el archivo:
   `supabase/colibri_erp_v12_cierre_manager.sql`
2. Sube el contenido del proyecto a GitHub.
3. Commit + Push.
4. Vercel desplegará automáticamente.
