# Colibrí ERP Cloud PRO v2

ERP Cloud para Brasería El Colibrí.

## Accesos

- Gestión: `https://manager.braseria-elcolibri.es`
- Fichajes empleados: `https://fichar.braseria-elcolibri.es`

## Variables de entorno en Vercel

```env
VITE_SUPABASE_URL=https://xccyaoziutlxxklcofrw.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
VITE_ADMIN_PIN=131313
VITE_BAR_LAT=37.3891
VITE_BAR_LNG=-5.9845
VITE_BAR_RADIUS_METERS=80
```

## Instalación en GitHub

Sube el contenido descomprimido de esta carpeta al repositorio `colibri-manager-pro`.
Vercel desplegará automáticamente.

## Módulos incluidos

- Dashboard gerente
- Cuadrantes semanales
- Portal empleados separado por dominio
- Fichajes con GPS
- Panel de fichajes
- Empleados
- Horas y nóminas base
- Inventario, compras e IA preparados para próximas versiones


## v3 - GPS y QR del bar

- Coordenadas configuradas para Avenida Carlos V, Local 3, Sevilla: `37.3804817, -5.9864303`.
- Radio inicial: `75` metros.
- Si el GPS falla o marca fuera, el empleado puede escanear el QR físico del bar: `public/qr_bar_colibri.png`.
- El QR abre `https://fichar.braseria-elcolibri.es/?qr=COLIBRI-LOCAL-CV3-2026` y el fichaje queda anotado como validado por QR.

Sube el contenido completo a GitHub y Vercel desplegará automáticamente.
