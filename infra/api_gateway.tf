resource "aws_api_gateway_rest_api" "threat_design_api" {
  name        = "${local.prefix}-api"
  description = "Threat design api"
  body = templatefile("${local.lambda_src_path}/openapi.yml", {
    lambda_arn     = local.api_lambda_invoke_url,
    authorizer_arn = local.authorizer_invoke_url,
    aws_region     = var.region,
    ui_domain      = "https://${aws_amplify_branch.develop.branch_name}.${aws_amplify_app.threat-designer.default_domain}"
  })

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  lifecycle {
    create_before_destroy = true
  }

}

resource "aws_api_gateway_stage" "gateway_stage" {
  #checkov:skip=CKV_AWS_120:API GW caching is currently not required
  deployment_id        = aws_api_gateway_deployment.gateway_deployment.id
  rest_api_id          = aws_api_gateway_rest_api.threat_design_api.id
  xray_tracing_enabled = true

  stage_name = local.api_gw_stage

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gw.arn

    format = jsonencode({
      requestId               = "$context.requestId"
      sourceIp                = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      protocol                = "$context.protocol"
      httpMethod              = "$context.httpMethod"
      resourcePath            = "$context.resourcePath"
      routeKey                = "$context.routeKey"
      status                  = "$context.status"
      responseLength          = "$context.responseLength"
      integrationErrorMessage = "$context.integrationErrorMessage"
      }
    )
  }
}

resource "aws_api_gateway_deployment" "gateway_deployment" {
  rest_api_id = aws_api_gateway_rest_api.threat_design_api.id

  triggers = {
    redeployment = sha1(jsonencode(aws_api_gateway_rest_api.threat_design_api.body))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_method_settings" "general_settings" {
  rest_api_id = aws_api_gateway_rest_api.threat_design_api.id
  stage_name  = local.api_gw_stage
  method_path = "*/*"

  settings {
    #checkov:skip=CKV_AWS_225:API method settings caching is currently not required
    # Enable CloudWatch logging and metrics
    metrics_enabled    = true
    data_trace_enabled = false
    logging_level      = "INFO"

    # Limit the rate of calls to prevent abuse and unwanted charges
    throttling_rate_limit  = 100
    throttling_burst_limit = 50
  }

  depends_on = [
    aws_api_gateway_account.gw_account,
    aws_api_gateway_stage.gateway_stage
  ]
}


# Permission to invoke gateway authorizer lambda
resource "aws_lambda_permission" "threat_designer_api_gw_permission" {
  statement_id  = "AllowExecutionFromThreatDesignerAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_alias.authorizer_lambda_alias.function_name
  principal     = "apigateway.amazonaws.com"
  qualifier     = "dev"
  source_arn    = "${aws_api_gateway_rest_api.threat_design_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  qualifier     = aws_lambda_alias.backend.name
  source_arn = "${aws_api_gateway_rest_api.threat_design_api.execution_arn}/*/*"
}


resource "aws_api_gateway_account" "gw_account" {
  cloudwatch_role_arn = aws_iam_role.cloudwatch.arn
}


resource "aws_cloudwatch_log_group" "api_gw" {
  name       = "/aws/api_gw/${aws_api_gateway_rest_api.threat_design_api.id}"

  retention_in_days = 30
}

resource "aws_iam_role" "cloudwatch" {
  name               = "${local.prefix}-api-gateway-cloudwatch-global"
  assume_role_policy = templatefile("${path.module}/templates/api_gateway_trust_policy.json", {})
}


resource "aws_iam_role_policy" "cloudwatch" {
  name = "${local.prefix}-cloudwatch-policy"
  role = aws_iam_role.cloudwatch.id
  policy = templatefile("${path.module}/templates/api_gateway_cloudwatch_policy.json", {})
}