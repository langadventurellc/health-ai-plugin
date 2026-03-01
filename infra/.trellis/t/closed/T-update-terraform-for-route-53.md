---
id: T-update-terraform-for-route-53
title: Update Terraform for Route 53 hosted zone and wildcard ACM certificate
status: done
priority: high
parent: none
prerequisites: []
affectedFiles:
  infra/main.tf: Added `manages_zone` and `effective_zone_id` locals.
    `effective_zone_id` resolves to the managed zone ID or falls back to
    `var.hosted_zone_id`.
  infra/variables.tf: Added `zone_domain_name` variable for Terraform-managed
    Route 53 zone. Updated `hosted_zone_id` description to note mutual
    exclusivity.
  infra/alb.tf: Added `aws_route53_zone.main` resource (conditional on
    `manages_zone`). Updated ACM cert to use apex domain with wildcard SAN when
    `zone_domain_name` is set. Replaced all `var.hosted_zone_id` references with
    `local.effective_zone_id`.
  infra/outputs.tf: Added `route53_nameservers` output for registrar configuration.
  infra/README.md: Documented managed zone vs external zone modes, added
    `zone_domain_name` to variables table, added registrar DNS setup
    instructions.
  plugin/.mcp.json: Updated server URL from ALB HTTP to `https://health.roomful.app/mcp`.
log:
  - Added Route 53 hosted zone management and wildcard ACM certificate support
    to the Terraform infrastructure. When `zone_domain_name` is set (e.g.,
    `roomful.app`), Terraform creates the hosted zone, issues a wildcard cert
    (`*.roomful.app` + `roomful.app`), and outputs the nameservers for registrar
    configuration. The existing `hosted_zone_id` path remains as a
    backwards-compatible alternative. Updated plugin `.mcp.json` to
    `https://health.roomful.app/mcp` and documented the new variable and DNS
    setup workflow in the README.
schema: v1.0
childrenIds: []
created: 2026-03-01T01:30:05.585Z
updated: 2026-03-01T01:30:05.585Z
---

## Context

The MCP server is currently deployed in no-domain mode (HTTP on ALB DNS, no auth). We need to enable domain mode with the subdomain `health.roomful.app`, using HTTPS with a wildcard ACM certificate (`*.roomful.app` + `roomful.app`). The domain `roomful.app` is registered on Namecheap and has no existing DNS records. DNS management will be transferred to Route 53 (nameservers changed in Namecheap).

The Terraform infrastructure already has conditional domain-mode support (`local.has_domain = var.domain_name != null`), but needs two additions: (1) a Route 53 hosted zone resource (currently the zone is expected to already exist and be passed as `hosted_zone_id`), and (2) wildcard certificate support (currently only requests a cert for the exact `domain_name`).

## Implementation Requirements

### 1. Add Route 53 hosted zone resource (`infra/alb.tf` or new file)

Create an `aws_route53_zone` resource for the base domain (e.g., `roomful.app`). This should be conditional on domain mode being enabled.

**Variable approach** — Add a `zone_domain_name` variable (e.g., `"roomful.app"`) that, when set, causes Terraform to create the hosted zone. When `zone_domain_name` is set, derive the `hosted_zone_id` from the new zone resource instead of requiring it as input. Keep the existing `hosted_zone_id` variable as a fallback for users who already have an externally-managed hosted zone. Use a local like:

```hcl
local.effective_zone_id = var.hosted_zone_id != null ? var.hosted_zone_id : (var.zone_domain_name != null ? aws_route53_zone.main[0].zone_id : null)
```

Replace all references to `var.hosted_zone_id` in `alb.tf` with `local.effective_zone_id`.

### 2. Update ACM certificate for wildcard (`infra/alb.tf:3-17`)

Add `subject_alternative_names` to the `aws_acm_certificate.main` resource to request a wildcard cert:

```hcl
resource "aws_acm_certificate" "main" {
  count                     = local.has_domain ? 1 : 0
  domain_name               = var.zone_domain_name != null ? var.zone_domain_name : var.domain_name
  subject_alternative_names = var.zone_domain_name != null ? ["*.${var.zone_domain_name}"] : []
  validation_method         = "DNS"
  ...
}
```

When `zone_domain_name` is set, the cert's primary domain is the apex (`roomful.app`) with a wildcard SAN (`*.roomful.app`). This covers `health.roomful.app` and any future subdomains. When not set, behavior is unchanged (single-domain cert for `domain_name`).

The existing `cert_validation` for_each loop already iterates `domain_validation_options`, so it will automatically handle the additional validation record for the wildcard.

### 3. Update `variables.tf`

Add the new variable:

```hcl
variable "zone_domain_name" {
  description = "Base domain name for Route 53 hosted zone creation (e.g., roomful.app). When set, Terraform creates the hosted zone and issues a wildcard ACM cert. Mutually exclusive with hosted_zone_id."
  type        = string
  default     = null
}
```

Update the precondition on the ACM cert to accept either `hosted_zone_id` or `zone_domain_name`:

```hcl
precondition {
  condition     = var.hosted_zone_id != null || var.zone_domain_name != null
  error_message = "Either hosted_zone_id or zone_domain_name is required when domain_name is set."
}
```

### 4. Add outputs (`infra/outputs.tf`)

Add an output for the Route 53 nameservers so the user knows what to configure in Namecheap:

```hcl
output "route53_nameservers" {
  description = "Route 53 nameservers to configure in your domain registrar. Only shown when zone_domain_name is set."
  value       = var.zone_domain_name != null ? aws_route53_zone.main[0].name_servers : null
}
```

### 5. Update plugin `.mcp.json` (`plugin/.mcp.json`)

Update the server URL from the current ALB HTTP URL to the new HTTPS domain:

```json
{
  "mcpServers": {
    "food-tracking-ai": {
      "type": "http",
      "url": "https://health.roomful.app/mcp"
    }
  }
}
```

### 6. Update `infra/README.md`

Update the README to document the new `zone_domain_name` variable, the nameserver output, and the Namecheap configuration steps. Add `zone_domain_name` to the variables table and add a section about configuring DNS at external registrars.

## Existing Patterns

- `infra/alb.tf` — ACM cert, Route 53 records, ALB listeners (all conditional on `local.has_domain`)
- `infra/variables.tf` — domain-related variables with defaults of `null`
- `infra/main.tf:33` — `local.has_domain = var.domain_name != null`
- `infra/ecs.tf:53-57` — conditionally sets `AUTH_ENABLED` and `ISSUER_URL` based on `has_domain`
- `infra/outputs.tf:1-4` — `server_url` output switches based on `has_domain`

## Acceptance Criteria

- [ ] `terraform plan` succeeds with `domain_name = "health.roomful.app"` and `zone_domain_name = "roomful.app"` (without `hosted_zone_id`)
- [ ] `terraform plan` still works with `hosted_zone_id` only (backwards compatible, no `zone_domain_name`)
- [ ] `terraform plan` still works in no-domain mode (both variables null)
- [ ] ACM certificate requests both `roomful.app` and `*.roomful.app` when `zone_domain_name` is set
- [ ] Route 53 hosted zone is created for `roomful.app` when `zone_domain_name` is set
- [ ] Route 53 nameservers are output when `zone_domain_name` is set
- [ ] All existing `var.hosted_zone_id` references replaced with `local.effective_zone_id`
- [ ] Plugin `.mcp.json` URL updated to `https://health.roomful.app/mcp`
- [ ] `infra/README.md` updated with new variable documentation and registrar DNS setup instructions

## Testing

- Run `terraform validate` and `terraform plan` in all three modes (no-domain, zone_domain_name, hosted_zone_id)
- Verify no changes to existing resources when running plan with current no-domain config

## Out of Scope

- Actually running `terraform apply` (covered by deployment task)
- Namecheap nameserver configuration (manual user action, covered by deployment task)
- GitHub Actions variable updates (covered by deployment task)
- Any application code changes (the server code already supports `AUTH_ENABLED` and `ISSUER_URL`)
