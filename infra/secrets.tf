resource "aws_secretsmanager_secret" "usda_api_key" {
  name                    = "${local.name_prefix}/usda-api-key"
  description             = "USDA FoodData Central API key"
  recovery_window_in_days = 7

  tags = { Name = "${local.name_prefix}-usda-api-key" }
}

resource "aws_secretsmanager_secret_version" "usda_api_key" {
  secret_id     = aws_secretsmanager_secret.usda_api_key.id
  secret_string = var.usda_api_key
}
