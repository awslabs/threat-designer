"""Prompt provider that routes to the correct prompt module based on model provider."""

import os

from constants import MODEL_PROVIDER_BEDROCK, MODEL_PROVIDER_OPENAI

# Resolve provider once at import time
try:
    from config import config

    _provider = config.model_provider
except ImportError:
    _provider = os.environ.get("MODEL_PROVIDER", MODEL_PROVIDER_BEDROCK)

if _provider == MODEL_PROVIDER_OPENAI:
    from prompts_gpt import (  # noqa: F401
        asset_prompt,
        create_agent_system_prompt,
        flow_prompt,
        gap_prompt,
        structure_prompt,
        summary_prompt,
        threats_improve_prompt,
        threats_prompt,
    )
else:
    from prompts import (  # noqa: F401
        asset_prompt,
        create_agent_system_prompt,
        flow_prompt,
        gap_prompt,
        structure_prompt,
        summary_prompt,
        threats_improve_prompt,
        threats_prompt,
    )
