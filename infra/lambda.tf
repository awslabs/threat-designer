resource "aws_lambda_function" "threat_designer" {
  filename                       = data.archive_file.td_lambda_code_zip.output_path
  source_code_hash               = data.archive_file.td_lambda_code_zip.output_base64sha256
  function_name    = "${local.prefix}-lambda"
  role            = aws_iam_role.threat_designer_role.arn
  handler         = "index.lambda_handler"
  runtime         = local.python_version
  memory_size     = 2048
  publish         = true
  timeout         = 900
  
  tracing_config {
    mode = "Active"
  }
  
  environment {
    variables = {
      AGENT_STATE_TABLE    = aws_dynamodb_table.threat_designer_state.id,
      JOB_STATUS_TABLE = aws_dynamodb_table.threat_designer_status.id,
      REGION              = var.region,
      ARCHITECTURE_BUCKET = aws_s3_bucket.architecture_bucket.id,
      MAIN_MODEL          = jsonencode(var.model_main)
      MODEL_STRUCT        = jsonencode(var.model_struct)
      REASONING_MODELS    = jsonencode(var.reasoning_models)
    }
  }

  depends_on = [
    null_resource.build
  ]
  layers = [ local.powertools_layer_arn, aws_lambda_layer_version.lambda_layer_langchain.arn]
}

resource "aws_iam_role" "threat_designer_role" {
  name = "${local.prefix}-role"

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

resource "aws_iam_role_policy" "lambda_tm_policy" {
  name = "${local.prefix}-policy"
  role = aws_iam_role.threat_designer_role.id
  policy = templatefile("${path.module}/templates/threat_designer_lambda_role_policy.json", {
    state_table_arn = aws_dynamodb_table.threat_designer_state.arn,
    status_table_arn = aws_dynamodb_table.threat_designer_status.arn,
    architecture_bucket = aws_s3_bucket.architecture_bucket.arn
  })
}




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
      LOG_LEVEL              = "INFO",
      REGION                 = var.region,
      PORTAL_REDIRECT_URL    = "https://${aws_amplify_branch.develop.branch_name}.${aws_amplify_app.threat-designer.default_domain}"
      TRUSTED_ORIGINS        = "https://${aws_amplify_branch.develop.branch_name}.${aws_amplify_app.threat-designer.default_domain}, http://localhost:5173"
      THREAT_MODELING_LAMBDA = aws_lambda_function.threat_designer.id,
      AGENT_STATE_TABLE      = aws_dynamodb_table.threat_designer_state.id,
      JOB_STATUS_TABLE       = aws_dynamodb_table.threat_designer_status.id,
      ARCHITECTURE_BUCKET    = aws_s3_bucket.architecture_bucket.id
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
    state_table_arn = aws_dynamodb_table.threat_designer_state.arn,
    status_table_arn = aws_dynamodb_table.threat_designer_status.arn,
    architecture_bucket = aws_s3_bucket.architecture_bucket.arn,
    threat_modeling_lambda = aws_lambda_function.threat_designer.arn
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
