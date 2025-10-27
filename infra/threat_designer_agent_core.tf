resource "aws_bedrockagentcore_agent_runtime" "threat_designer" {
  agent_runtime_name = "threat_designer_agent"
  role_arn           = aws_iam_role.threat_designer_role.arn
  environment_variables = {
    AGENT_STATE_TABLE   = aws_dynamodb_table.threat_designer_state.id,
    JOB_STATUS_TABLE    = aws_dynamodb_table.threat_designer_status.id,
    AGENT_TRAIL_TABLE   = aws_dynamodb_table.threat_designer_trail.id,
    REGION              = var.region,
    LOG_LEVEL           = var.log_level,
    TRACEBACK_ENABLED   = var.traceback_enabled,
    ARCHITECTURE_BUCKET = aws_s3_bucket.architecture_bucket.id,
    MAIN_MODEL          = jsonencode(var.model_main),
    MODEL_STRUCT        = jsonencode(var.model_struct),
    MODEL_SUMMARY       = jsonencode(var.model_summary),
    REASONING_MODELS    = jsonencode(var.reasoning_models)
  }
  agent_runtime_artifact {
    container_configuration {
      container_uri = "${aws_ecr_repository.threat-designer.repository_url}:latest"
    }
  }
  network_configuration {
    network_mode = "PUBLIC"
  }
  depends_on = [null_resource.docker_agent_build_push]
}


resource "aws_ecr_repository" "threat-designer" {
  name                 = "${local.prefix}-agent"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "null_resource" "docker_agent_build_push" {
  depends_on = [aws_ecr_repository.threat-designer]

  triggers = {
    dockerfile_hash   = filemd5("${path.module}/../backend/threat_designer/Dockerfile")
    requirements_hash = filemd5("${path.module}/../backend/threat_designer/requirements.txt")
    source_hash       = sha256(join("", [for f in fileset("${path.module}/../backend/threat_designer", "**") : filesha256("${path.module}/../backend/threat_designer/${f}")]))
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/../backend/threat_designer"
    command     = <<-EOT
      # Get ECR login token
      aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
      aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin ${aws_ecr_repository.threat-designer.repository_url}
      
      # Build image
      docker build --build-arg AWS_REGION=${var.region} -t ${aws_ecr_repository.threat-designer.name}:latest .
      
      # Tag image
      docker tag ${aws_ecr_repository.threat-designer.name}:latest ${aws_ecr_repository.threat-designer.repository_url}:latest
      
      # Push image
      docker push ${aws_ecr_repository.threat-designer.repository_url}:latest
    EOT
  }
}



resource "aws_iam_role" "threat_designer_role" {
  name = "${local.prefix}-agent-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "bedrock-agentcore.amazonaws.com"
        }
        Condition = {
          StringEquals = {
            "aws:SourceAccount" : data.aws_caller_identity.caller_identity.account_id
          },
          ArnLike = {
            "aws:SourceArn" : "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.caller_identity.account_id}:*"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "policy_agent" {
  name = "${local.prefix}-agent-policy"
  role = aws_iam_role.threat_designer_role.id
  policy = templatefile("${path.module}/templates/threat_designer_role_policy.json", {
    state_table_arn     = aws_dynamodb_table.threat_designer_state.arn,
    trail_table_arn     = aws_dynamodb_table.threat_designer_trail.arn,
    status_table_arn    = aws_dynamodb_table.threat_designer_status.arn,
    architecture_bucket = aws_s3_bucket.architecture_bucket.arn
  })
}

resource "aws_iam_role_policy" "threat_designer_agent_core_policy" {
  name = "${local.prefix}-threat_designer_agent_core_policy"
  role = aws_iam_role.threat_designer_role.id

  policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Sid" : "ECRImageAccess",
        "Effect" : "Allow",
        "Action" : [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ],
        "Resource" : [
          "${aws_ecr_repository.threat-designer.arn}"
        ]
      },
      {
        "Sid" : "ECRAuthToken",
        "Effect" : "Allow",
        "Action" : [
          "ecr:GetAuthorizationToken"
        ],
        "Resource" : "*"
      },
      {
        "Effect" : "Allow",
        "Action" : [
          "logs:DescribeLogStreams",
          "logs:CreateLogGroup"
        ],
        "Resource" : [
          "arn:aws:logs:${var.region}:${data.aws_caller_identity.caller_identity.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*"
        ]
      },
      {
        "Effect" : "Allow",
        "Action" : [
          "logs:DescribeLogGroups"
        ],
        "Resource" : [
          "arn:aws:logs:${var.region}:${data.aws_caller_identity.caller_identity.account_id}:log-group:*"
        ]
      },
      {
        "Effect" : "Allow",
        "Action" : [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        "Resource" : [
          "arn:aws:logs:${var.region}:${data.aws_caller_identity.caller_identity.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"
        ]
      },
      {
        "Sid" : "ECRTokenAccess",
        "Effect" : "Allow",
        "Action" : [
          "ecr:GetAuthorizationToken"
        ],
        "Resource" : "*"
      },
      {
        "Effect" : "Allow",
        "Action" : [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets"
        ],
        "Resource" : [
          "*"
        ]
      },
      {
        "Effect" : "Allow",
        "Resource" : "*",
        "Action" : "cloudwatch:PutMetricData",
        "Condition" : {
          "StringEquals" : {
            "cloudwatch:namespace" : "bedrock-agentcore"
          }
        }
      }
    ]
  })
}