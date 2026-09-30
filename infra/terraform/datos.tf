resource "aws_s3_bucket" "capas" {
  for_each = toset(["raw", "analytics", "sensible"])
  bucket   = "fpc-${each.key}"
}
