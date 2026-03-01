terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Local state for v1 single-user deployment.
  # Migrate to S3 + DynamoDB backend when needed.
  backend "local" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "food-tracking-ai"
      ManagedBy = "terraform"
    }
  }
}

locals {
  name_prefix       = "food-tracking"
  has_domain        = var.domain_name != null
  manages_zone      = var.zone_domain_name != null
  effective_zone_id = var.hosted_zone_id != null ? var.hosted_zone_id : (local.manages_zone ? aws_route53_zone.main[0].zone_id : null)
}
