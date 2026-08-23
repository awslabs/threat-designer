# AgentCore web search for Sentry (var.web_search_provider == "agentcore").
#
# Web Search on Bedrock AgentCore is only reachable as a built-in CONNECTOR
# TARGET on an AgentCore Gateway, which speaks MCP — there is no direct
# data-plane search API. So this file provisions:
#
#   1. a gateway service role (what the gateway itself uses to reach the
#      connector: bedrock-agentcore:InvokeWebSearch on the service-owned ARN);
#   2. an MCP gateway with AWS_IAM inbound auth, so the Sentry runtime
#      authenticates with SigV4 from its own execution role — no JWT, no client
#      secret to vend;
#   3. the web-search connector target.
#
# Two non-obvious constraints are baked in here:
#
# * REGION — the connector is offered in us-east-1, eu-west-1 and
#   ap-northeast-1 only, so every resource here uses the aws.web_search
#   provider alias (var.web_search_region) rather than var.region. A query still
#   never leaves AWS (the gateway serves it internally) but it can leave the
#   deployment's region; that trade-off is why the provider is opt-in.
#
# * The target is an aws_cloudcontrolapi_resource, NOT
#   aws_bedrockagentcore_gateway_target. In hashicorp/aws 6.52 that resource's
#   target_configuration.mcp block supports lambda / api_gateway / mcp_server /
#   open_api_schema / smithy_model — but NOT `connector`, which is the shape web
#   search needs (verified against `terraform providers schema`).
#   AWS::BedrockAgentCore::GatewayTarget in the CloudFormation registry does
#   support Connector, so Cloud Control gives the same declarative
#   create/update/destroy through the same provider. Swap this for the native
#   resource once it grows a `connector` block.
#
# Deliberately NOT pinned to connector 1.2.0: the request-level date/domain
# filters that version adds cannot be pinned declaratively (the registry's
# ConnectorSource carries only ConnectorId) and a pre-1.2.0 target silently
# IGNORES an unknown `filters` argument instead of rejecting it. The runtime
# therefore stays on the base query + maxResults surface — see
# backend/sentry/web_search_tools.py.

locals {
  web_search_agentcore = var.web_search_provider == "agentcore" && var.enable_sentry

  # The gateway-side tool name is `<target_name>___<tool>` (three underscores) —
  # AgentCore prefixes every tool with its target's name to keep names unique
  # across targets. The runtime can discover this via tools/list, but passing it
  # explicitly saves a round trip on the first search of each process.
  web_search_target_name = "${local.prefix}-web-search"
  web_search_tool_name   = "${local.prefix}-web-search___WebSearch"
}

# --- the gateway's own service role -------------------------------------------

data "aws_iam_policy_document" "web_search_gateway_assume" {
  count = local.web_search_agentcore ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["bedrock-agentcore.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "web_search_gateway" {
  count = local.web_search_agentcore ? 1 : 0

  # The gateway invokes itself on the caller's behalf...
  statement {
    sid       = "InvokeGateway"
    actions   = ["bedrock-agentcore:InvokeGateway"]
    resources = ["arn:aws:bedrock-agentcore:${var.web_search_region}:${data.aws_caller_identity.caller_identity.account_id}:gateway/*"]
  }

  # ...and this authorizes the search itself. The resource is a SERVICE-OWNED
  # ARN (the account field is literally "aws"), checked per request.
  statement {
    sid       = "InvokeWebSearch"
    actions   = ["bedrock-agentcore:InvokeWebSearch"]
    resources = ["arn:aws:bedrock-agentcore:${var.web_search_region}:aws:tool/web-search.v1"]
  }
}

resource "aws_iam_role" "web_search_gateway" {
  count = local.web_search_agentcore ? 1 : 0

  name               = "${local.prefix}-web-search-gateway"
  assume_role_policy = data.aws_iam_policy_document.web_search_gateway_assume[0].json
}

resource "aws_iam_role_policy" "web_search_gateway" {
  count = local.web_search_agentcore ? 1 : 0

  name   = "${local.prefix}-web-search-gateway-policy"
  role   = aws_iam_role.web_search_gateway[0].id
  policy = data.aws_iam_policy_document.web_search_gateway[0].json
}

# --- the gateway --------------------------------------------------------------

# AWS_IAM inbound auth: the only caller is the Sentry runtime, which signs with
# SigV4 from its execution role (see the WebSearchGateway statement in
# sentry.tf). CUSTOM_JWT would mean vending and rotating a Cognito M2M client
# for a purely server-to-server hop — IAM is both simpler and tighter.
resource "aws_bedrockagentcore_gateway" "web_search" {
  count    = local.web_search_agentcore ? 1 : 0
  provider = aws.web_search

  name            = "${local.prefix}-web-search"
  description     = "Web search connector for the Sentry assistant"
  role_arn        = aws_iam_role.web_search_gateway[0].arn
  protocol_type   = "MCP"
  authorizer_type = "AWS_IAM"

  # Same IAM-propagation race as the runtimes: CreateGateway validates the
  # service role, which can be a stale snapshot seconds after PutRolePolicy.
  depends_on = [aws_iam_role_policy.web_search_gateway]
}

# --- the web-search connector target ------------------------------------------

resource "aws_cloudcontrolapi_resource" "web_search_target" {
  count    = local.web_search_agentcore ? 1 : 0
  provider = aws.web_search

  type_name = "AWS::BedrockAgentCore::GatewayTarget"

  desired_state = jsonencode({
    Name              = local.web_search_target_name
    GatewayIdentifier = aws_bedrockagentcore_gateway.web_search[0].gateway_id
    Description       = "Amazon-operated web index, MCP tool WebSearch"
    TargetConfiguration = {
      Mcp = {
        Connector = {
          Source         = { ConnectorId = "web-search" }
          Configurations = [{ Name = "WebSearch", ParameterValues = {} }]
        }
      }
    }
    # Connector targets need no iamCredentialProvider — the connector's service
    # name is already known to the gateway, so the role alone is the config.
    CredentialProviderConfigurations = [
      { CredentialProviderType = "GATEWAY_IAM_ROLE" }
    ]
  })
}
