#!/usr/bin/env bash
# En el equipo origen: empaqueta lo que no está en git para llevarlo al otro PC (datos crudos de los bancos, .env y secretos).
# Uso: scripts/exportar_estado.sh [carpeta destino]  -> deja cuotazo-estado.tar.gz.gpg (cifra con una frase aleatoria guardada en ~/cuotazo-frase.txt; no la copies al pendrive)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f "$HOME/cuotazo-frase.txt" ] || { openssl rand -base64 24 > "$HOME/cuotazo-frase.txt"; chmod 600 "$HOME/cuotazo-frase.txt"; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/secretos"
cp .env "$T/env"
cp -R "$HOME/.fpc/floci-data" "$T/floci-data"
cp infra/terraform/terraform.tfstate* "$T/" 2>/dev/null || true
for c in NEON_DB_URL NEON_AUTH_COOKIE_SECRET NEON_AGENTE_URL NEON_AGENTE_ESCRITURA_URL SANTANDER_RUT SANTANDER_PASS FALABELLA_RUT FALABELLA_PASS BCI_RUT BCI_PASS; do
  security find-generic-password -s fpc -a "$c" -w > "$T/secretos/$c" 2>/dev/null || echo "falta en el Llavero: $c" >&2
done
tar -C "$T" -czf - . | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:"$HOME/cuotazo-frase.txt" -out "${1:-$HOME}/cuotazo-estado.tar.gz.enc"
echo "listo: ${1:-$HOME}/cuotazo-estado.tar.gz.enc (llévalo por USB o cable; no lo subas a la nube)"
