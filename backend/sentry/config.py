import os
from langgraph_checkpoint_aws.saver import BedrockSessionSaver
from utils import create_bedrock_client
from tools import add_threats, edit_threats, delete_threats

# Environment Configuration
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
S3_BUCKET = os.environ.get(
    "S3_BUCKET", "threat-designer-architecture-541020177866-apx0st"
)

# AWS Client
boto_client = create_bedrock_client()

# Checkpointer
checkpointer = BedrockSessionSaver()

# Available Tools
ALL_AVAILABLE_TOOLS = [add_threats, edit_threats, delete_threats]
TOOL_NAME_MAP = {tool.name: tool for tool in ALL_AVAILABLE_TOOLS}

# Budget Level Configuration
BUDGET_MAPPING = {1: 8000, 2: 16000, 3: 31999}


def create_model_config(budget_level: int = 1):
    """Create model configuration based on budget level"""
    base_config = {
        "max_tokens": 64000,
        "model_id": MODEL_ID,
        "client": boto_client,
        "temperature": 0 if budget_level == 0 else 1,
    }

    # If budget_level is 0, don't add thinking at all
    if budget_level == 0:
        return base_config

    # For other levels, add thinking configuration
    budget_tokens = BUDGET_MAPPING.get(budget_level, 8000)

    base_config["additional_model_request_fields"] = {
        "thinking": {
            "type": "enabled",
            "budget_tokens": budget_tokens,
        },
        "anthropic_beta": ["interleaved-thinking-2025-05-14"],
    }

    return base_config
