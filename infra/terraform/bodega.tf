variable "postgres_password" {
  type      = string
  sensitive = true
}

resource "aws_db_instance" "bodega" {
  identifier          = "fpc-bodega"
  engine              = "postgres"
  engine_version      = "16"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  db_name             = "bodega"
  username            = "fpc_admin"
  password            = var.postgres_password
  skip_final_snapshot = true
}

resource "aws_secretsmanager_secret" "bodega" {
  name = "fpc/bodega"
}

resource "aws_secretsmanager_secret_version" "bodega" {
  secret_id = aws_secretsmanager_secret.bodega.id
  secret_string = jsonencode({
    host     = aws_db_instance.bodega.address
    port     = aws_db_instance.bodega.port
    dbname   = aws_db_instance.bodega.db_name
    username = aws_db_instance.bodega.username
    password = var.postgres_password
  })
}

output "bodega_endpoint" {
  value = "${aws_db_instance.bodega.address}:${aws_db_instance.bodega.port}"
}
