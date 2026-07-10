# RC 3.3.7 - Cuadrantes empleados reales + cerrado + scroll

Cambios incluidos:
- Lista base corregida: ALFONSO, SONIA, ALVARO, JOSE, KATHY, ORLANDO, PABLO, PRUEBA.
- Eliminados empleados antiguos no válidos como Iván/Javi del selector de cuadrantes.
- Carga empleados activos del módulo Empleados desde Supabase con `select('*')`.
- Máximo 4 empleados por franja.
- Opción CERRADO reforzada en selector, celda negra y letras blancas.
- Mantiene arrastrar/duplicar en PC y tocar/arrastrar en móvil.
- Ajuste visual para que el cuadrante no se meta debajo de la barra superior.

No requiere SQL nuevo si ya está ejecutado el SQL de RC 3.3.2.
