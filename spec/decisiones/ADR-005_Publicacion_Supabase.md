# ADR-005 — Publicación de la capa de presentación en Supabase

**Estado:** aceptada · **Fecha:** 2026-09-29

## Contexto

La app web (SvelteKit en Vercel) necesita leer los datos de [[CONTRATO_PRESENTACION]] desde internet, con
login y separación estricta por usuario. La bodega vive en floci, en el Mac, y no es alcanzable desde Vercel.

## Decisión

- Supabase (esquema `finanzas`) es la base que lee la app: trae Auth, Row Level Security aplicado por
  PostgREST y un cliente que la app ya usa.
- La Lambda `fpc-publicar-supabase` (floci, Python 3.12 arm64) lee `presentacion.*` de la bodega y escribe
  en `finanzas.*`. Schedule `fpc-publicar-supabase-1h`, deshabilitado hasta que exista el proyecto
  (`publicacion_programada = true` lo activa).
- **Vía: conexión Postgres directa por el pooler de Supabase**, no PostgREST. El secreto `fpc/supabase`
  guarda `{ "db_url": "postgresql://postgres.<ref>:<clave>@aws-0-<región>.pooler.supabase.com:6543/postgres" }`.
  Motivos: cada usuario se publica en una sola transacción (borrar y reinsertar derivados sin dejar a la app
  viendo tablas vacías o a medias), carga por `COPY` a tablas temporales en vez de miles de peticiones HTTP,
  y la misma librería (`psycopg`) sirve para leer la bodega. El usuario `postgres` es dueño de las tablas y
  no pasa por RLS, igual que la service role. Se usa el modo transacción (6543) con sentencias preparadas
  desactivadas.
- Idempotencia, por usuario y en una transacción:
  - `usuario`: upsert de `nombre_visible`; nunca toca `auth_user_id`.
  - `movimiento`: upsert por `(usuario_id, movimiento_id)` y baja de los movimientos del rango de fechas
    publicado que ya no vienen (p. ej. un pendiente que pasó a contable con otro id). Lo anterior al rango se conserva.
  - `gasto_diario`, `resumen_mensual`, `deuda_producto`, `deuda_cuota_mes`, `saldo_cuenta`: se borran las
    filas del usuario y se reinsertan.
  - `presupuesto`: nunca se toca; lo escribe solo el usuario desde la app.
  - `publicacion (usuario_id, tabla, publicado_en, filas)`: se actualiza en la misma transacción, para que la
    app muestre "actualizado a las…"; lectura del dueño.
- Un valor fuera del contrato (p. ej. una categoría que no está en el catálogo) aborta la transacción de ese
  usuario y deja publicado lo anterior; los demás usuarios se publican igual y la invocación termina con error
  indicando tipo, tabla, columna y restricción, sin valores.
- RLS en las nueve tablas. Lectura solo del dueño vía `finanzas.mi_usuario_id()` (security definer, resuelve
  `auth.uid()` contra `finanzas.usuario.auth_user_id`); `authenticated` solo escribe en `presupuesto`;
  `anon` no tiene ningún permiso sobre el esquema.

## Qué se publica y qué no

Se publica exactamente lo del contrato: movimientos con glosa y comercio, agregados diarios y mensuales,
deudas, cuotas futuras y saldos. No se publica RUT, nombre legal, números completos de cuenta o tarjeta, link
tokens, credenciales ni nada de `sensible/` o `dw.dim_usuario_sensible`.

## Activación (cuando se elija el proyecto)

1. Aplicar `supabase/migrations/0001_finanzas.sql` en el proyecto elegido (SQL Editor o `supabase db push`).
2. Exponer el esquema: Project Settings → Data API (antes Settings → API) → Exposed schemas → agregar `finanzas`.
3. Copiar la cadena del pooler en modo transacción (Connect → Transaction pooler) a `SUPABASE_DB_URL` en `.env`.
4. `scripts/empaquetar_lambda.sh publicar_supabase` y `terraform apply` con
   `TF_VAR_supabase_db_url=$SUPABASE_DB_URL` (y `TF_VAR_publicacion_programada=true` para el schedule).
5. Vincular la cuenta: crear el usuario en Auth y `update finanzas.usuario set auth_user_id = '<auth.users.id>'
   where usuario_id = '<FPC_USUARIO_ID>'` después de la primera publicación.

## Alternativas

- **PostgREST con la service role key:** sin transacciones entre borrar e insertar (habría que envolverlo en
  funciones RPC) y una petición por lote; se descarta por eso, aunque evita abrir el puerto Postgres.
- **Todo local (app contra la bodega en floci, túnel o Postgres propio):** los datos no salen del Mac, pero
  la app en Vercel no llega sin exponer la máquina, y habría que reimplementar login y RLS. Descartada.

## Riesgos y consecuencias

- Los datos financieros salen del Mac y quedan en un tercero (Supabase, región del proyecto). Mitigación: RLS
  en todo, sin datos identificatorios, `anon` sin permisos, clave solo en Secrets Manager de floci.
- La cadena `db_url` da acceso total a la base: si se filtra, se rota la clave de la base en Supabase.
- Olvidar exponer `finanzas` o un cambio de grants deja a la app sin datos, pero no abre acceso.
- Si la publicación falla, la app muestra la última corrida completa por usuario, no datos a medias.
- Cambiar una columna exige actualizar a la vez el contrato, la migración y `TABLAS` en el handler.
