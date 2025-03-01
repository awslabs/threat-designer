resource "aws_amplify_app" "threat-designer" {
  name = "${local.prefix}-app"

  build_spec = <<-EOT
    version: 1
    frontend:
        phases:
            preBuild:
            commands:
                - npm ci
            build:
            commands:
                - npm run build
        artifacts:
            baseDirectory: build
            files:
            - '**/*'
        cache:
            paths:
            - node_modules/**/*
  EOT

  custom_rule {
    source = "/<*>"
    status = "404"
    target = "/index.html"
  }
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|ttf|map|json)$)([^.]+$)/>"
    status = "200"
    target = "/index.html"
  }

  iam_service_role_arn = aws_iam_role.amplify_iam_role.arn
}

resource "aws_amplify_branch" "develop" {
  app_id      = aws_amplify_app.threat-designer.id
  branch_name = "dev"
  stage       = "DEVELOPMENT"

  # Optional configurations
  enable_auto_build = false
  framework        = "React"
}

resource "aws_iam_role" "amplify_iam_role" {
  name               = "${local.prefix}-amplify-role"
  assume_role_policy = templatefile("${path.module}/templates/amplify_trust_policy.json", {})
}

resource "aws_iam_role_policy" "amplify_iam_policy" {
  name = "${local.prefix}-amplify-policy"
  role = aws_iam_role.amplify_iam_role.id
  policy = templatefile("${path.module}/templates/amplify_execution_role_policy.json", {})
}