# Operación

Cómo se corre Cuotazo de punta a punta. Todo lo de AWS apunta a floci (`http://localhost:4566`); para la AWS CLI:
`export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1 AWS_ENDPOINT_URL=http://localhost:4566`.

## Actualización automática y a pedido

`scripts/instalar_actualizacion.sh` instala el agente `cl.cuotazo.actualizacion` de `launchd`: cada minuto atiende el botón
**Actualizar** de la app y una vez al día (desde las 7:00) corre solo. Log en `~/.fpc/logs/actualizacion.log`;
`--quitar` lo desinstala. Detalle en [[ADR-011_Actualizacion_Y_Contabilidad]].

## Actualizar los datos a mano

1. **floci arriba:** `docker compose up -d` (datos en `~/.fpc/floci-data`).
2. **Extraer** cada banco (lee RUT y clave del Llavero, servicio `fpc`):
   ```sh
   set -a; . ./.env; set +a
   cd extractores/bancos && node correr.mjs santander   # o falabella, bci
   ```
   Guarda el JSON en `s3://fpc-raw/productos/<banco>/usuario=<id>/fecha_carga=…/` e imprime solo conteos.
3. **Cargar la bodega:** `bash scripts/cargar_bodega.sh` (con `.env` cargado). Debe terminar en `cuadraturas OK: True`.
4. **Publicar en Supabase:** `aws lambda invoke --function-name fpc-publicar-supabase --cli-read-timeout 300 salida.json`
   y revisar los conteos por tabla en `salida.json`. Si un usuario falla, su transacción se revierte y quedan sus datos anteriores.

## Credenciales y secretos

- Bancos: Llavero de macOS, servicio `fpc` ([[ADR-003_Scraper_Open_Banking_Chile]]). Si un banco rechaza la clave, el
  extractor crea `~/.fpc/bloqueos/<banco>` y no reintenta: entrar a mano al sitio del banco, confirmar que la clave
  funciona y recién ahí borrar el archivo.
- `.env`: solo `CLAVE_SEUDONIMO`, `POSTGRES_PASSWORD` y `FPC_USUARIO_ID`.
- Cadena de Postgres de Supabase: en el Llavero; `scripts/cargar_secreto_supabase.sh` la copia al secreto `fpc/supabase` de floci.

## Infraestructura

```sh
set -a; . ./.env; set +a
export TF_VAR_clave_seudonimo=$CLAVE_SEUDONIMO TF_VAR_postgres_password=$POSTGRES_PASSWORD
scripts/empaquetar_lambda.sh publicar_supabase
cd infra/terraform && terraform plan   # debe decir "No changes" si nada cambió
```

## Cambios en Supabase

1. Nueva migración numerada en `supabase/migrations/NNNN_nombre.sql`.
2. Aplicarla en una sola transacción: con la herramienta de migraciones de Supabase o con
   `psql "$URL" -X -v ON_ERROR_STOP=1 -1 < archivo.sql` (hay `psql` dentro del contenedor de RDS de floci).
3. `notify pgrst, 'reload schema';` para que la API vea los cambios.
4. Probar RLS simulando cada rol dentro de una transacción que se revierte:
   `set_config('request.jwt.claims', '{"sub":"<auth id>","role":"authenticated"}', true); set local role authenticated;`.
5. Actualizar [[CONTRATO_PRESENTACION]] y, si es una decisión, un ADR.

## App web

```sh
cd web
npm run dev                                                   # con web/.env (PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY)
PUBLIC_SUPABASE_URL= PUBLIC_SUPABASE_ANON_KEY= npx vite dev   # modo demo, sin login
npm run check && npx vitest run && npm run build
vercel deploy --prod --yes                                    # en el equipo de Vercel del proyecto
```

Las capturas de `docs/capturas/` se sacan del modo demo con Playwright y Chrome local.

## Problemas conocidos

- **OneDrive y git:** `fatal: mmap failed: Operation timed out` cuando OneDrive dejó archivos solo en la nube. Marcar la
  carpeta del repo como "Mantener siempre en este dispositivo".
- **BCI:** a veces el navegador se cierra durante el login o no llega al portal; reintentar una vez.
- **Falabella:** si el login queda trabado ("no avanzó en 60 s"), no reintentar seguido para no bloquear la clave.
- **IPv6 roto en la red de la casa:** el router anuncia una ruta IPv6 sin entregar dirección; Chrome intenta Falabella
  (Cloudflare) por IPv6 y falla con `ERR_SOCKET_NOT_CONNECTED`. Se resuelve con `sudo networksetup -setv6off Wi-Fi`
  (revertir con `-setv6automatic`).
- **Docker apagado tras reiniciar el Mac:** el agente lo levanta solo antes de actualizar.
- **Correos de Supabase:** sin SMTP propio solo llegan al equipo del proyecto; las personas invitadas entran con Google.
  La invitación al hogar no envía correo.
- **Ícono en iPhone:** Safari guarda el ícono viejo; borrar el acceso de la pantalla de inicio y volver a agregarlo.
