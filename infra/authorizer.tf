locals {
  # Hash authorizer source files + requirements to detect actual code changes
  authorizer_source_hash = base64sha256(join("", concat(
    [for f in sort(fileset("${path.module}/../backend/authorizer", "**/*.py")) : filesha256("${path.module}/../backend/authorizer/${f}")]
  )))
}

resource "aws_lambda_function" "authorizer_lambda" {
  filename                       = data.archive_file.authorizer_lambda_code_zip.output_path
  source_code_hash               = local.authorizer_source_hash
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


# Wait for alias to stabilize and ensure no routing config
resource "null_resource" "wait_for_alias_stabilization" {
  triggers = {
    alias_version = aws_lambda_alias.authorizer_lambda_alias.function_version
  }

  provisioner "local-exec" {
    command = <<-EOT
      for i in {1..90}; do
        ROUTING=$(aws lambda get-alias \
          --function-name ${aws_lambda_function.authorizer_lambda.function_name} \
          --name ${aws_lambda_alias.authorizer_lambda_alias.name} \
          --query 'RoutingConfig.AdditionalVersionWeights' \
          --output text)
        
        if [ "$ROUTING" = "None" ] || [ -z "$ROUTING" ]; then
          echo "Alias stabilized, no routing config detected"
          exit 0
        fi
        
        echo "Waiting for routing config to clear... attempt $i"
        sleep 2
      done
      
      echo "Timeout waiting for alias to stabilize"
      exit 1
    EOT
  }

  depends_on = [aws_lambda_alias.authorizer_lambda_alias]
}


resource "aws_lambda_provisioned_concurrency_config" "authorizer_lambda_alias_provisioned_concurrency_config" {
  function_name                     = aws_lambda_alias.authorizer_lambda_alias.function_name
  provisioned_concurrent_executions = var.provisioned_lambda_concurrency
  qualifier                         = aws_lambda_alias.authorizer_lambda_alias.name
  depends_on = [null_resource.wait_for_alias_stabilization]

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
