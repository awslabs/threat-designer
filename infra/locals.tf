locals {
  prefix                = "threat-designer"
  lambda_src_path       = "../backend/app"
  building_path         = "./build/"
  api_lambda_invoke_url = "arn:aws:apigateway:${var.region}:lambda:path/2015-03-31/functions/${aws_lambda_alias.backend.arn}/invocations"
  authorizer_invoke_url = "arn:aws:apigateway:${var.region}:lambda:path/2015-03-31/functions/${aws_lambda_alias.authorizer_lambda_alias.arn}/invocations"
  api_gw_stage          = var.api_gw_stage
  aws_region            = var.region
  environment           = var.env
  powertools_layer_arn  = "arn:aws:lambda:${var.region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-${var.python_layer}-x86_64:25"
  python_version        = "python${var.python_runtime}"
  allowed_origins = [
    "http://localhost:3000",
    "https://${aws_amplify_branch.develop.branch_name}.${aws_amplify_app.threat-designer.default_domain}",
    "http://localhost:5173"
  ]

  use_external_agent_ecr  = var.external_agent_ecr_arn != ""
  use_external_sentry_ecr = var.external_sentry_ecr_arn != ""

  # Derive repository URL from ARN: arn:aws:ecr:region:account:repository/name -> account.dkr.ecr.region.amazonaws.com/name
  external_agent_ecr_url  = local.use_external_agent_ecr ? "${split(":", var.external_agent_ecr_arn)[4]}.dkr.ecr.${split(":", var.external_agent_ecr_arn)[3]}.amazonaws.com/${split("/", var.external_agent_ecr_arn)[1]}" : ""
  external_sentry_ecr_url = local.use_external_sentry_ecr ? "${split(":", var.external_sentry_ecr_arn)[4]}.dkr.ecr.${split(":", var.external_sentry_ecr_arn)[3]}.amazonaws.com/${split("/", var.external_sentry_ecr_arn)[1]}" : ""

  agent_container_uri  = local.use_external_agent_ecr ? "${local.external_agent_ecr_url}:${var.agent_image_tag}" : "${aws_ecr_repository.threat-designer[0].repository_url}:latest"
  sentry_container_uri = local.use_external_sentry_ecr ? "${local.external_sentry_ecr_url}:${var.sentry_image_tag}" : "${aws_ecr_repository.sentry[0].repository_url}:latest"

  agent_ecr_arn  = local.use_external_agent_ecr ? var.external_agent_ecr_arn : aws_ecr_repository.threat-designer[0].arn
  sentry_ecr_arn = local.use_external_sentry_ecr ? var.external_sentry_ecr_arn : aws_ecr_repository.sentry[0].arn
}