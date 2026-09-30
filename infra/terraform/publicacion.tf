variable "supabase_db_url" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cadena Postgres del pooler de Supabase (usuario postgres); vacía deja la publicación sin configurar"
}

variable "publicacion_programada" {
  type        = bool
  default     = false
  description = "Activa la publicación a Supabase cada hora"
}

resource "aws_iam_role" "lambda" {
  name = "fpc-lambda-rol"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }]
  })
}

resource "aws_iam_role" "scheduler" {
  name = "fpc-scheduler-rol"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "scheduler.amazonaws.com" } }]
  })
}

resource "aws_secretsmanager_secret" "supabase" {
  name = "fpc/supabase"
}

resource "aws_secretsmanager_secret_version" "supabase" {
  secret_id     = aws_secretsmanager_secret.supabase.id
  secret_string = jsonencode({ db_url = var.supabase_db_url })
  # El valor real se carga desde el Llavero con scripts/cargar_secreto_supabase.sh
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Requiere correr antes scripts/empaquetar_lambda.sh publicar_supabase
data "archive_file" "publicar_supabase" {
  type        = "zip"
  source_dir  = "${path.module}/.build/publicar_supabase"
  output_path = "${path.module}/.build/publicar_supabase.zip"
}

resource "aws_lambda_function" "publicar_supabase" {
  function_name    = "fpc-publicar-supabase"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "handler.handler"
  filename         = data.archive_file.publicar_supabase.output_path
  source_code_hash = data.archive_file.publicar_supabase.output_base64sha256
  timeout          = 300
  memory_size      = 256
  environment {
    variables = {
      SECRETO_BODEGA   = aws_secretsmanager_secret.bodega.name
      SECRETO_SUPABASE = aws_secretsmanager_secret.supabase.name
    }
  }
}

resource "aws_scheduler_schedule" "publicar_supabase" {
  name                = "fpc-publicar-supabase-1h"
  schedule_expression = "rate(1 hour)"
  state               = var.publicacion_programada ? "ENABLED" : "DISABLED"
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = aws_lambda_function.publicar_supabase.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({})
  }
}
