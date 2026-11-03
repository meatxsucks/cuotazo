#!/usr/bin/env bash
# Aplica las migraciones de supabase/migrations en Neon, traduciendo lo propio de Supabase Auth a Neon Auth.
# Uso: scripts/aplicar_migraciones_neon.sh <url_postgres>   (por defecto NEON_DB_URL del Llavero; psql corre en Docker)
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${1:-$(security find-generic-password -s fpc -a NEON_DB_URL -w)}"
{
  cat neon/preambulo.sql
  for f in supabase/migrations/*.sql; do
    sed -e 's/ references auth\.users (id) on delete set null//' \
        -e 's/from auth\.users u where u\.id = auth\.uid() and u\.email_confirmed_at is not null/from neon_auth."user" u where u.id = auth.uid() and u."emailVerified"/' \
        -e "/notify pgrst/d" "$f"
  done
} | docker run --rm -i postgres:17 psql "$URL" -1 -v ON_ERROR_STOP=1 -q
