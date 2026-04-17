"""Provider-aware chat-model builder shared by the pipeline and attack-tree runners.

Builds a ChatBedrockConverse or ChatOpenAI depending on the CLI config. Returns
both the model and a small descriptor so callers can adjust provider-specific
behavior (e.g. prompt caching middleware, per-task model_settings).
"""

import os
from dataclasses import dataclass
from typing import Any, Optional

import boto3
from botocore.config import Config as BotoConfig
from langchain_aws import ChatBedrockConverse


# OpenAI Responses API accepts minimal/low/medium/high. "xhigh"/"max" clamp to "high".
_OPENAI_EFFORT_MAP = {
    "off": None,
    "low": "minimal",
    "medium": "medium",
    "high": "high",
    "xhigh": "high",
    "max": "high",
}


@dataclass
class BuiltModel:
    """Container for a built chat model and its provider metadata."""

    model: Any
    provider: str  # "bedrock" or "openai"

    @property
    def is_bedrock(self) -> bool:
        return self.provider == "bedrock"

    @property
    def is_openai(self) -> bool:
        return self.provider == "openai"

    def adaptive_model_settings(self, effort: str) -> dict | None:
        """Return per-task model_settings dict, or None if the provider doesn't use adaptive thinking."""
        if self.is_bedrock and effort and effort != "off":
            return {
                "additional_model_request_fields": {
                    "thinking": {"type": "adaptive"},
                    "output_config": {"effort": effort},
                }
            }
        return None


def build_chat_model(
    *,
    provider: str,
    model_id: str,
    reasoning_effort: str = "medium",
    aws_region: str = "us-west-2",
    aws_profile: Optional[str] = None,
    openai_api_key: Optional[str] = None,
    max_tokens: int = 128000,
) -> BuiltModel:
    """Build a chat model for the configured provider.

    Args:
        provider: "bedrock" or "openai".
        model_id: Model identifier understood by the provider.
        reasoning_effort: "off" | "low" | "medium" | "high" | "xhigh" | "max".
        aws_region: AWS region (Bedrock only).
        aws_profile: Optional AWS profile (Bedrock only).
        openai_api_key: Optional explicit OpenAI key; falls back to env (OpenAI only).
        max_tokens: Model max output tokens.
    """
    if provider == "bedrock":
        session = (
            boto3.Session(profile_name=aws_profile) if aws_profile else boto3.Session()
        )
        bedrock_client = session.client(
            service_name="bedrock-runtime",
            region_name=aws_region,
            config=BotoConfig(read_timeout=900),
        )

        kwargs: dict[str, Any] = {
            "model": model_id,
            "region_name": aws_region,
            "client": bedrock_client,
            "max_tokens": max_tokens,
        }
        if reasoning_effort and reasoning_effort != "off":
            kwargs["additional_model_request_fields"] = {
                "thinking": {"type": "adaptive"},
                "output_config": {"effort": reasoning_effort},
            }

        return BuiltModel(model=ChatBedrockConverse(**kwargs), provider="bedrock")

    if provider == "openai":
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as exc:
            raise RuntimeError(
                "OpenAI provider requires langchain-openai. "
                "Install with: pip install langchain-openai"
            ) from exc

        api_key = openai_api_key or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "OpenAI API key missing. Set it via /configure or the "
                "OPENAI_API_KEY environment variable."
            )

        kwargs = {
            "model": model_id,
            "max_tokens": max_tokens,
            "api_key": api_key,
            "use_responses_api": True,
        }

        openai_effort = _OPENAI_EFFORT_MAP.get(reasoning_effort)
        if openai_effort is not None:
            kwargs["reasoning"] = {"effort": openai_effort, "summary": "detailed"}

        return BuiltModel(model=ChatOpenAI(**kwargs), provider="openai")

    raise ValueError(f"Unsupported provider: {provider}")
