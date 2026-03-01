---
id: T-deploy-with-custom-domain-and
title: Deploy with custom domain and configure Namecheap DNS
status: open
priority: high
parent: none
prerequisites:
  - T-update-terraform-for-route-53
affectedFiles: {}
log: []
schema: v1.0
childrenIds: []
created: 2026-03-01T01:30:33.664Z
updated: 2026-03-01T01:30:33.664Z
---

## Context

After the Terraform code changes in T-update-terraform-for-route-53 are complete, this task covers the operational steps to deploy the MCP server at `health.roomful.app` with HTTPS. This involves applying Terraform, configuring Namecheap DNS, and updating external configuration (GitHub Actions variables).

The domain `roomful.app` is registered on Namecheap with no existing DNS records. DNS management is being transferred to Route 53.

## Implementation Steps

### 1. Update `terraform.tfvars` (gitignored)

Add the domain variables to `infra/terraform.tfvars`:

```hcl
domain_name      = "health.roomful.app"
zone_domain_name = "roomful.app"
```

### 2. Run `terraform apply` (first pass — creates Route 53 zone)

```bash
cd infra && terraform apply
```

This will:

- Create the Route 53 hosted zone for `roomful.app`
- Request the ACM wildcard certificate (will enter "Pending validation" state)
- Create ACM DNS validation CNAME records in Route 53
- Create HTTPS listener on port 443 (will wait for cert validation)
- Create HTTP→HTTPS redirect on port 80
- Create Route 53 A record alias for `health.roomful.app` → ALB
- Set `AUTH_ENABLED=true` and `ISSUER_URL=https://health.roomful.app` on ECS task
- Output Route 53 nameservers

**Note:** `terraform apply` may hang or fail waiting for ACM certificate validation since the nameservers haven't been configured in Namecheap yet. If so, it's expected — proceed with step 3 and re-run apply after DNS propagates. Alternatively, you can target the Route 53 zone first:

```bash
terraform apply -target=aws_route53_zone.main
```

Then configure Namecheap (step 3), wait for propagation, and run `terraform apply` for the rest.

### 3. Configure Namecheap Nameservers (manual — user action)

1. Copy the Route 53 nameservers from the `route53_nameservers` Terraform output
2. Log in to Namecheap → Domain List → `roomful.app` → Manage
3. Under **Nameservers**, select **Custom DNS**
4. Enter the 4 Route 53 nameservers (e.g., `ns-1234.awsdns-12.org`, etc.)
5. Save

### 4. Wait for DNS Propagation

Verify nameserver propagation:

```bash
dig NS roomful.app
```

Should return the Route 53 nameservers. This typically takes minutes but can take up to 48 hours.

### 5. Complete Terraform Apply

If the initial `terraform apply` timed out waiting for ACM validation, re-run it now:

```bash
cd infra && terraform apply
```

ACM should validate within 5-30 minutes once DNS is propagating. Monitor in the AWS Console under Certificate Manager.

### 6. Update GitHub Actions Variables

Update the `SERVER_URL` variable in the GitHub repository settings (Settings → Secrets and variables → Actions → Variables tab):

| Variable     | Old Value                                                         | New Value                    |
| ------------ | ----------------------------------------------------------------- | ---------------------------- |
| `SERVER_URL` | `http://food-tracking-alb-2110170359.us-west-2.elb.amazonaws.com` | `https://health.roomful.app` |

Other GitHub Actions variables (`ECR_REPOSITORY_URL`, `ECS_CLUSTER_NAME`, `ECS_SERVICE_NAME`, `AWS_ROLE_ARN`, `AWS_REGION`) should remain unchanged.

### 7. Redeploy via GitHub Actions

Trigger the Deploy workflow (Actions → Deploy → Run workflow) to pick up the new ECS task definition with `AUTH_ENABLED=true` and `ISSUER_URL`.

### 8. Verify

- `curl -sf https://health.roomful.app/health` returns 200
- `http://health.roomful.app/health` redirects to HTTPS
- OAuth flow works when connecting from Claude Code plugin

## Acceptance Criteria

- [ ] Route 53 hosted zone exists for `roomful.app`
- [ ] Namecheap nameservers point to Route 53
- [ ] `dig NS roomful.app` returns Route 53 nameservers
- [ ] ACM certificate status is "Issued" for `roomful.app` + `*.roomful.app`
- [ ] `https://health.roomful.app/health` returns 200
- [ ] `http://health.roomful.app` redirects to HTTPS
- [ ] GitHub Actions `SERVER_URL` variable updated
- [ ] Deploy workflow succeeds with health check passing at new URL

## Dependencies

- **T-update-terraform-for-route-53** must be completed first (Terraform code changes)

## Out of Scope

- Terraform code changes (handled by T-update-terraform-for-route-53)
- Application code changes (server already supports AUTH_ENABLED and ISSUER_URL)
- Setting up additional subdomains beyond `health.roomful.app`
