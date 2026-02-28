variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "FQDN for the MCP server (e.g., food.example.com)."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for DNS validation and ALB alias record."
  type        = string
}

variable "usda_api_key" {
  description = "USDA FoodData Central API key. Stored in Secrets Manager."
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repository in owner/repo format (e.g., zach/food-tracking-ai). Used in OIDC trust policy."
  type        = string
}
