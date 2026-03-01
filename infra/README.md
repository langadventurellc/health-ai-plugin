# Infrastructure

AWS deployment for the Food Tracking AI MCP server. Uses Terraform for infrastructure provisioning and GitHub Actions for continuous deployment.

## Deployment Modes

The infrastructure supports two deployment modes:

| Mode          | Domain Required                        | Protocol       | Auth              | Use Case              |
| ------------- | -------------------------------------- | -------------- | ----------------- | --------------------- |
| **Domain**    | Yes (`domain_name` + `hosted_zone_id`) | HTTPS          | OAuth 2.1 enabled | Production            |
| **No-domain** | No (omit both variables)               | HTTP (ALB DNS) | Disabled          | Development / testing |

In **no-domain mode**, the server is accessible at the ALB's default DNS name over HTTP. OAuth authentication is automatically disabled (`AUTH_ENABLED=false`). This is suitable for development and testing but **should not be used for production** since traffic is unencrypted and unauthenticated.

In **domain mode**, an ACM certificate is provisioned and validated via Route53, the ALB terminates HTTPS on port 443, HTTP requests are redirected to HTTPS, and OAuth 2.1 authentication is enabled.

## Prerequisites

- **AWS CLI** configured with credentials that have sufficient permissions for Terraform
- **Terraform** >= 1.5
- **Docker** (for local image builds/testing)
- **Route53 hosted zone** for the domain you want to use (domain mode only)
- **GitHub repository** (the OIDC trust is tied to a specific repo)
- **USDA API key** from https://fdc.nal.usda.gov/api-key-signup

## Architecture Overview

- **ECS Fargate** running the MCP server container (single task, single-user v1)
- **Application Load Balancer** with HTTPS (domain mode) or HTTP (no-domain mode)
- **ACM certificate** auto-validated via Route53 (domain mode only)
- **EFS** for SQLite persistence across deployments
- **ECR** for Docker image storage
- **Secrets Manager** for the USDA API key
- **GitHub Actions OIDC** for keyless CI/CD authentication (no long-lived AWS credentials)

## First-Time Setup

### 1. Initialize and Apply Terraform

```bash
cd infra
terraform init
```

Create a `terraform.tfvars` file (this file is gitignored):

**Domain mode** (HTTPS + auth):

```hcl
domain_name    = "food.example.com"
hosted_zone_id = "Z0123456789ABCDEF"
usda_api_key   = "your-usda-api-key"
github_repo    = "your-username/food-tracking-ai"
aws_region     = "us-west-2"  # optional, defaults to us-west-2
```

**No-domain mode** (HTTP, no auth):

```hcl
usda_api_key = "your-usda-api-key"
github_repo  = "your-username/food-tracking-ai"
aws_region   = "us-west-2"  # optional, defaults to us-west-2
```

Apply the infrastructure:

```bash
terraform apply
```

### 2. Configure GitHub Actions Variables

After `terraform apply` completes, copy the outputs into GitHub Actions **variables** (not secrets -- these values are not sensitive). Go to your repository Settings > Secrets and variables > Actions > Variables tab.

| Terraform Output          | GitHub Actions Variable | Description                          |
| ------------------------- | ----------------------- | ------------------------------------ |
| `ecr_repository_url`      | `ECR_REPOSITORY_URL`    | ECR repo URL for Docker images       |
| `ecs_cluster_name`        | `ECS_CLUSTER_NAME`      | ECS cluster name                     |
| `ecs_service_name`        | `ECS_SERVICE_NAME`      | ECS service name                     |
| `server_url`              | `SERVER_URL`            | Server URL for health checks         |
| `github_actions_role_arn` | `AWS_ROLE_ARN`          | IAM role ARN for OIDC authentication |
| _(your region)_           | `AWS_REGION`            | AWS region (e.g., `us-west-2`)       |

To print all outputs:

```bash
terraform output
```

No manual IAM configuration is needed -- the OIDC trust between GitHub and AWS is set up automatically by Terraform.

### 3. Deploy

Navigate to the **Actions** tab in your GitHub repository, select the **Deploy** workflow, and click **Run workflow**.

The workflow will:

1. Build the Docker image from the repo root
2. Push it to ECR (tagged with git SHA and `latest`)
3. Force a new ECS deployment to pull the updated image
4. Wait for the service to stabilize
5. Verify the `/health` endpoint responds

### 4. Configure the Plugin

Update `plugin/.mcp.json` to point to your deployed server. Replace `PLACEHOLDER_URL` in the URL with your server URL from the `server_url` Terraform output:

**Domain mode:**

```diff
- "url": "https://PLACEHOLDER_URL/mcp"
+ "url": "https://food.example.com/mcp"
```

The first time Claude Code connects, it will complete the OAuth 2.1 flow automatically.

**No-domain mode:**

```diff
- "url": "https://PLACEHOLDER_URL/mcp"
+ "url": "http://food-tracking-alb-123456.us-west-2.elb.amazonaws.com/mcp"
```

No OAuth flow is needed since auth is disabled.

## Terraform Variables

| Variable         | Required | Default     | Description                                                     |
| ---------------- | -------- | ----------- | --------------------------------------------------------------- |
| `domain_name`    | No       | `null`      | FQDN for the server. If null, uses ALB DNS over HTTP (no auth). |
| `hosted_zone_id` | No       | `null`      | Route53 hosted zone ID. Required when `domain_name` is set.     |
| `usda_api_key`   | Yes      | --          | USDA FoodData Central API key (stored in Secrets Manager)       |
| `github_repo`    | Yes      | --          | GitHub repo in `owner/repo` format (for OIDC trust policy)      |
| `aws_region`     | No       | `us-west-2` | AWS region for all resources                                    |

## Useful Commands

> These examples use the default resource names and `us-west-2` region. Your actual values may differ -- run `terraform output` and substitute the values from your `aws_region` Terraform variable accordingly.

### View Logs

```bash
# Stream recent logs
aws logs tail /ecs/food-tracking --follow --region "$AWS_REGION"

# View logs from a specific time range
aws logs tail /ecs/food-tracking --since 1h --region "$AWS_REGION"
```

### ECS Debugging

```bash
# Check service status
aws ecs describe-services \
  --cluster food-tracking-cluster \
  --services food-tracking \
  --region "$AWS_REGION"

# List running tasks
aws ecs list-tasks \
  --cluster food-tracking-cluster \
  --service-name food-tracking \
  --region "$AWS_REGION"

# Describe a specific task (get task ARN from list-tasks)
aws ecs describe-tasks \
  --cluster food-tracking-cluster \
  --tasks <task-arn> \
  --region "$AWS_REGION"
```

### Tear Down

```bash
cd infra
terraform destroy
```

This will remove all AWS resources. The EFS volume (SQLite data) will be deleted -- back up if needed.
