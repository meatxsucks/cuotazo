#!/usr/bin/env bash
# Arma infra/terraform/.build/<lambda>/ con el código y sus dependencias para Python 3.12 arm64.
# Uso: scripts/empaquetar_lambda.sh publicar_supabase
set -euo pipefail

nombre="${1:?falta el nombre de la carpeta en lambdas/}"
raiz="$(cd "$(dirname "$0")/.." && pwd)"
origen="$raiz/lambdas/$nombre"
destino="$raiz/infra/terraform/.build/$nombre"
pip="${PIP:-$raiz/.venv/bin/pip}"

[ -d "$origen" ] || { echo "no existe $origen" >&2; exit 1; }
rm -rf "$destino"
mkdir -p "$destino"

case "$(uname -m)" in x86_64) PLAT="--platform manylinux2014_x86_64 --platform manylinux_2_28_x86_64";; *) PLAT="--platform manylinux2014_aarch64 --platform manylinux_2_28_aarch64";; esac
# Dependencias binarias para la arquitectura del equipo, sin boto3 (viene en el runtime)
if [ -f "$origen/requirements.txt" ]; then
  "$pip" install --quiet --disable-pip-version-check --no-compile \
    --requirement "$origen/requirements.txt" --target "$destino" \
    $PLAT \
    --implementation cp --python-version 3.12 --only-binary=:all:
fi

cp "$origen"/*.py "$destino"/
find "$destino" -name "__pycache__" -type d -prune -exec rm -rf {} +
echo "$destino"
