variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-west-2"
}

variable "domain_name" {
  description = "FQDN for the MCP server. If null, uses ALB DNS name over HTTP (no auth)."
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for an externally-managed zone. Mutually exclusive with zone_domain_name."
  type        = string
  default     = null
}

variable "zone_domain_name" {
  description = "Base domain for Route53 hosted zone creation (e.g., roomful.app). When set, Terraform creates the hosted zone and issues a wildcard ACM cert. Mutually exclusive with hosted_zone_id."
  type        = string
  default     = null
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
