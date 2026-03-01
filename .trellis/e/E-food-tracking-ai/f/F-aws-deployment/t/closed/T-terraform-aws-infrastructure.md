---
id: T-terraform-aws-infrastructure
title: Terraform AWS Infrastructure for ECS Deployment
status: done
priority: high
parent: F-aws-deployment
prerequisites:
  - T-create-dockerfile-for-mcp
affectedFiles:
  infra/main.tf: Provider config (hashicorp/aws ~> 5.0), local backend, name_prefix local
  infra/variables.tf: 'Input variables: aws_region, domain_name, hosted_zone_id,
    usda_api_key (sensitive), github_repo'
  infra/outputs.tf: 'Outputs: server_url, ecr_repository_url, alb_dns_name,
    github_actions_role_arn'
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
log:
  - Starting implementation. Reviewed task requirements, parent feature context,
    and Dockerfile (non-root user 'node' with UID/GID 1000, /app/data
    directory). Researched Terraform AWS provider versions -- using ~> 5.0 for
    stability. Creating infra/ directory with all specified .tf files.
  - 'Created complete Terraform configuration in infra/ for AWS ECS Fargate
    deployment. All 10 .tf files provision the full stack: VPC with
    public/private subnets across 2 AZs, single NAT gateway, ALB with HTTPS (ACM
    cert + DNS validation), ECS Fargate cluster/service/task definition (0.5
    vCPU, 1GB, port 3000), EFS with encrypted-at-rest and access point (UID/GID
    1000 matching Dockerfile), ECR repository, Secrets Manager for USDA API key,
    CloudWatch log group, IAM roles (task execution with ECR/logs/secrets
    permissions, minimal task role), and GitHub Actions OIDC provider with
    least-privilege IAM role for CI/CD. Security groups enforce ALB->ECS->EFS
    chain. terraform init and terraform validate both succeed. Updated
    .gitignore to exclude .terraform/, *.tfstate*, and terraform.tfvars while
    keeping .terraform.lock.hcl tracked.'
schema: v1.0
childrenIds: []
created: 2026-02-28T22:03:54.989Z
updated: 2026-02-28T22:03:54.989Z
---

## Context

The Food Tracking AI MCP server needs to be deployed to AWS as a Docker container. The Dockerfile is created in `T-create-dockerfile-for-mcp`. This task provisions all AWS infrastructure using Terraform.

Parent feature: `F-aws-deployment`

The server is a long-running Node.js process with SQLite file persistence. ECS Fargate with EFS is the simplest approach: Fargate avoids managing EC2 instances, and EFS provides persistent file storage that survives task restarts and redeployments. This is a single-user v1 system -- keep it simple.

## What to Build

Create Terraform configuration in `/Users/zach/code/food-tracking-ai/infra/` that provisions the complete AWS stack.

### AWS Resources

**Networking:**

- VPC with public and private subnets (2 AZs minimum for ALB requirement)
- Internet gateway for public subnets
- NAT gateway (single, for cost savings) for private subnet egress (ECR image pulls, external API calls to USDA/Open Food Facts)
- Security groups: ALB allows inbound 443 (HTTPS); ECS tasks allow inbound from ALB only; EFS allows inbound from ECS security group

**Container Registry:**

- ECR repository for the Docker image

**Compute (ECS Fargate):**

- ECS cluster
- Task definition: single container, 0.5 vCPU / 1 GB memory (sufficient for single-user), port 3000, EFS volume mount at `/app/data`
- Service: desired count 1, deployment minimum healthy percent 100 (ensure no downtime during deploy -- single task means wait for new before stopping old), health check grace period for startup time
- Container health check from the task definition or rely on ALB target group health check against `GET /health`

**Persistent Storage (EFS):**

- EFS file system with encrypted-at-rest
- Mount target in each private subnet
- Access point configured for the container's non-root UID/GID (match the Dockerfile user)

**Load Balancer & HTTPS:**

- Application Load Balancer (ALB) in public subnets
- ACM certificate for the domain (DNS validation). The domain/hosted zone should be a Terraform variable -- the user provides their domain.
- HTTPS listener (443) forwarding to the ECS target group on port 3000
- HTTP listener (80) redirecting to HTTPS
- Target group with health check on `GET /health` path

**Secrets & Configuration:**

- AWS Secrets Manager secret for `USDA_API_KEY`
- ECS task definition environment variables: `PORT=3000`, `SQLITE_DB_PATH=/app/data/food-cache.db`, `ISSUER_URL` (set to the HTTPS domain URL)
- ECS task definition secrets (from Secrets Manager): `USDA_API_KEY`
- IAM task execution role with permissions for ECR pull, CloudWatch Logs, and Secrets Manager read
- IAM task role (minimal, only what the app needs at runtime -- currently nothing beyond defaults)

**GitHub Actions OIDC Authentication:**

- IAM OIDC identity provider for `token.actions.githubusercontent.com`
- IAM role assumable by the GitHub Actions workflow via OIDC (no long-lived AWS credentials). The role trust policy should restrict to the specific GitHub repo and branch (e.g., `repo:<owner>/<repo>:ref:refs/heads/main`). The repo owner/name should be Terraform variables.
- Role permissions: ECR push (GetAuthorizationToken, BatchCheckLayerAvailability, PutImage, InitiateLayerUpload, UploadLayerPart, CompleteLayerUpload), ECS update-service and describe for deployments, and ECS wait operations.

**Logging:**

- CloudWatch log group for ECS container logs

### Terraform Structure

```
infra/
  main.tf           # Provider config, backend (local state for v1, S3 can come later)
  variables.tf      # Input variables (region, domain name, hosted zone ID, GitHub repo, etc.)
  outputs.tf        # ALB DNS name, server URL, ECR repo URL, GH Actions role ARN
  vpc.tf            # VPC, subnets, IGW, NAT, route tables
  ecs.tf            # Cluster, task definition, service
  alb.tf            # ALB, listeners, target group, ACM cert
  efs.tf            # File system, mount targets, access point
  ecr.tf            # Container registry
  secrets.tf        # Secrets Manager
  iam.tf            # Task execution role, task role, GitHub Actions OIDC provider + role
  security-groups.tf # All security group definitions
```

### Terraform Variables (minimum)

- `aws_region` (default: `us-west-2`)
- `domain_name` (required -- the FQDN for the server, e.g., `food.example.com`)
- `hosted_zone_id` (required -- Route53 hosted zone for DNS validation and ALB alias record)
- `usda_api_key` (sensitive, required -- initial value for Secrets Manager)
- `github_repo` (required -- `owner/repo` format, e.g., `zach/food-tracking-ai`, used in OIDC trust policy)

### Terraform Outputs

- `server_url` -- Full HTTPS URL of the deployed server (e.g., `https://food.example.com`)
- `ecr_repository_url` -- ECR repo URL for pushing Docker images
- `alb_dns_name` -- ALB DNS name for debugging
- `github_actions_role_arn` -- IAM role ARN for the GitHub Actions workflow to assume

### .gitignore Updates

Add the following to the repo's `.gitignore` to prevent committing Terraform artifacts:

- `.terraform/` (provider binaries, large)
- `*.tfstate` (may contain sensitive data)
- `*.tfstate.*` (state backups)
- `terraform.tfvars` (may contain secrets like `usda_api_key`)
- `infra/.terraform.lock.hcl` should be committed (it locks provider versions)

## Files to Create

- `/Users/zach/code/food-tracking-ai/infra/*.tf` (all Terraform files listed above)
- `/Users/zach/code/food-tracking-ai/infra/.terraform.lock.hcl` will be auto-generated

## Files to Modify

- `/Users/zach/code/food-tracking-ai/.gitignore` (add Terraform artifact exclusions)

## Acceptance Criteria

- `terraform init` and `terraform validate` succeed in the `infra/` directory.
- `terraform plan` produces a valid plan with no errors (given required variables).
- All resources described above are defined in the Terraform configuration.
- EFS mount is configured with the correct access point UID/GID matching the Dockerfile's non-root user.
- HTTPS is terminated at the ALB with an ACM certificate.
- Secrets are stored in Secrets Manager and injected into the container as environment variables.
- ECS health check uses the `/health` endpoint.
- Security groups follow least-privilege (ECS only reachable from ALB, EFS only from ECS).
- Terraform state is local (no remote backend required for v1).
- Route53 alias record points the domain to the ALB.
- `.gitignore` updated to exclude `.terraform/`, `*.tfstate*`, and `terraform.tfvars`.
- GitHub Actions OIDC provider and IAM role are created with least-privilege permissions scoped to the specific repo.

## Out of Scope

- CI/CD pipeline definition (separate task `T-deployment-script-and`)
- Remote Terraform state backend (S3/DynamoDB)
- Auto-scaling (single task, single user)
- WAF or advanced security layers
- Multi-region deployment
- Custom domain email or SES configuration
- Monitoring/alerting beyond CloudWatch Logs
