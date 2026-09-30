#!/usr/bin/env bash
# Aplica el DDL de la bodega y corre la carga completa contra floci.
# Uso: scripts/cargar_bodega.sh [--fecha AAAA-MM-DD] [--bancos santander,falabella,bci] [--usuarioId <uuid>]
set -euo pipefail

cd "$(dirname "$0")/.."
PY=.venv/bin/python
COMUNES=(--secretoBodega fpc/bodega --hostBodega localhost --rutaSql sql/bodega)

export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1

echo "== DDL"
$PY glue/jobs/fpc_aplicar_ddl.py "${COMUNES[@]}"
echo "== Indicadores"
$PY glue/jobs/fpc_indicadores.py --secretoBodega fpc/bodega --hostBodega localhost --indicador uf
echo "== Productos"
$PY glue/jobs/fpc_cargar_productos.py "${COMUNES[@]}" --bucketRaw fpc-raw "$@"
echo "== Categorización"
$PY glue/jobs/fpc_categorizar.py "${COMUNES[@]}"
echo "== Cuadraturas"
$PY glue/jobs/fpc_cuadrar.py --secretoBodega fpc/bodega --hostBodega localhost --bucketRaw fpc-raw
