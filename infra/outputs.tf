output "server_url" {
  description = "URL of the deployed MCP server."
  value       = local.has_domain ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL for pushing Docker images."
  value       = aws_ecr_repository.app.repository_url
}

output "alb_dns_name" {
  description = "ALB DNS name for debugging."
  value       = aws_lb.main.dns_name
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC authentication."
  value       = aws_iam_role.github_actions.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name for deployments."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name for deployments."
  value       = aws_ecs_service.app.name
}

output "route53_nameservers" {
  description = "Route53 nameservers to configure in your domain registrar. Only shown when zone_domain_name is set."
  value       = local.manages_zone ? aws_route53_zone.main[0].name_servers : null
}
