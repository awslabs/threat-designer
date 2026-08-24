"""Prompt provider that routes to the correct prompt module based on model provider."""

import os

from constants import MODEL_PROVIDER_BEDROCK, OPENAI_FAMILY_PROVIDERS

# Resolve provider once at import time
try:
    from config import config

    _provider = config.model_provider
except ImportError:
    _provider = os.environ.get("MODEL_PROVIDER", MODEL_PROVIDER_BEDROCK)

# GPT prompts apply to every provider that serves GPT models — direct OpenAI
# and Bedrock Mantle alike; only the transport differs.
if _provider in OPENAI_FAMILY_PROVIDERS:
    from prompts_gpt import (  # noqa: F401
        APPLICATION_TYPE_DESCRIPTIONS,
        asset_prompt,
        create_version_agent_system_prompt,
        create_flows_agent_system_prompt,
        create_space_context_system_prompt,
        create_threats_agent_system_prompt,
        version_diff_prompt,
        gap_prompt,
        maestro_layer_detection_prompt,
        structure_prompt,
        summary_prompt,
        threats_improve_prompt,
        threats_prompt,
    )
else:
    from prompts import (  # noqa: F401
        APPLICATION_TYPE_DESCRIPTIONS,
        asset_prompt,
        create_version_agent_system_prompt,
        create_flows_agent_system_prompt,
        create_space_context_system_prompt,
        create_threats_agent_system_prompt,
        version_diff_prompt,
        gap_prompt,
        maestro_layer_detection_prompt,
        structure_prompt,
        summary_prompt,
        threats_improve_prompt,
        threats_prompt,
    )
