# Outputs
output "user_pool_id" {
  value = aws_cognito_user_pool.user_pool.id
}

output "app_client_id" {
  value = aws_cognito_user_pool_client.client.id
}

output "cognito_domain" {
  value       = "${aws_cognito_user_pool_domain.domain.domain}.auth.${var.region}.amazoncognito.com"
  description = "Cognito User Pool Domain"
}

output "amplify_app_arn" {
  description = "ARN of the amplify APP"
  value       = aws_amplify_app.threat-designer.arn
}

output "amplify_app_id" {
  description = "Unique ID of the amplify APP"
  value       = aws_amplify_app.threat-designer.id
}

output "amplify_branch_arn" {
  description = "ARN for the branch"
  value       = aws_amplify_branch.develop.arn
}

output "api_endpoint" {
  value = aws_api_gateway_stage.gateway_stage.invoke_url
}

output "region" {
  value = var.region
}

output "temporary_password" {
  value     = random_password.temp.result
  sensitive = true
}


output "reasoning_models" {
  value = var.reasoning_models
}

output "reasoning_enabled" {
  value = alltrue([
    contains(var.reasoning_models, var.model_main.assets.id),
    contains(var.reasoning_models, var.model_main.flows.id),
    contains(var.reasoning_models, var.model_main.gaps.id),
    contains(var.reasoning_models, var.model_main.threats.id)
  ]) ? "true" : "false"
}

output "sentry_enabled" {
  description = "Whether Sentry feature is enabled"
  value       = var.enable_sentry
}

output "agent_runtime_arn_escaped" {
  description = "URL-encoded ARN of the Bedrock agent runtime"
  value       = var.enable_sentry ? urlencode(aws_bedrockagentcore_agent_runtime.sentry[0].agent_runtime_arn) : ""
}
