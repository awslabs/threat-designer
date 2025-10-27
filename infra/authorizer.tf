resource "aws_lambda_function" "authorizer_lambda" {
  filename                       = data.archive_file.authorizer_lambda_code_zip.output_path
  source_code_hash               = data.archive_file.authorizer_lambda_code_zip.output_base64sha256
  handler                        = "index.lambda_handler"
  runtime                        = local.python_version
  reserved_concurrent_executions = var.lambda_concurrency
  function_name                  = "${local.prefix}-authorizer"
  role                           = aws_iam_role.auth-lambda-execution-role.arn
  publish                        = true
  timeout                        = 60
  memory_size                    = 2048
  ephemeral_storage {
    size = 1024
  }
  depends_on = [
    null_resource.build
  ]
  layers = [local.powertools_layer_arn, aws_lambda_layer_version.lambda_layer_authorization.arn]
  tracing_config {
    mode = "Active"
  }
  environment {
    variables = {
      COGNITO_REGION        = local.aws_region
      COGNITO_APP_CLIENT_ID = aws_cognito_user_pool_client.client.id
      COGNITO_USER_POOL_ID  = aws_cognito_user_pool.user_pool.id
    }
  }
}


resource "aws_lambda_permission" "authorizer_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  qualifier     = aws_lambda_alias.authorizer_lambda_alias.name
  source_arn    = "${aws_api_gateway_rest_api.threat_design_api.execution_arn}/*/*"
}

resource "aws_lambda_alias" "authorizer_lambda_alias" {
  name             = "dev"
  description      = "alias with provisioned concurrency"
  function_name    = aws_lambda_function.authorizer_lambda.arn
  function_version = aws_lambda_function.authorizer_lambda.version
}

resource "aws_lambda_provisioned_concurrency_config" "authorizer_lambda_alias_provisioned_concurrency_config" {
  function_name                     = aws_lambda_alias.authorizer_lambda_alias.function_name
  provisioned_concurrent_executions = var.provisioned_lambda_concurrency
  qualifier                         = aws_lambda_alias.authorizer_lambda_alias.name
}


resource "aws_iam_role" "auth-lambda-execution-role" {
  name               = "${local.prefix}-auth-lambda-execution-role"
  assume_role_policy = templatefile("${path.module}/templates/lambda_trust_policy.json", {})
}


resource "aws_iam_role_policy" "auth-lambda-role-policy" {
  name = "${local.prefix}-auth-lambda-policy"
  role = aws_iam_role.auth-lambda-execution-role.id
  policy = templatefile("${path.module}/templates/auth_lambda_execution_role_policy.json", {
    USER_POOL_ARN = aws_cognito_user_pool.user_pool.arn
  })
}
