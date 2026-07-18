# Colibrí People v4.3 — reestructuración visual completa

Corrección integral de `fichar.braseria-elcolibri.es`.

## Cambios
- Un único portal People para el dominio de fichaje.
- Acceso centrado y adaptado a móvil, tablet y ordenador.
- Formulario con selector de empleado, PIN, mostrar/ocultar PIN y mensajes claros.
- Validación de acceso por ID de empleado y comparación segura del PIN.
- Panel autenticado responsive, sin desbordamientos horizontales.
- Cabecera, pestañas, tarjetas, botones y modales adaptados a pantallas pequeñas.
- Se mantienen las funciones de fichaje GPS/QR, semana, evolución y perfil.

## Despliegue
No requiere SQL ni cambios en ColibriEngine. Sustituir los archivos incluidos, hacer push y desplegar en Vercel.

Compilación verificada con `npm run build`.
