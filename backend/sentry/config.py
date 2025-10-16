import os
from langgraph_checkpoint_aws.async_saver import AsyncBedrockSessionSaver
from langgraph_checkpoint_aws.saver import BedrockSessionSaver
from botocore.session import get_session
from botocore.config import Config
import boto3
from typing import Optional

# Environment Configuration
MODEL_ID = os.environ.get("MODEL_ID")
S3_BUCKET = os.environ.get("S3_BUCKET")
REGION = os.environ.get("REGION", "us-east-1")


def create_bedrock_client(
    region: Optional[str] = REGION, config: Optional[Config] = None
) -> boto3.client:
    """
    Create Bedrock client
    """
    config = config or Config(read_timeout=1000)

    # Create session
    session = get_session()

    # Create client using the session
    return session.create_client(
        service_name="bedrock-runtime", region_name=REGION, config=config
    )


# AWS Client
boto_client = create_bedrock_client()


# Checkpointer
checkpointer = AsyncBedrockSessionSaver()
sync_checkpointer = BedrockSessionSaver()

# Available Tools
ALL_AVAILABLE_TOOLS = []


# Budget Level Configuration
BUDGET_MAPPING = {1: 8000, 2: 24000, 3: 63999}


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
