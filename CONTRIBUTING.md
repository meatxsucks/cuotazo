# Contribuir

Gracias por el interés. El proyecto está en español (código, comentarios, documentación y commits).

## Regla de oro: cero datos reales

Nada de lo que subas puede contener datos de una persona real, tuyos incluidos:

- Ni RUT, nombres, correos, números de cuenta o tarjeta (tampoco las últimas 4 cifras), montos, glosas ni
  nombres de comercios de compras reales.
- Ni capturas de la banca en línea, HAR, logs de red con valores, PDFs o Excel de estados de cuenta.
- Ni claves, tokens, cadenas `postgresql://` ni refs de proyectos en la nube.

Para describir un banco basta con **rutas, nombres de campos, unidades y límites**. Si necesitas un ejemplo,
invéntalo o usa el generador del modo demo (`web/src/lib/demo/`). Antes de abrir un PR corre
[gitleaks](https://github.com/gitleaks/gitleaks): `gitleaks dir . --no-banner`.

## Proponer un extractor de banco

1. Abre un issue con la plantilla "Nuevo banco": qué productos cubre (cuentas, tarjetas, líneas, créditos),
   cómo es el login (¿pide clave dinámica? ¿registro de dispositivo?) y qué historia entrega.
2. Documenta el banco en `spec/fuentes/<Banco>.md` siguiendo el formato de `Santander.md` o `BCI.md`.
3. Implementa `extractores/bancos/productos/<banco>.mjs`:
   - Credenciales solo desde el Llavero con `credenciales()` de `comun.mjs`.
   - Ante un rechazo de clave, `bloquear()` y salir: nunca reintentar.
   - Leer las respuestas que el sitio ya recibe; no reenviar llamadas con el token de sesión.
   - Solo lectura: ningún clic que mueva plata o cambie configuraciones.
   - Conectarse solo a dominios del banco.
4. Normaliza sus productos en `utils/normalizar_productos.py` y agrega su cuadratura en `glue/jobs/fpc_cuadrar.py`.
5. En el PR, describe cómo lo probaste **sin pegar salidas con valores**: `correr.mjs` imprime solo conteos.

## Otros cambios

- Una decisión de arquitectura nueva va como ADR en `spec/decisiones/`.
- Cambiar una tabla publicada exige actualizar a la vez `spec/CONTRATO_PRESENTACION.md`, la migración de
  `supabase/migrations/` y el handler de publicación.
- La web debe pasar `npm run check` y `npm run build` en `web/`.
