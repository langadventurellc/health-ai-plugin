---
id: F-aws-deployment
title: AWS Deployment
status: done
priority: high
parent: E-food-tracking-ai
prerequisites:
  - F-mcp-server-core-and-food-data
  - F-unit-conversion-and-meal
  - F-custom-food-storage
  - F-mcp-oauth-21-authentication
affectedFiles:
  Dockerfile:
    'Created 3-stage multi-stage Dockerfile: build (TypeScript compile),
    deps (production-only npm ci with native addon), production (clean Alpine
    with dist/ and node_modules/ copied in, non-root user, health check,
    /app/data directory)'
  .dockerignore:
    Created comprehensive .dockerignore excluding node_modules, dist,
    .git, .env files, documentation, tests, plugin/, trellis, IDE configs,
    database files, and other non-essential files
  infra/main.tf: Provider config (hashicorp/aws ~> 5.0), local backend, name_prefix local
  infra/variables.tf: 'Input variables: aws_region, domain_name, hosted_zone_id,
    usda_api_key (sensitive), github_repo'
  infra/outputs.tf: 'Outputs: server_url, ecr_repository_url, alb_dns_name,
    github_actions_role_arn; Added ecs_cluster_name and ecs_service_name outputs
    for GitHub Actions workflow configuration.'
  infra/vpc.tf: VPC with 2 public + 2 private subnets, IGW, single NAT gateway, route tables
  infra/security-groups.tf: ALB (HTTP/HTTPS in, port 3000 to ECS), ECS (from ALB
    only, all egress), EFS (NFS from ECS only)
  infra/ecr.tf: ECR repository with scan-on-push and lifecycle policy (keep last 10 images)
  infra/efs.tf:
    Encrypted EFS, mount targets in private subnets, access point with
    UID/GID 1000
  infra/alb.tf: ACM cert with DNS validation, ALB, target group (health check on
    /health), HTTPS + HTTP->HTTPS listeners, Route53 alias
  infra/ecs.tf:
    ECS cluster, CloudWatch log group (30d retention), task definition
    (0.5 vCPU, 1GB, EFS mount, secrets), service (desired 1, min healthy 100%)
  infra/iam.tf: Task execution role (ECR pull, logs, secrets read), task role
    (minimal), GitHub Actions OIDC provider + IAM role (ECR push, ECS deploy,
    PassRole)
  infra/secrets.tf: Secrets Manager secret for USDA API key
  .gitignore: 'Added Terraform exclusions: .terraform/, *.tfstate, *.tfstate.*,
    terraform.tfvars'
  infra/.terraform.lock.hcl: Auto-generated provider lock file (hashicorp/aws v5.100.0)
  .github/workflows/deploy.yml: Created GitHub Actions deploy workflow with
    workflow_dispatch trigger, OIDC auth via
    aws-actions/configure-aws-credentials@v6, ECR login, Docker build+push (SHA
    + latest tags), ECS force-new-deployment with wait, and health check
    verification. All config via GitHub Actions variables.
  infra/README.md: Created comprehensive deployment documentation covering
    prerequisites, architecture overview, first-time Terraform setup, GitHub
    Actions variable mapping table, deployment instructions, plugin
    configuration, Terraform variables reference, and useful commands (logs, ECS
    debugging, tear down).
  mise.toml:
    Added deploy task that opens the GitHub Actions deploy workflow page
    in the browser using gh CLI.
log:
  - 'Auto-completed: All child tasks are complete'
schema: v1.0
childrenIds:
  - T-create-dockerfile-for-mcp
  - T-deployment-script-and
  - T-terraform-aws-infrastructure
created: 2026-02-28T16:58:50.002Z
updated: 2026-02-28T16:58:50.002Z
---

## Purpose

Deploy the MCP server to AWS so it is accessible remotely via Streamable HTTP over HTTPS. This makes the server available to the Claude Code plugin from any device.

## Key Components

- **AWS infrastructure** -- Provision compute (ECS, Lambda, or EC2 -- decide during implementation based on simplicity and cost for single-user v1), networking, and HTTPS termination
- **HTTPS** -- TLS certificate for the server endpoint (ACM or similar)
- **SQLite persistence** -- Ensure the SQLite database file persists across deployments/restarts (EBS volume, EFS mount, or equivalent depending on compute choice)
- **Environment configuration** -- USDA API key, OAuth secrets, and any other configuration via environment variables or secrets manager
- **Infrastructure as code** -- Deployment should be reproducible (CDK, CloudFormation, Terraform, or similar)
- **Health check** -- Basic health endpoint for monitoring

## Acceptance Criteria

- MCP server is accessible at a public HTTPS URL
- Claude Code plugin can connect to the deployed server and complete the OAuth flow
- All four MCP tools function correctly on the deployed server
- SQLite data persists across server restarts/redeployments
- USDA API key and other secrets are not hardcoded or committed to the repository
- Deployment is reproducible from infrastructure-as-code definitions
- Server starts and responds within reasonable time after deployment

## Technical Notes

- Start with the simplest viable AWS deployment for a single-user system -- do not over-engineer for scale
- The specific AWS service choice (ECS, Lambda, EC2) should be made during implementation based on what best supports a long-running Node.js process with SQLite file persistence
- Lambda may complicate SQLite persistence; ECS or EC2 with an attached volume is likely simpler
- Consider a Dockerfile for the server to simplify deployment regardless of compute target

## Testing Requirements

- No automated tests -- validation is through the deployment acceptance criteria (server accessible, tools functional, data persists)
