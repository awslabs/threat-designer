# Threat Designer MCP Server

A **Model Context Protocol (MCP) server** that connects AI assistants to **Threat Designer**, an AI-driven agent that automates and streamlines the threat modeling process for secure system design. This MCP server enables Amazon Q Developer, Claude and other compatible AI systems to leverage Threat Designer's advanced threat analysis capabilities through natural language interactions.



## What is MCP?

The Model Context Protocol allows AI assistants to securely connect to external data sources and tools. This MCP server acts as a bridge between AI systems and Threat Designer's automated threat modeling service, enabling conversational security analysis through a standardized interface.

## Features

- **Automated Architecture Analysis**: Submit system diagrams and receive AI-generated threat assessments
- **Intelligent Threat Identification**: Leverage advanced LLMs to discover potential security vulnerabilities
- **Catalog Management**: Browse and retrieve existing threat models from a centralized catalog
- **Real-time Processing**: Monitor AI agent progress with status updates during analysis
- **Flexible Analysis Depth**: Configure reasoning levels and iteration counts for tailored threat modeling
- **Component-Specific Queries**: Filter results by threats, assets, trust boundaries, or threat sources
- **Multi-format Support**: Accept PNG/JPEG architecture diagrams (up to 8,000px × 8,000px, 3.75MB max)

## Available MCP Tools

- `list_all_threat_models()` - Retrieve all threat models from the catalog
- `get_threat_model(model_id, filter?)` - Get detailed threat model data with optional filtering
- `create_threat_model(payload)` - Submit architecture diagrams to Threat Designer's AI agent
- `poll_threat_model_status(model_id)` - Monitor AI analysis progress until completion
- `check_threat_model_status(model_id)` - Fetch the current status of the processing

## Requirements

- [Threat designer](../README.md) implemented.
- uv from [Astral](https://docs.astral.sh/uv/getting-started/installation/).
- MCP-compatible client (Amazon Q Developer, Claude Desktop, etc.)
- `API_KEY` environment variable for Threat Designer API authentication. Follow the [AWS Guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-create-usage-plans.html) to create a usage plan and api key for threat designer AWS API Gateway REST API.
- `API_ENDPOINT` environment variable for the Threat Designer service URL
- Architecture diagram files in PNG or JPEG format.

## Use Cases

Perfect for security professionals who want to:
- Engage in AI-powered threat modeling conversations with Claude
- Automate security analysis from the earliest development stages
- Leverage dual-AI intelligence (Claude + Threat Designer) for comprehensive security insights
- Integrate automated threat modeling into existing workflows and CI/CD pipelines
- Enable non-security experts to perform sophisticated threat analysis through natural language

## Example configuration for Amazon Q CLI MCP (~/.aws/amazonq/mcp.json):

```json
{
  "mcpServers": {
    "threat-designer": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/awslabs/threat-designer.git#subdirectory=mcp-server",
        "threat-designer-mcp-server"
      ],
      "env": {
        "API_KEY": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "API_ENDPOINT": "https://xxxxxxxxxxxx.execute-api.REGION.amazonaws.com/dev"
      }
    }
  }
}
  ```