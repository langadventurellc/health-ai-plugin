# --- Route53 Hosted Zone (managed zone mode only) ---

resource "aws_route53_zone" "main" {
  count = local.manages_zone ? 1 : 0
  name  = var.zone_domain_name

  tags = { Name = "${local.name_prefix}-zone" }
}

# --- ACM Certificate (domain mode only) ---

resource "aws_acm_certificate" "main" {
  count                     = local.has_domain ? 1 : 0
  domain_name               = local.manages_zone ? var.zone_domain_name : var.domain_name
  subject_alternative_names = local.manages_zone ? ["*.${var.zone_domain_name}"] : []
  validation_method         = "DNS"

  tags = { Name = "${local.name_prefix}-cert" }

  lifecycle {
    precondition {
      condition     = var.hosted_zone_id != null || var.zone_domain_name != null
      error_message = "Either hosted_zone_id or zone_domain_name is required when domain_name is set."
    }
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.has_domain ? {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = local.effective_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]

  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  count                   = local.has_domain ? 1 : 0
  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# --- Application Load Balancer ---

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = { Name = "${local.name_prefix}-alb" }
}

# --- Target Group ---

resource "aws_lb_target_group" "app" {
  name        = "${local.name_prefix}-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = { Name = "${local.name_prefix}-tg" }
}

# --- HTTPS Listener (443, domain mode only) ---

resource "aws_lb_listener" "https" {
  count             = local.has_domain ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# --- HTTP Listener (80) -> Redirect to HTTPS (domain mode only) ---

resource "aws_lb_listener" "http_redirect" {
  count             = local.has_domain ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# --- HTTP Listener (80) -> Forward to target (no-domain mode only) ---

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

# --- Route53 Alias Record (domain mode only) ---

resource "aws_route53_record" "app" {
  count   = local.has_domain ? 1 : 0
  zone_id = local.effective_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
