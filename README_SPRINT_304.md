# Sprint 3.0.4 · Firma profesional + Colibrí Engine protegido

## Incluye

### ERP Web
- Menú `ayuda` con pantalla **Acerca de Colibrí ERP**.
- Versión visible: **3.0.4**.
- Compilación visible: **2026.07.08.004**.
- Pie profesional en el Manager.
- Firma profesional:
  - **C.G. 21 S.L.**
  - C/ Amador de los Ríos, 16
  - 41003 Sevilla
  - 954 533 502

### Colibrí Engine Windows
- Versión **3.0.4**.
- Mensaje profesional de soporte al iniciar.
- Cierre protegido con clave.
- Al pulsar `Q`, pide clave de administrador.
- Clave por defecto: `131313`.
- Instalación automática en inicio de Windows mediante registro de usuario.
- Comandos incluidos:
  - `ColibriEngine.exe --install-startup`
  - `ColibriEngine.exe --uninstall-startup`
- Scripts incluidos:
  - `instalar_inicio_windows.bat`
  - `quitar_inicio_windows.bat`

## Instalación en develop / Beta

1. Sustituye en tu repo:
   - `src/App.jsx`
   - `src/styles.css`
   - `sync/ColibriSync/Program.cs`
   - `sync/ColibriSync/ColibriSync.csproj`
   - `.github/workflows/build-colibri-sync-dotnet.yml`
   - `sync/ColibriSync/instalar_inicio_windows.bat`
   - `sync/ColibriSync/quitar_inicio_windows.bat`

2. Commit:
   `Sprint 3.0.4 firma profesional y Engine protegido`

3. Push a `develop`.

4. Vercel actualizará Beta.

5. GitHub Actions compilará el nuevo Engine.

6. Descarga el artifact y sustituye el Engine del PC de NUMIER.

## Notas

- No necesita SQL nuevo.
- No toca producción.
- No cambia datos de Supabase.
- El cierre por X de la ventana de consola no se puede bloquear completamente en esta versión de consola. La protección se aplica al cierre normal con `Q`. El siguiente paso profesional será convertirlo en servicio/tray app para ocultar la consola completamente.
