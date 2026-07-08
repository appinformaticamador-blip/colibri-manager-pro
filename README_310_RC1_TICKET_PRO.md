# Colibrí ERP PRO 3.1.0 RC1 · Ticket PRO

Incluye:
- Ticket real al pulsar una mesa o cuenta abierta.
- Ticket completo desde TPV → Últimos tickets.
- Copiar ticket para WhatsApp.
- Botón imprimir.
- El Engine ahora sincroniza líneas de cuentas abiertas `P`, no solo tickets cerrados.

Instalación en `develop`:
1. Copiar `src/App.jsx`, `src/styles.css` y `sync/ColibriSync/Program.cs`.
2. Commit: `3.1.0 RC1 Ticket PRO`.
3. Push.
4. Compilar Engine en Actions y sustituir EXE en el PC de NUMIER.
5. Probar en Beta.

No necesita SQL nuevo si ya existen `numier_ticket_lines`, `numier_open_accounts` y `numier_articles`.
