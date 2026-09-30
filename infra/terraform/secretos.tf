variable "clave_seudonimo" {
  type      = string
  sensitive = true
}

resource "aws_secretsmanager_secret" "seudonimo" {
  name = "fpc/seudonimo"
}

resource "aws_secretsmanager_secret_version" "seudonimo" {
  secret_id     = aws_secretsmanager_secret.seudonimo.id
  secret_string = jsonencode({ clave = var.clave_seudonimo })
}
