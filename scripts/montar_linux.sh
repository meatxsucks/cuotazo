#!/usr/bin/env bash
# En CachyOS (Arch): deja todo corriendo. Uso: scripts/montar_linux.sh ~/cuotazo-estado.tar.gz.enc
set -euo pipefail
cd "$(dirname "$0")/.."
ESTADO="${1:?falta el archivo .gpg del equipo origen}"

sudo pacman -S --needed --noconfirm docker docker-compose nodejs npm python python-pip postgresql gnupg aws-cli-v2 chromium opentofu || true
command -v google-chrome-stable >/dev/null || echo "aviso: usaré CHROME_PATH=/usr/bin/chromium"
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # requiere cerrar sesión y volver a entrar la primera vez

mkdir -p "$HOME/.fpc/secretos" "$HOME/.fpc/logs"; chmod 700 "$HOME/.fpc/secretos"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
read -rsp "Frase del estado (la de ~/cuotazo-frase.txt del Mac): " F; echo
openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:$F" -in "$ESTADO" | tar -C "$T" -xzf -
cp "$T/env" .env
cp "$T"/terraform.tfstate* infra/terraform/ 2>/dev/null || true
cp -R "$T/floci-data" "$HOME/.fpc/floci-data"
cp "$T"/secretos/* "$HOME/.fpc/secretos/"; chmod 600 "$HOME/.fpc/secretos/"*
grep -q CHROME_PATH .env || echo "CHROME_PATH=$(command -v google-chrome-stable || command -v chromium)" >> .env

python -m venv .venv && .venv/bin/pip install -q -r requirements-dev.txt
(cd extractores/bancos && npm ci)
export PATH="$PWD/scripts/linux:$PATH"
set -a; . ./.env; set +a
export AWS_ENDPOINT_URL="http://localhost:${FPC_PUERTO:-4566}" AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1
docker compose up -d
echo "esperando floci…"; until aws s3 ls >/dev/null 2>&1; do sleep 3; done
# Infra en floci (bodega, secretos, Lambda) para x86_64 y su código
scripts/empaquetar_lambda.sh publicar_supabase
(cd infra/terraform && tofu init -input=false && tofu apply -auto-approve -input=false \
  -var "arquitectura_lambda=x86_64" -var "clave_seudonimo=$CLAVE_SEUDONIMO" -var "postgres_password=$POSTGRES_PASSWORD")
scripts/cargar_secreto_supabase.sh
echo "Falta: apuntar el secreto fpc/bodega al host actual de la bodega (ver guía, paso 6) y correr scripts/instalar_actualizacion.sh"
