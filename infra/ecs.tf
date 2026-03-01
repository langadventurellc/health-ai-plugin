# --- ECS Cluster ---

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = { Name = "${local.name_prefix}-cluster" }
}

# --- CloudWatch Log Group ---

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = 30

  tags = { Name = "${local.name_prefix}-logs" }
}

# --- ECS Task Definition ---

resource "aws_ecs_task_definition" "app" {
  family                   = local.name_prefix
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = local.name_prefix
      # :latest is a placeholder -- the service will fail until the first
      # CI/CD pipeline pushes an image and updates the task definition.
      image     = "${aws_ecr_repository.app.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

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

      secrets = [
        {
          name      = "USDA_API_KEY"
          valueFrom = aws_secretsmanager_secret.usda_api_key.arn
        }
      ]

      mountPoints = [
        {
          sourceVolume  = "efs-data"
          containerPath = "/app/data"
          readOnly      = false
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  volume {
    name = "efs-data"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.data.id
      transit_encryption = "ENABLED"

      authorization_config {
        access_point_id = aws_efs_access_point.data.id
        iam             = "DISABLED"
      }
    }
  }

  tags = { Name = "${local.name_prefix}-task" }
}

# --- ECS Service ---

resource "aws_ecs_service" "app" {
  name            = local.name_prefix
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  platform_version = "LATEST"

  # Wait for new task to be healthy before stopping old one.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = local.name_prefix
    container_port   = 3000
  }

  depends_on = [
    aws_lb_listener.https,
    aws_lb_listener.http_forward,
    aws_efs_mount_target.data,
  ]

  # Prevent terraform apply from reverting CI/CD-driven task definition updates.
  lifecycle {
    ignore_changes = [task_definition]
  }

  tags = { Name = "${local.name_prefix}-service" }
}
