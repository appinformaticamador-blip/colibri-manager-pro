# Colibrí People 5.0

- `beta.braseria-elcolibri.es`: conserva y carga el ERP estable existente desde `src/App.jsx`.
- `fichar.braseria-elcolibri.es`: carga una aplicación independiente desde `src/people-entry.jsx`.
- Ambos entornos comparten Supabase.

## Despliegue
1. Sustituir el proyecto por este contenido.
2. Mantener en Vercel las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Ejecutar una sola vez `sql/COLIBRI_PEOPLE_5_0.sql` en Supabase.
4. Desplegar en Vercel.
5. Comprobar ambos dominios.

El SQL no usa una secuencia con nombre fijo y puede ejecutarse varias veces.
