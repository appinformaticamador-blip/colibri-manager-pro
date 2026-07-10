# COLIBRÍ ERP PRO — RC 3.3

## Objetivo
Consolidar el módulo de Cuadrantes como herramienta real de trabajo semanal.

## Incluye
- Guardado automático en Supabase.
- Recuperación automática al volver a entrar al ERP.
- Modo local de emergencia si la tabla todavía no existe.
- Copiar semana anterior.
- Duplicar a semana siguiente.
- Copiar día.
- Copias rápidas entre días consecutivos.
- Exportar WhatsApp.
- Exportar imagen.
- Exportar PDF.
- Horas semanales por empleado.
- Avisos de exceso de 40 h.
- Gestión de empleados del cuadrante.
- Arrastrar empleados entre franjas en PC.

## SQL necesario
Ejecutar en Supabase:

`sql/colibri_erp_rc33_cuadrantes_persistencia.sql`

Sin este SQL el módulo funciona en modo local, pero para que no se pierda al salir y para verlo en otros equipos debe estar aplicado.

## Pruebas
1. Ejecutar SQL en Supabase.
2. Subir proyecto.
3. Abrir Cuadrantes.
4. Añadir empleados en varias franjas.
5. Cerrar navegador y volver a abrir.
6. Comprobar que la semana sigue guardada.
7. Probar copiar semana, duplicar semana, WhatsApp, imagen y PDF.

## Rollback
Volver al ZIP Sprint 3.2.8 Productividad. Las tablas nuevas no afectan al resto del ERP.
