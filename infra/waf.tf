resource "aws_wafv2_web_acl_association" "api_gateway" {
  count        = var.api_gateway_waf_arn != null ? 1 : 0
  resource_arn = aws_api_gateway_stage.gateway_stage.arn
  web_acl_arn  = var.api_gateway_waf_arn
}

resource "aws_wafv2_web_acl_association" "amplify" {
  count        = var.amplify_waf_arn != null ? 1 : 0
  resource_arn = aws_amplify_app.threat-designer.arn
  web_acl_arn  = var.amplify_waf_arn
  provider     = aws.us_east_1
}
