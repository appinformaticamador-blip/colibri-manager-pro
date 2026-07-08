# Colibrí ERP PRO 3.1.0 RC2

Release candidata consolidada para probar en `develop` / Beta.

## Incluye

- Ticket PRO desde mesas abiertas y últimos tickets.
- Cuentas rápidas: `CAB_MESA = 0` y `CAB_MESA >= 31` se clasifican como barra / rápidas.
- Auditoría operativa: estados `N`, `X`, `G` sin sumar como venta.
- Gestoría contable: informes por mes y trimestre, desglose IVA, formas de cobro, exportación CSV/Excel y PDF mediante impresión.
- Fichajes con puntualidad: 🟢 puntual, 🟡 +5 min, ⚠️ +10 min, 🔴 salida.
- Configuración base de objetivo IA +10%.
- Engine 3.1.0 RC2 con líneas de cuentas abiertas para mostrar ticket real.

## Instalación

1. Ejecutar en Supabase:
   `sql/colibri_erp_pro_310_rc2.sql`
2. Copiar el contenido en la rama `develop`.
3. Commit + Push.
4. Probar en Beta.
5. Compilar Engine desde GitHub Actions y sustituir EXE en el PC NUMIER.

## Nota

No borra datos existentes.
