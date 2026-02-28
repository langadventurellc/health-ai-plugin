# Security groups use standalone rules (aws_vpc_security_group_*_rule) for
# ALB and ECS to avoid circular dependency (ALB egress -> ECS, ECS ingress -> ALB).
# EFS uses inline rules since it only references ECS (no cycle).
#
# Note: Standalone rules cannot remove the AWS default allow-all egress rule.
# This is acceptable for ALB (only routes to registered targets) and ECS
# (needs all-outbound for ECR, USDA API, Open Food Facts). EFS uses inline
# rules so Terraform fully manages its rule set.

# --- ALB Security Group ---

resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  description = "ALB: allow inbound HTTP/HTTPS from the internet"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-alb-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from internet"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from internet (redirected to HTTPS)"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward traffic to ECS tasks"
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id
}

# --- ECS Security Group ---

resource "aws_security_group" "ecs" {
  name_prefix = "${local.name_prefix}-ecs-"
  description = "ECS tasks: allow inbound from ALB only"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-ecs-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "Inbound from ALB"
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_internet" {
  security_group_id = aws_security_group.ecs.id
  description       = "Outbound to internet (ECR, USDA API, Open Food Facts)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# --- EFS Security Group ---
# Fully inline rules: no circular dependencies, and Terraform manages the
# complete rule set (including removing the AWS default allow-all egress).

resource "aws_security_group" "efs" {
  name_prefix = "${local.name_prefix}-efs-"
  description = "EFS: allow inbound NFS from ECS tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "NFS from ECS tasks"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    description     = "NFS responses to ECS tasks"
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = { Name = "${local.name_prefix}-efs-sg" }

  lifecycle {
    create_before_destroy = true
  }
}
