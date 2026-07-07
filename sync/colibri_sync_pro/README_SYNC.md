# Colibrí Sync PRO

Sincroniza `C:\NUMIER\DATOS` con Supabase para alimentar Colibrí ERP.

## Instalación rápida

1. Ejecuta en Supabase el archivo `sql/numier_sync_tables.sql`.
2. Copia `config.example.json` como `config.json`.
3. Rellena `supabase_anon_key`.
4. Ejecuta `instalar_dependencias.bat`.
5. Ejecuta `sincronizar_ahora.bat`.

## EXE con GitHub Actions

1. Sube esta estructura al repositorio.
2. En GitHub abre `Actions`.
3. Ejecuta `Build Colibri Sync EXE`.
4. Descarga el artefacto `ColibriSync-Windows`.
