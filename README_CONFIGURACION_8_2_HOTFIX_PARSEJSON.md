# Configuración 8.2 Hotfix parseJSON

Corrige el error `Can\x27t find variable: parseJSON` del módulo Configuración.

- Se añade un lector JSON local de ámbito global.
- Configuración deja de depender de la función privada de Cuadrantes.
- No borra ni reinicia datos locales.
