#!/usr/bin/env bash
# Carga en floci el secreto fpc/supabase desde el Llavero, sin pasar por .env ni Terraform
set -euo pipefail

url=$(security find-generic-password -s fpc -a SUPABASE_DB_URL -w)
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1 AWS_ENDPOINT_URL=http://localhost:4566
aws secretsmanager put-secret-value --secret-id fpc/supabase \
  --secret-string "$(python3 -c 'import json,sys; print(json.dumps({"db_url": sys.argv[1]}))' "$url")" >/dev/null
echo "fpc/supabase actualizado"
