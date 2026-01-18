import os
from langgraph_checkpoint_aws.async_saver import AsyncBedrockSessionSaver
from langgraph_checkpoint_aws.saver import BedrockSessionSaver
from botocore.session import get_session
from botocore.config import Config
import boto3
from typing import Optional, Any

# Try to import OpenAI support
try:
    from langchain_openai import ChatOpenAI

    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    ChatOpenAI = None

# Environment Configuration
MODEL_ID = os.environ.get("MODEL_ID")
S3_BUCKET = os.environ.get("S3_BUCKET")
REGION = os.environ.get("REGION", "us-east-1")
MODEL_PROVIDER = os.environ.get("MODEL_PROVIDER", "bedrock")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Tavily Configuration
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY")

# OpenAI reasoning effort mapping (same as Threat Designer)
OPENAI_REASONING_EFFORT_MAP = {0: "none", 1: "low", 2: "medium", 3: "high"}


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
BUDGET_MAPPING = {1: 16000, 2: 32000, 3: 63999}


def create_model_config(budget_level: int = 1) -> dict:
    """Create model configuration based on budget level and provider"""
    if MODEL_PROVIDER == "openai":
        return _create_openai_model_config(budget_level)
    else:
        return _create_bedrock_model_config(budget_level)


def _create_bedrock_model_config(budget_level: int = 1) -> dict:
    """Create Bedrock model configuration based on budget level"""
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


def _create_openai_model_config(budget_level: int = 1) -> dict:
    """Create OpenAI model configuration based on budget level"""
    if not OPENAI_AVAILABLE:
        raise ImportError(
            "OpenAI provider requires langchain-openai package. "
            "Install with: pip install langchain-openai"
        )

    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY environment variable not set")

    base_config = {
        "model": MODEL_ID or "gpt-5-mini-2025-08-07",
        "max_tokens": 128000,
        "api_key": OPENAI_API_KEY,
        "temperature": 0,
        "use_responses_api": True,
        "streaming": True,
    }

    # Add reasoning effort if budget level > 0
    if budget_level > 0:
        reasoning_effort = OPENAI_REASONING_EFFORT_MAP.get(budget_level, "low")
        base_config["reasoning"] = {"effort": reasoning_effort, "summary": "detailed"}

    return base_config


def create_model(budget_level: int = 1) -> Any:
    """Create model instance based on provider"""
    config = create_model_config(budget_level)

    if MODEL_PROVIDER == "openai":
        return ChatOpenAI(**config)
    else:
        from langchain_aws import ChatBedrockConverse

        return ChatBedrockConverse(**config)
