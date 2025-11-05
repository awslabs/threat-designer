#======================== Backend Lambda ======================

resource "aws_lambda_function" "backend" {
  description                    = "Lambda function for threat designer api"
  filename                       = data.archive_file.backend_lambda_code_zip.output_path
  source_code_hash               = data.archive_file.backend_lambda_code_zip.output_base64sha256
  function_name                  = "${local.prefix}-lambda-backend"
  handler                        = "index.lambda_handler"
  memory_size                    = 512
  publish                        = true
  role                           = aws_iam_role.threat_designer_api_role.arn
  reserved_concurrent_executions = var.lambda_concurrency
  runtime                        = local.python_version
  environment {
    variables = {
      LOG_LEVEL             = "INFO",
      REGION                = var.region,
      PORTAL_REDIRECT_URL   = "https://${aws_amplify_branch.develop.branch_name}.${aws_amplify_app.threat-designer.default_domain}"
      TRUSTED_ORIGINS       = "https://${aws_amplify_branch.develop.branch_name}.${aws_amplify_app.threat-designer.default_domain}, http://localhost:5173"
      THREAT_MODELING_AGENT = aws_bedrockagentcore_agent_runtime.threat_designer.agent_runtime_arn,
      AGENT_STATE_TABLE     = aws_dynamodb_table.threat_designer_state.id,
      AGENT_TRAIL_TABLE     = aws_dynamodb_table.threat_designer_trail.id,
      JOB_STATUS_TABLE      = aws_dynamodb_table.threat_designer_status.id,
      ARCHITECTURE_BUCKET   = aws_s3_bucket.architecture_bucket.id,
      SHARING_TABLE         = aws_dynamodb_table.threat_designer_sharing.id,
      LOCKS_TABLE           = aws_dynamodb_table.threat_designer_locks.id,
      COGNITO_USER_POOL_ID  = aws_cognito_user_pool.user_pool.id
    }
  }
  timeout = 600
  tracing_config {
    mode = "Active"
  }
  layers = [local.powertools_layer_arn]
}


resource "aws_iam_role" "threat_designer_api_role" {
  name = "${local.prefix}-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_threat_designer_api_policy" {
  name = "${local.prefix}-api-policy"
  role = aws_iam_role.threat_designer_api_role.id
  policy = templatefile("${path.module}/templates/backend_lambda_execution_role_policy.json", {
    state_table_arn        = aws_dynamodb_table.threat_designer_state.arn,
    status_table_arn       = aws_dynamodb_table.threat_designer_status.arn,
    architecture_bucket    = aws_s3_bucket.architecture_bucket.arn,
    threat_modeling_agent  = aws_bedrockagentcore_agent_runtime.threat_designer.agent_runtime_arn,
    trail_table_arn        = aws_dynamodb_table.threat_designer_trail.arn,
    sharing_table_arn      = aws_dynamodb_table.threat_designer_sharing.arn,
    locks_table_arn        = aws_dynamodb_table.threat_designer_locks.arn,
    cognito_user_pool_arn  = aws_cognito_user_pool.user_pool.arn
  })
}

resource "aws_lambda_provisioned_concurrency_config" "backend" {
  # depends_on = ["null_resource.alias_provisioned_concurrency_transition_delay"]
  function_name                     = aws_lambda_alias.backend.function_name
  provisioned_concurrent_executions = var.provisioned_lambda_concurrency
  qualifier                         = aws_lambda_alias.backend.name
}


resource "aws_lambda_alias" "backend" {
  name             = "dev"
  description      = "provisioned concurrency"
  function_name    = aws_lambda_function.backend.arn
  function_version = aws_lambda_function.backend.version

  routing_config {}
}
