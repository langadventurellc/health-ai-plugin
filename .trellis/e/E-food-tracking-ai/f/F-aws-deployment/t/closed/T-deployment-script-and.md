---
id: T-deployment-script-and
title: GitHub Actions Deploy Workflow and Documentation
status: done
priority: medium
parent: F-aws-deployment
prerequisites:
  - T-create-dockerfile-for-mcp
  - T-terraform-aws-infrastructure
affectedFiles:
  .github/workflows/deploy.yml: Created GitHub Actions deploy workflow with
    workflow_dispatch trigger, OIDC auth via
    aws-actions/configure-aws-credentials@v6, ECR login, Docker build+push (SHA
    + latest tags), ECS force-new-deployment with wait, and health check
    verification. All config via GitHub Actions variables.
  infra/outputs.tf:
    Added ecs_cluster_name and ecs_service_name outputs for GitHub
    Actions workflow configuration.
  infra/README.md: Created comprehensive deployment documentation covering
    prerequisites, architecture overview, first-time Terraform setup, GitHub
    Actions variable mapping table, deployment instructions, plugin
    configuration, Terraform variables reference, and useful commands (logs, ECS
    debugging, tear down).
  mise.toml:
    Added deploy task that opens the GitHub Actions deploy workflow page
    in the browser using gh CLI.
log:
  - >-
    Research complete. Key findings:

    - ECS cluster: food-tracking-cluster, service: food-tracking, container:
    food-tracking

    - Terraform outputs currently missing ECS cluster/service names - will add
    them

    - GitHub Actions OIDC role trusts refs/heads/main only

    - Task definition uses :latest tag, so force-new-deployment approach is
    simplest

    - GitHub Actions versions: actions/checkout@v5,
    aws-actions/configure-aws-credentials@v6

    - No existing .github directory or infra/README.md

    - plugin/.mcp.json already has PLACEHOLDER_URL


    Plan:

    1. Add ECS cluster name and service name to infra/outputs.tf

    2. Create .github/workflows/deploy.yml

    3. Create infra/README.md

    4. Add deploy task to mise.toml
  - Created GitHub Actions deploy workflow with OIDC authentication, infra
    documentation, and convenience mise task. The workflow uses
    workflow_dispatch (manual trigger only), authenticates via OIDC to assume
    the Terraform-provisioned IAM role (no long-lived AWS credentials), builds
    and pushes the Docker image to ECR with both SHA and latest tags, forces a
    new ECS deployment, waits for stability, and verifies the health endpoint.
    All configuration values use GitHub Actions variables (not secrets). Added
    ECS cluster and service name outputs to Terraform for the workflow to
    reference. The infra README provides complete first-time setup instructions
    including Terraform variables, GitHub Actions variable mapping, plugin
    configuration, and useful debugging commands.
schema: v1.0
childrenIds: []
created: 2026-02-28T22:04:18.902Z
updated: 2026-02-28T22:04:18.902Z
---

## Context

The Dockerfile (`T-create-dockerfile-for-mcp`) and Terraform infrastructure (`T-terraform-aws-infrastructure`) are complete. This task creates a GitHub Actions workflow for deploying the server to AWS, triggered manually from the GitHub UI, and documentation for the full setup.

Parent feature: `F-aws-deployment`

## What to Build

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml` -- a manually-triggered workflow that builds, pushes, and deploys the server.

**Trigger:** `workflow_dispatch` only (manual trigger from GitHub UI). No automatic triggers on push or PR.

**Authentication:** Use OIDC to assume the IAM role provisioned by Terraform (output `github_actions_role_arn`). No long-lived AWS access keys stored as GitHub secrets.

**Steps:**

1. **Checkout** the repository.
2. **Configure AWS credentials** via `aws-actions/configure-aws-credentials` with OIDC (`role-to-assume`, `role-session-name`, region).
3. **Login to ECR** via `aws-actions/amazon-ecr-login`.
4. **Build and push Docker image** -- Build from repo root, tag with `latest` and the git SHA, push both tags to ECR.
5. **Deploy to ECS** via `aws-actions/amazon-ecs-deploy-task-definition` or a direct `aws ecs update-service --force-new-deployment` + `aws ecs wait services-stable`.
6. **Verify health** -- `curl -f https://<domain>/health` to confirm the deployment is live.

**Configuration values** (store as GitHub Actions variables, not secrets, since they are not sensitive):

- `AWS_REGION`
- `ECR_REPOSITORY_URL` (from Terraform output)
- `ECS_CLUSTER_NAME` (from Terraform output)
- `ECS_SERVICE_NAME` (from Terraform output)
- `SERVER_URL` (from Terraform output, for health check)
- `AWS_ROLE_ARN` (the GitHub Actions IAM role ARN from Terraform output)

**Important:** No AWS access keys should be stored as GitHub secrets. The OIDC role from Terraform handles authentication.

### Update Plugin Configuration

Update `/Users/zach/code/food-tracking-ai/plugin/.mcp.json` to document that the `PLACEHOLDER_URL` should be replaced with the Terraform output `server_url`. Add a note in the deploy docs explaining this step. (The `.mcp.json` file itself should keep the placeholder since the actual URL is environment-specific.)

### Documentation

Create or update `/Users/zach/code/food-tracking-ai/infra/README.md` covering:

- **Prerequisites:** AWS CLI configured (for initial Terraform apply), Terraform installed, Docker installed (for local builds), a Route53 hosted zone for the domain, a GitHub repository
- **First-time setup:**
  1. Run `terraform init` and `terraform apply` with required variables
  2. Copy Terraform outputs into GitHub Actions variables (list which outputs map to which variables)
  3. The OIDC trust is automatic -- no manual IAM configuration needed beyond Terraform
- **Deploying:** Navigate to Actions tab in GitHub, select "Deploy" workflow, click "Run workflow"
- **Plugin configuration:** How to update `.mcp.json` with the deployed URL
- **Useful commands:** How to check logs (`aws logs`), ECS exec for debugging, tearing down (`terraform destroy`)
- **Environment variables:** List all Terraform variables and what they control

### Mise Task (optional convenience)

Add a `deploy` task to `/Users/zach/code/food-tracking-ai/mise.toml` that opens the GitHub Actions page for the deploy workflow:

```toml
[tasks.deploy]
description = "Open GitHub Actions deploy workflow"
run = "open https://github.com/<owner>/<repo>/actions/workflows/deploy.yml"
```

## Files to Create/Modify

- `/Users/zach/code/food-tracking-ai/.github/workflows/deploy.yml` (new)
- `/Users/zach/code/food-tracking-ai/infra/README.md` (new)
- `/Users/zach/code/food-tracking-ai/mise.toml` (add deploy task)

## Acceptance Criteria

- GitHub Actions workflow file is valid YAML with `workflow_dispatch` trigger.
- Workflow uses OIDC authentication (no long-lived AWS credentials).
- Workflow builds the Docker image, pushes to ECR, updates the ECS service, and verifies health.
- `infra/README.md` documents the complete first-time setup including how to configure GitHub Actions variables from Terraform outputs.
- A developer unfamiliar with the project can follow the README to deploy from scratch.

## Out of Scope

- Automatic triggers on push/PR (this is manual-only for v1)
- Blue/green or canary deployment strategies
- Rollback automation
- Monitoring or alerting setup beyond what Terraform already provisions
- Terraform apply from GitHub Actions (Terraform is run locally for v1)
