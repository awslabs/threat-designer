resource "aws_bedrockagentcore_agent_runtime" "sentry" {
  count              = var.enable_sentry ? 1 : 0
  agent_runtime_name = "threat_designer_sentry"
  role_arn           = aws_iam_role.sentry_role[0].arn
  environment_variables = merge(
    {
      SESSION_TABLE      = aws_dynamodb_table.sentry_session[0].id,
      ATTACK_TREE_TABLE  = aws_dynamodb_table.attack_tree_data.id,
      S3_BUCKET          = aws_s3_bucket.architecture_bucket.id,
      REGION             = var.region,
      MODEL_PROVIDER     = var.model_provider
    },
    var.model_provider == "bedrock" ? {
      MODEL_ID         = var.model_sentry.id,
      MAX_TOKENS       = tostring(var.model_sentry.max_tokens),
      REASONING_BUDGET = jsonencode(var.model_sentry.reasoning_budget)
    } : {},
    var.model_provider == "openai" ? {
      OPENAI_API_KEY    = var.openai_api_key,
      MODEL_ID          = var.openai_model_sentry.id,
      MAX_TOKENS        = tostring(var.openai_model_sentry.max_tokens),
      REASONING_EFFORT  = jsonencode(var.openai_model_sentry.reasoning_effort)
    } : {},
    var.tavily_api_key != "" ? {
      TAVILY_API_KEY = var.tavily_api_key
    } : {}
  )
  authorizer_configuration {
    custom_jwt_authorizer {
      discovery_url   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.user_pool.id}/.well-known/openid-configuration"
      allowed_clients = [aws_cognito_user_pool_client.client.id]
    }
  }
  agent_runtime_artifact {
    container_configuration {
      container_uri = "${aws_ecr_repository.sentry[0].repository_url}:latest"
    }
  }
  network_configuration {
    network_mode = "PUBLIC"
  }
  request_header_configuration {
    request_header_allowlist = ["Authorization"]
  }
  lifecycle_configuration {
    idle_runtime_session_timeout = 3600
    max_lifetime = 28800
  }
  depends_on = [null_resource.docker_build_push]
}


resource "aws_ecr_repository" "sentry" {
  count                = var.enable_sentry ? 1 : 0
  name                 = "${local.prefix}-sentry"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "null_resource" "docker_build_push" {
  count      = var.enable_sentry ? 1 : 0
  depends_on = [aws_ecr_repository.sentry]

  triggers = {
    dockerfile_hash   = filemd5("${path.module}/../backend/sentry/Dockerfile")
    requirements_hash = filemd5("${path.module}/../backend/sentry/requirements.txt")
    source_hash       = sha256(join("", [for f in fileset("${path.module}/../backend/sentry", "**") : filesha256("${path.module}/../backend/sentry/${f}")]))
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/../backend/sentry"
    command     = <<-EOT
      # Get ECR login token
      aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
      aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin ${aws_ecr_repository.sentry[0].repository_url}
      
      # Ensure buildx is set up
      docker buildx create --use --name multiarch 2>/dev/null || docker buildx use multiarch
      
      # Build and push image for ARM64
      docker buildx build --platform linux/arm64 --build-arg AWS_REGION=${var.region} \
        -t ${aws_ecr_repository.sentry[0].repository_url}:latest \
        --push .
    EOT
  }
}



resource "aws_iam_role" "sentry_role" {
  count = var.enable_sentry ? 1 : 0
  name  = "${local.prefix}-sentry"

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

resource "aws_iam_role_policy" "agent_core_policy" {
  count = var.enable_sentry ? 1 : 0
  name  = "${local.prefix}-sentry-policy"
  role  = aws_iam_role.sentry_role[0].id

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
          "${aws_ecr_repository.sentry[0].arn}"
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
        "Sid" : "DynamoDBTableAccess",
        "Effect" : "Allow",
        "Action" : [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan"
        ],
        "Resource" : [
          "${aws_dynamodb_table.sentry_session[0].arn}",
          "${aws_dynamodb_table.sentry_session[0].arn}/*"
        ]
      },
      {
        "Sid" : "AttackTreeTableRead",
        "Effect" : "Allow",
        "Action" : [
          "dynamodb:GetItem"
        ],
        "Resource" : [
          "${aws_dynamodb_table.attack_tree_data.arn}"
        ]
      },
      {
        "Effect" : "Allow",
        "Action" : ["s3:GetObject"],
        "Resource" : ["${aws_s3_bucket.architecture_bucket.arn}", "${aws_s3_bucket.architecture_bucket.arn}/*"]
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
      },
      {
        "Sid" : "GetAgentAccessToken",
        "Effect" : "Allow",
        "Action" : [
          "bedrock-agentcore:GetWorkloadAccessToken",
          "bedrock-agentcore:GetWorkloadAccessTokenForJWT",
          "bedrock-agentcore:GetWorkloadAccessTokenForUserId"
        ],
        "Resource" : [
          "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.caller_identity.account_id}:workload-identity-directory/default",
          "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.caller_identity.account_id}:workload-identity-directory/default/workload-identity/*"
        ]
      },
      {
        "Sid" : "BedrockModelInvocation",
        "Effect" : "Allow",
        "Action" : [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ],
        "Resource" : [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:*:${data.aws_caller_identity.caller_identity.account_id}:*"
        ]
      },
      {
        "Effect" : "Allow",
        "Action" : [
          "sts:AssumeRole"
        ],
        "Resource" : [
          "*"
        ]
      },
      {
        "Sid" : "BedrockSessionPermissions",
        "Effect" : "Allow",
        "Action" : [
          "bedrock:CreateSession",
          "bedrock:GetSession",
          "bedrock:UpdateSession",
          "bedrock:DeleteSession",
          "bedrock:EndSession",
          "bedrock:ListSessions",
          "bedrock:CreateInvocation",
          "bedrock:ListInvocations",
          "bedrock:PutInvocationStep",
          "bedrock:GetInvocationStep",
          "bedrock:ListInvocationSteps"
        ],
        "Resource" : [
          "*"
        ]
      },
      {
        "Sid" : "BedrockSessionTagging",
        "Effect" : "Allow",
        "Action" : [
          "bedrock:TagResource",
          "bedrock:UntagResource",
          "bedrock:ListTagsForResource"
        ],
        "Resource" : "arn:aws:bedrock:${var.region}:${data.aws_caller_identity.caller_identity.account_id}:session/*"
      }
    ]
  })
}



resource "aws_dynamodb_table" "sentry_session" {
  count        = var.enable_sentry ? 1 : 0
  name         = "${local.prefix}-sentry-session"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "session_header"

  attribute {
    name = "session_header"
    type = "S"
  }
}
