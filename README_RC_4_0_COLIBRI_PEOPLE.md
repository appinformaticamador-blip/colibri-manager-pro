# RC 4.0 · COLIBRÍ PEOPLE

## Incluye
- Portal móvil del empleado en `fichar.braseria-elcolibri.es`.
- Fichaje GPS y QR conservado.
- Mi Jornada, Mi Semana, Mi Evolución y Mi Perfil.
- Resumen semanal copiable para WhatsApp.
- Horas previstas frente a cuadrante y estimación a 7 €/h.
- Solicitudes de salida olvidada desde fuera del local con hora y motivo.
- Solicitudes pendientes no se incorporan al fichaje hasta aprobación del gerente.
- Cambio de PIN por el empleado, con validación del PIN actual.
- Control completo del PIN por gerencia: visible, cambiar, generar, eliminar y bloquear.
- Alta, baja y reactivación sin borrar el histórico.
- Centro de mando de personal con horas, coste, estados, solicitudes, CSV/Excel y WhatsApp.
- PWA instalable y permiso de notificaciones.

## Instalación
1. Ejecutar `sql/colibri_erp_rc400_colibri_people.sql` en Supabase SQL Editor.
2. Subir el proyecto a `develop`.
3. Probar primero en beta y en `fichar.braseria-elcolibri.es`.

## Nota sobre notificaciones
La RC instala la web como PWA y solicita permiso de notificación. Los avisos locales funcionan con la aplicación abierta/instalada. Para push remoto garantizado con la aplicación cerrada se necesitará en una versión posterior un servicio VAPID y una tarea programada en servidor.

## Seguridad
Se conserva el acceso sencillo por nombre + PIN para compatibilidad. El PIN sigue visible para gerencia según el requisito. Para comercialización multiempresa se recomienda migrar posteriormente a sesiones de empleado y PIN cifrado/rotatorio.
