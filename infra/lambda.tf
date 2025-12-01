#======================== Backend Lambda ======================

locals {
  # Hash backend source files + requirements to detect actual code changes
  backend_source_hash = base64sha256(join("", concat(
    [for f in sort(fileset("${path.module}/../backend/app", "**/*.py")) : filesha256("${path.module}/../backend/app/${f}")],
    [filesha256("${path.module}/../backend/app/requirements.txt")]
  )))
}

resource "aws_lambda_function" "backend" {
  description                    = "Lambda function for threat designer api"
  filename                       = data.archive_file.backend_lambda_code_zip.output_path
  source_code_hash               = local.backend_source_hash
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
      ATTACK_TREE_TABLE     = aws_dynamodb_table.attack_tree_data.id,
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
    state_table_arn       = aws_dynamodb_table.threat_designer_state.arn,
    status_table_arn      = aws_dynamodb_table.threat_designer_status.arn,
    architecture_bucket   = aws_s3_bucket.architecture_bucket.arn,
    threat_modeling_agent = aws_bedrockagentcore_agent_runtime.threat_designer.agent_runtime_arn,
    trail_table_arn       = aws_dynamodb_table.threat_designer_trail.arn,
    sharing_table_arn     = aws_dynamodb_table.threat_designer_sharing.arn,
    locks_table_arn       = aws_dynamodb_table.threat_designer_locks.arn,
    attack_tree_table_arn = aws_dynamodb_table.attack_tree_data.arn,
    cognito_user_pool_arn = aws_cognito_user_pool.user_pool.arn
  })
}

resource "aws_lambda_alias" "backend" {
  name             = "dev"
  description      = "provisioned concurrency"
  function_name    = aws_lambda_function.backend.arn
  function_version = aws_lambda_function.backend.version
}

resource "null_resource" "wait_for_backend_alias_stabilization" {
  triggers = {
    alias_version = aws_lambda_alias.backend.function_version
  }

  provisioner "local-exec" {
    command = <<-EOT
      for i in {1..90}; do
        ROUTING=$(aws lambda get-alias \
          --function-name ${aws_lambda_function.backend.function_name} \
          --name ${aws_lambda_alias.backend.name} \
          --query 'RoutingConfig.AdditionalVersionWeights' \
          --output text)
        
        if [ "$ROUTING" == "None" ] || [ -z "$ROUTING" ]; then
          echo "Backend alias stabilized, no routing config detected"
          exit 0
        fi
        
        echo "Waiting for backend routing config to clear... attempt $i"
        sleep 2
      done
      
      echo "Timeout waiting for backend alias to stabilize"
      exit 1
    EOT
  }

  depends_on = [aws_lambda_alias.backend]
}

resource "aws_lambda_provisioned_concurrency_config" "backend" {
  function_name                     = aws_lambda_alias.backend.function_name
  provisioned_concurrent_executions = var.provisioned_lambda_concurrency
  qualifier                         = aws_lambda_alias.backend.name
  
  depends_on = [null_resource.wait_for_backend_alias_stabilization]
}
