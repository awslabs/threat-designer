locals {
  prefix                             = "threat-designer"
  lambda_src_path                    = "../backend/app"
  building_path                      = "./build/"
  api_lambda_invoke_url           = "arn:aws:apigateway:${var.region}:lambda:path/2015-03-31/functions/${aws_lambda_alias.backend.arn}/invocations"
  authorizer_invoke_url              = "arn:aws:apigateway:${var.region}:lambda:path/2015-03-31/functions/${aws_lambda_alias.authorizer_lambda_alias.arn}/invocations"
  api_gw_stage                       = var.api_gw_stage
  aws_region                         = var.region
  environment                        = var.env
  powertools_layer_arn = "arn:aws:lambda:${var.region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-${var.python_layer}-x86_64:7"
  python_version       = "python${var.python_runtime}"
  allowed_origins = [
    "http://localhost:3000",
    "https://${aws_amplify_branch.develop.branch_name}.${aws_amplify_app.threat-designer.default_domain}",
    "http://localhost:5173"
  ]
}