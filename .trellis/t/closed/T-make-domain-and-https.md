---
id: T-make-domain-and-https
title: Make domain and HTTPS optional in Terraform infrastructure
status: done
priority: high
parent: none
prerequisites:
  - T-make-oauth-authentication
affectedFiles:
  infra/variables.tf: Made domain_name and hosted_zone_id optional with default
    null. Updated descriptions to explain behavior when null.
  infra/main.tf: Added local.has_domain = var.domain_name != null to derive domain mode flag.
  infra/alb.tf:
    'Added count = local.has_domain ? 1 : 0 to 6 HTTPS-only resources
    (ACM cert, cert validation record, cert validation, HTTPS listener, HTTP
    redirect listener, Route53 alias). Changed cert_validation for_each to use
    empty map when no domain. Updated indexed references (main[0]). Added new
    http_forward listener (count = has_domain ? 0 : 1) for no-domain mode.'
  infra/ecs.tf: Changed environment block to use concat() with conditional
    AUTH_ENABLED (true/false based on has_domain) and conditional ISSUER_URL
    (only included when has_domain). Added aws_lb_listener.http_forward to
    depends_on.
  infra/outputs.tf:
    'Made server_url conditional: https://domain when has_domain,
    http://ALB_DNS when not. Updated description.'
  infra/security-groups.tf: 'Added count = local.has_domain ? 1 : 0 to alb_https
    ingress rule. Updated alb_http description to be mode-agnostic.'
  infra/README.md: Documented both deployment modes (domain with HTTPS+auth,
    no-domain with HTTP). Added mode comparison table, security note, updated
    prerequisites, tfvars examples for both modes, updated variables table to
    show domain_name and hosted_zone_id as optional, updated plugin
    configuration section for both modes.
log:
  - >-
    Research complete. Reviewed all 6 target files:

    - infra/variables.tf: domain_name and hosted_zone_id are required, need
    default null

    - infra/alb.tf: 6 resources need count/conditional, plus new http_forward
    listener

    - infra/ecs.tf: environment block needs conditional ISSUER_URL/AUTH_ENABLED,
    depends_on needs update

    - infra/outputs.tf: server_url needs conditional

    - infra/security-groups.tf: alb_https ingress rule needs count

    - infra/README.md: needs both deployment modes documented

    - infra/main.tf: has existing locals block where has_domain should be added

    - .gitignore: already excludes terraform.tfvars

    Starting implementation.
  - Made domain and HTTPS optional in Terraform infrastructure. When domain_name
    is null (the new default), the server deploys using the ALB's default DNS
    name over HTTP with auth disabled. When domain_name is provided, the full
    HTTPS + ACM + Route53 + OAuth flow is used. terraform validate passes with
    no variables set.
schema: v1.0
childrenIds: []
created: 2026-02-28T23:46:08.054Z
updated: 2026-02-28T23:46:08.054Z
---

## Context

The Terraform infrastructure in `infra/` currently requires a custom domain (`domain_name`) and Route53 hosted zone (`hosted_zone_id`) for ACM certificate creation and HTTPS termination. For users who don't have access to DNS management for their domains, the server should be deployable using just the ALB's default DNS name over HTTP. Authentication is auto-derived: no domain = no HTTPS = no auth.

Prerequisite: `T-make-oauth-authentication` (the server must support the `AUTH_ENABLED` env var before Terraform can set it).

## What to Change

### `infra/variables.tf`

Make `domain_name` and `hosted_zone_id` optional:

```hcl
variable "domain_name" {
  description = "FQDN for the MCP server. If null, uses ALB DNS name over HTTP (no auth)."
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID. Required when domain_name is set."
  type        = string
  default     = null
}
```

Add a local to derive the "has domain" flag:

```hcl
locals {
  has_domain = var.domain_name != null
}
```

### `infra/alb.tf`

Add `count = local.has_domain ? 1 : 0` to these 6 resources:

- `aws_acm_certificate.main`
- `aws_route53_record.cert_validation`
- `aws_acm_certificate_validation.main`
- `aws_lb_listener.https`
- `aws_lb_listener.http_redirect`
- `aws_route53_record.app`

**Note on `for_each` with `count`:** The `aws_route53_record.cert_validation` resource uses `for_each`. When domain is null, it should use an empty map instead of `count`. Change to:

```hcl
for_each = local.has_domain ? {
  for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => { ... }
} : {}
```

**Add a new HTTP-forward listener** (only when no domain):

```hcl
resource "aws_lb_listener" "http_forward" {
  count             = local.has_domain ? 0 : 1
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
```

Update references in `aws_acm_certificate_validation.main` to use `aws_acm_certificate.main[0]` and `aws_route53_record.cert_validation` (which is now conditionally empty).

### `infra/ecs.tf`

**Environment variables** (lines 49-53): Auto-derive `AUTH_ENABLED` and `ISSUER_URL` from domain:

```hcl
environment = concat(
  [
    { name = "PORT", value = "3000" },
    { name = "SQLITE_DB_PATH", value = "/app/data/food-cache.db" },
    { name = "AUTH_ENABLED", value = local.has_domain ? "true" : "false" },
  ],
  local.has_domain ? [
    { name = "ISSUER_URL", value = "https://${var.domain_name}" }
  ] : []
)
```

When no domain, `ISSUER_URL` is omitted entirely (server defaults to `http://localhost:PORT` which is fine since auth is off).

**`depends_on`** (lines 125-128): Reference whichever listener exists:

```hcl
depends_on = [
  aws_lb_listener.https,
  aws_lb_listener.http_forward,
  aws_efs_mount_target.data,
]
```

Terraform handles `count = 0` resources in `depends_on` gracefully — it just ignores them.

### `infra/outputs.tf`

**`server_url`** (line 3): Conditional based on domain:

```hcl
output "server_url" {
  description = "URL of the deployed MCP server."
  value       = local.has_domain ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}
```

### `infra/security-groups.tf`

**Optional**: Make the ALB HTTPS ingress rule conditional:

```hcl
resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  count             = local.has_domain ? 1 : 0
  security_group_id = aws_security_group.alb.id
  ...
}
```

The HTTP ingress rule (port 80) should remain unconditional since it's needed in both modes.

### `infra/README.md`

Update documentation to explain the two deployment modes:

- **With domain** (HTTPS + auth): provide `domain_name` and `hosted_zone_id`
- **Without domain** (HTTP, no auth): omit `domain_name` and `hosted_zone_id`; server is accessible at ALB DNS name
- Update the `terraform.tfvars` example to show both modes
- Note the security implications of running without auth

### `.github/workflows/deploy.yml`

No changes needed — `SERVER_URL` is set from Terraform output which already adapts. `curl -sf` works with both HTTP and HTTPS.

## Files to Modify

- `infra/variables.tf` — make domain vars optional
- `infra/alb.tf` — conditional HTTPS resources + new HTTP-forward listener
- `infra/ecs.tf` — conditional env vars, depends_on update
- `infra/outputs.tf` — conditional server_url
- `infra/security-groups.tf` — optional HTTPS ingress rule
- `infra/README.md` — document both deployment modes

## Acceptance Criteria

- `terraform validate` passes with no variables set (domain_name and hosted_zone_id default to null)
- `terraform plan` with no domain: shows HTTP listener, no ACM/Route53/HTTPS resources, ECS env has `AUTH_ENABLED=false`, no `ISSUER_URL`
- `terraform plan` with domain: shows HTTPS listener, ACM cert, Route53 records, ECS env has `AUTH_ENABLED=true` and `ISSUER_URL=https://...`
- `server_url` output uses `http://` + ALB DNS when no domain, `https://` + domain when domain is set
- README documents both modes clearly
- `.gitignore` still excludes `terraform.tfvars`

## Out of Scope

- Server-side auth changes (handled by `T-make-oauth-authentication`)
- Adding a CloudFront distribution for HTTPS without a custom domain
- Remote Terraform state backend
- Any changes to the Dockerfile or GitHub Actions workflow
