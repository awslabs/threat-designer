"""
Threat Designer Model Module.

This module provides model initialization and configuration functions for the Threat Designer application.
It handles the creation of LangChain-compatible Bedrock model clients with various configurations.
"""

import json
import os
from dataclasses import dataclass
from typing import Dict, Optional, TypedDict

import boto3
from botocore.config import Config
from constants import (
    AWS_SERVICE_BEDROCK_RUNTIME,
    DEFAULT_REGION,
    DEFAULT_TIMEOUT,
    ENV_MAIN_MODEL,
    ENV_MODEL_STRUCT,
    ENV_MODEL_SUMMARY,
    ENV_REASONING_MODELS,
    ENV_REGION,
    MODEL_TEMPERATURE_DEFAULT,
    MODEL_TEMPERATURE_REASONING,
    REASONING_BUDGET_FIELD,
    REASONING_THINKING_TYPE,
    STOP_SEQUENCES,
)
from langchain_aws.chat_models.bedrock import ChatBedrockConverse
from monitoring import logger, operation_context, with_error_context


class ThreatModelingError(Exception):
    """Custom exception for threat modeling operations."""

    pass


class ModelConfig(TypedDict):
    """Type definition for model configuration."""

    id: str
    max_tokens: int
    reasoning_budget: dict


@dataclass
class ModelConfigurations:
    """Container for all model configurations."""

    assets_model: ModelConfig
    flows_model: ModelConfig
    threats_model: ModelConfig
    gaps_model: ModelConfig
    struct_model: ModelConfig
    summary_model: ModelConfig
    reasoning_models: list[str]


@with_error_context("load model configurations")
def _load_model_configs() -> ModelConfigurations:
    """
    Load and validate model configurations from environment variables.

    Returns:
        ModelConfigurations: Validated model configurations.

    Raises:
        ThreatModelingError: If configuration loading fails.
    """
    try:
        logger.debug("Loading model configurations from environment")

        model_main = json.loads(os.environ.get(ENV_MAIN_MODEL, "{}"))
        assets_model = model_main.get("assets")
        flows_model = model_main.get("flows")
        threats_model = model_main.get("threats")
        gaps_model = model_main.get("gaps")
        struct_model = json.loads(os.environ.get(ENV_MODEL_STRUCT, "{}"))
        summary_model = json.loads(os.environ.get(ENV_MODEL_SUMMARY, "{}"))
        reasoning_models = json.loads(os.environ.get(ENV_REASONING_MODELS, "[]"))

        logger.info(
            "Model configurations loaded successfully",
            assets_model_id=assets_model.get("id"),
            flows_model_id=flows_model.get("id"),
            threats_model_id=threats_model.get("id"),
            gaps_model_id=gaps_model.get("id"),
            struct_model_id=struct_model.get("id"),
            summary_model_id=summary_model.get("id"),
            reasoning_models_count=len(reasoning_models),
        )

        return ModelConfigurations(
            assets_model=assets_model,
            flows_model=flows_model,
            threats_model=threats_model,
            gaps_model=gaps_model,
            struct_model=struct_model,
            summary_model=summary_model,
            reasoning_models=reasoning_models,
        )

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in environment variables", error=str(e))
        raise
    except Exception as e:
        logger.error("Error loading model configurations", error=str(e))
        raise


@with_error_context("create Bedrock client")
def _create_bedrock_client(
    region: Optional[str] = None, config: Optional[Config] = None
) -> boto3.client:
    """
    Create Bedrock runtime client with configuration.

    Args:
        region: AWS region name. Defaults to environment variable or us-west-2.
        config: Boto3 configuration. Defaults to Config with 1000s read timeout.

    Returns:
        boto3.client: Configured Bedrock runtime client.

    Raises:
        ThreatModelingError: If client creation fails.
    """
    region = region or os.environ.get(ENV_REGION, DEFAULT_REGION)
    config = config or Config(read_timeout=DEFAULT_TIMEOUT)

    logger.debug("Creating Bedrock client", region=region, timeout=DEFAULT_TIMEOUT)

    try:
        client = boto3.client(
            service_name=AWS_SERVICE_BEDROCK_RUNTIME, region_name=region, config=config
        )

        logger.info("Bedrock client created successfully", region=region)
        return client

    except Exception as e:
        logger.error("Failed to create Bedrock client", region=region, error=str(e))
        raise


def _build_standard_model_config(
    model_config: ModelConfig, client: boto3.client, region: str
) -> dict:
    """
    Build standard model configuration dictionary.

    Args:
        model_config: Model configuration with id and max_tokens.
        client: Bedrock runtime client.
        region: AWS region name.

    Returns:
        dict: Standard model configuration.
    """
    config = {
        "client": client,
        "region_name": region,
        "max_tokens": model_config["max_tokens"],
        "model_id": model_config["id"],
        "temperature": MODEL_TEMPERATURE_DEFAULT,
        "stop": STOP_SEQUENCES,
    }

    logger.debug(
        "Standard model config built",
        model_id=model_config["id"],
        max_tokens=model_config["max_tokens"],
    )

    return config


def _build_main_model_config(
    model_config: ModelConfig,
    reasoning_models: list,
    reasoning: int,
    client: boto3.client,
    region: str,
) -> dict:
    """
    Build configuration dictionary for main model with optional reasoning.

    Args:
        model_config: Model configuration with id and max_tokens.
        reasoning_models: List of model IDs that support reasoning.
        reasoning: Reasoning level (0 disables reasoning).
        client: Bedrock runtime client.
        region: AWS region name.

    Returns:
        dict: Main model configuration with reasoning if applicable.
    """
    config = _build_standard_model_config(model_config, client, region)

    # Add reasoning configuration if enabled and supported
    reasoning_enabled = reasoning != 0 and model_config["id"] in reasoning_models

    if reasoning_enabled:
        config["additional_model_request_fields"] = {
            "thinking": {
                "type": REASONING_THINKING_TYPE,
                REASONING_BUDGET_FIELD: reasoning,
            }
        }
        config["temperature"] = MODEL_TEMPERATURE_REASONING

        logger.info(
            "Reasoning enabled for main model",
            model_id=model_config["id"],
            token_budget=reasoning,
        )
    else:
        if reasoning != 0:
            logger.warning(
                "Reasoning requested but not supported by model",
                model_id=model_config["id"],
                reasoning_level=reasoning,
                supported_models=reasoning_models,
            )

    return config


def initialize_models(
    reasoning: int = 0,
    bedrock_client: Optional[boto3.client] = None,
    job_id: Optional[str] = None,
) -> Dict[str, ChatBedrockConverse]:
    """
    Initialize Bedrock model clients with proper error handling.

    This function creates multiple Bedrock model clients with different configurations:

    Args:
        reasoning: Reasoning level (0-3). 0 disables reasoning, 1-3 enables with different token budgets.
        bedrock_client: Optional pre-configured Bedrock client for testing.
        job_id: Optional job ID for operation tracking.

    Returns:
        Dict[str, ChatBedrockConverse]: Dictionary containing:
            - 'assets_model':  ChatBedrockConverse instance
            - 'flows_model':   ChatBedrockConverse instance
            - 'threats_model': ChatBedrockConverse instance
            - 'gaps_model':    ChatBedrockConverse instance
            - 'struct_model':  ChatBedrockConverse instance for structured outputs
            - 'summary_model': ChatBedrockConverse instance for summarization

    Raises:
        ThreatModelingError: If model initialization fails.
    """
    job_id = job_id or "model-init"

    with operation_context("initialize_models", job_id):
        try:
            logger.info(
                "Starting model initialization",
                reasoning_level=reasoning,
                using_provided_client=bedrock_client is not None,
            )

            # Load and validate configurations
            configs = _load_model_configs()

            # Create or use provided Bedrock client
            client = bedrock_client or _create_bedrock_client()
            region = os.environ.get(ENV_REGION, DEFAULT_REGION)

            # Build model configurations
            logger.debug("Building model configurations")

            assets_config = _build_main_model_config(
                configs.assets_model,
                configs.reasoning_models,
                configs.assets_model.get("reasoning_budget").get(str(reasoning), 0),
                client,
                region,
            )

            flows_config = _build_main_model_config(
                configs.flows_model,
                configs.reasoning_models,
                configs.flows_model.get("reasoning_budget").get(str(reasoning), 0),
                client,
                region,
            )

            threats_config = _build_main_model_config(
                configs.threats_model,
                configs.reasoning_models,
                configs.threats_model.get("reasoning_budget").get(str(reasoning), 0),
                client,
                region,
            )

            gaps_config = _build_main_model_config(
                configs.gaps_model,
                configs.reasoning_models,
                configs.gaps_model.get("reasoning_budget").get(str(reasoning), 0),
                client,
                region,
            )

            struct_config = _build_standard_model_config(
                configs.struct_model, client, region
            )
            summary_config = _build_standard_model_config(
                configs.summary_model, client, region
            )

            # Initialize models
            logger.debug("Initializing ChatBedrockConverse instances")

            models = {
                "assets_model": ChatBedrockConverse(**assets_config),
                "flows_model": ChatBedrockConverse(**flows_config),
                "threats_model": ChatBedrockConverse(**threats_config),
                "gaps_model": ChatBedrockConverse(**gaps_config),
                "struct_model": ChatBedrockConverse(**struct_config),
                "summary_model": ChatBedrockConverse(**summary_config),
            }

            logger.info(
                "Models initialized successfully",
                model_count=len(models),
                assets_model_id=configs.assets_model["id"],
                flows_model_id=configs.flows_model["id"],
                threats_model_id=configs.threats_model["id"],
                gaps_model_id=configs.gaps_model["id"],
                struct_model_id=configs.struct_model["id"],
                summary_model_id=configs.summary_model["id"],
            )

            return models

        except Exception as e:
            logger.error(
                "Model initialization failed",
                reasoning_level=reasoning,
                error=str(e),
                job_id=job_id,
            )
            raise
