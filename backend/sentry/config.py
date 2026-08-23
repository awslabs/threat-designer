import os
import json
import threading
import time
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
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "64000"))

# Bedrock Mantle: GPT models served through the Bedrock OpenAI-compatible
# endpoint — same models/prompts as the "openai" provider, SigV4 bearer-token
# auth instead of an API key. GPT-5.x on Mantle is US-regions only
# (us-east-2 / us-west-2), independent of the deployment region.
MODEL_PROVIDER_BEDROCK_MANTLE = "bedrock-mantle"
OPENAI_FAMILY_PROVIDERS = ("openai", MODEL_PROVIDER_BEDROCK_MANTLE)
# Message-format family — streaming.py compares this against the format
# detected in a resumed session, so Mantle must read as "openai" there.
PROVIDER_MESSAGE_FAMILY = (
    "openai" if MODEL_PROVIDER in OPENAI_FAMILY_PROVIDERS else "bedrock"
)
MANTLE_REGION = os.environ.get("MANTLE_REGION", "us-east-2")
# Mantle GPT model IDs carry an "openai." prefix (e.g. "openai.gpt-5.6-terra").
MANTLE_MODEL_PREFIX = "openai."
# Re-mint the SigV4-presigned bearer token well inside the ~1h life of the
# runtime role credentials that sign it.
MANTLE_TOKEN_TTL_SECONDS = 1800

# Budget (reasoning) levels run 1-4 with no "off" level — every current model is
# a reasoning model, and on Claude Opus 5 thinking cannot be disabled above
# effort "high". A legacy 0 from an older client clamps up to the minimum.
MIN_BUDGET_LEVEL = 1
MAX_BUDGET_LEVEL = 4


def normalize_budget_level(value) -> int:
    """Coerce an incoming budget level onto the supported 1-4 ladder."""
    try:
        level = int(value)
    except (TypeError, ValueError):
        return MIN_BUDGET_LEVEL
    return min(max(level, MIN_BUDGET_LEVEL), MAX_BUDGET_LEVEL)

# Web search provider, chosen at deploy time. "tavily" gives search + extract;
# "agentcore" gives search ONLY (the Bedrock AgentCore connector has no fetch
# counterpart), so the extract tool is simply absent. "none" disables web search.
WEB_SEARCH_PROVIDER_NONE = "none"
WEB_SEARCH_PROVIDER_TAVILY = "tavily"
WEB_SEARCH_PROVIDER_AGENTCORE = "agentcore"
WEB_SEARCH_PROVIDER = os.environ.get(
    "WEB_SEARCH_PROVIDER", WEB_SEARCH_PROVIDER_NONE
).strip().lower()

# Tavily Configuration
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY")


# Parse reasoning budget/effort from environment
def _parse_reasoning_config() -> dict:
    """Parse reasoning budget (Bedrock) or effort (OpenAI/Mantle) from environment"""
    if MODEL_PROVIDER in OPENAI_FAMILY_PROVIDERS:
        raw = os.environ.get(
            "REASONING_EFFORT",
            '{"0": "none", "1": "low", "2": "medium", "3": "high", "4": "xhigh"}',
        )
        return {int(k): v for k, v in json.loads(raw).items()}
    else:
        raw = os.environ.get("REASONING_BUDGET", '{"1": 16000, "2": 32000, "3": 63999}')
        return {int(k): int(v) for k, v in json.loads(raw).items()}


REASONING_CONFIG = _parse_reasoning_config()

# Adaptive thinking configuration
ADAPTIVE_THINKING_MODELS = json.loads(os.environ.get("ADAPTIVE_THINKING_MODELS", "[]"))
# Level 4 tops out at "xhigh" — the recommended setting for demanding agentic
# work; "max" costs substantially more for marginal gains. A per-model
# EFFORT_MAP can still opt into "max".
ADAPTIVE_EFFORT_MAP = {1: "low", 2: "medium", 3: "high", 4: "xhigh"}


def _normalize_model_id(model_id: str) -> str:
    """Strip cross-region inference prefix (e.g. global./us./eu./apac.) from Anthropic model IDs."""
    idx = model_id.find("anthropic.")
    return model_id[idx:] if idx > 0 else model_id


def _is_adaptive_model(model_id: str | None) -> bool:
    """Check membership by comparing model IDs with any regional prefix stripped."""
    if not model_id:
        return False
    normalized = _normalize_model_id(model_id)
    return any(_normalize_model_id(m) == normalized for m in ADAPTIVE_THINKING_MODELS)


# Per-model effort map (overrides ADAPTIVE_EFFORT_MAP when set)
_raw_effort_map = os.environ.get("EFFORT_MAP")
EFFORT_MAP = json.loads(_raw_effort_map) if _raw_effort_map else None

# OpenAI reasoning effort mapping (fallback for backward compatibility).
# GPT-5.6 rejects "minimal"; level 4 tops out at "xhigh" (see above).
OPENAI_REASONING_EFFORT_MAP = {0: "none", 1: "low", 2: "medium", 3: "high", 4: "xhigh"}


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


# Budget Level Configuration (uses REASONING_CONFIG from environment)
BUDGET_MAPPING = (
    REASONING_CONFIG if MODEL_PROVIDER == "bedrock" else {1: 16000, 2: 32000, 3: 63999}
)


def create_model_config(budget_level: int = MIN_BUDGET_LEVEL) -> dict:
    """Create model configuration based on budget level and provider"""
    budget_level = normalize_budget_level(budget_level)
    if MODEL_PROVIDER in OPENAI_FAMILY_PROVIDERS:
        return _create_openai_model_config(budget_level)
    else:
        return _create_bedrock_model_config(budget_level)


def _create_bedrock_model_config(budget_level: int = 1) -> dict:
    """Create Bedrock model configuration based on budget level"""
    is_adaptive = _is_adaptive_model(MODEL_ID)

    # No temperature: Claude 4.6+ (incl. Sonnet 5 / Opus 5) removed the sampling
    # parameters and reject them, and pre-4.6 models default to 1.0 — the only
    # value they accept while thinking is enabled.
    base_config = {
        "max_tokens": MAX_TOKENS,
        "model_id": MODEL_ID,
        "client": boto_client,
    }

    # Check if the model supports adaptive thinking
    if is_adaptive:
        effort_map = EFFORT_MAP or ADAPTIVE_EFFORT_MAP
        effort = effort_map.get(str(budget_level)) or effort_map.get(
            budget_level, "low"
        )
        base_config["additional_model_request_fields"] = {
            "thinking": {"type": "adaptive", "display": "summarized"},
            "output_config": {"effort": effort},
        }
    else:
        # For standard models, level 4 falls back to level 3 budget
        budget_tokens = REASONING_CONFIG.get(
            budget_level, REASONING_CONFIG.get(3, 8000)
        )
        base_config["additional_model_request_fields"] = {
            "thinking": {
                "type": "enabled",
                "budget_tokens": budget_tokens,
            },
            "anthropic_beta": ["interleaved-thinking-2025-05-14"],
        }

    return base_config


# One token cache per region, shared across every model this process builds —
# create_model is re-run whenever the budget level changes, so a cache per
# closure would re-mint from scratch each time. Locked because tool calls and
# model invocations run on worker threads. Mirrors the same helper in the
# threat_designer container, which ships as a separate image.
_MANTLE_TOKEN_CACHES: dict = {}
_MANTLE_TOKEN_LOCK = threading.Lock()


def _mantle_token_provider(region: str):
    """A callable returning a fresh Bedrock Mantle bearer token, cached briefly.

    langchain_openai accepts ``api_key`` as a callable and invokes it per
    request, so long sessions keep re-reading a currently-valid token minted
    from whatever role credentials the default chain currently holds.
    """
    from aws_bedrock_token_generator import provide_token

    with _MANTLE_TOKEN_LOCK:
        cache = _MANTLE_TOKEN_CACHES.setdefault(region, {"token": None, "exp": 0.0})

    def _provider() -> str:
        with _MANTLE_TOKEN_LOCK:
            now = time.time()
            if cache["token"] is None or now >= cache["exp"]:
                cache["token"] = provide_token(region=region)
                cache["exp"] = now + MANTLE_TOKEN_TTL_SECONDS
            return cache["token"]

    return _provider


def _create_openai_model_config(budget_level: int = 1) -> dict:
    """Create GPT model configuration (direct OpenAI or Bedrock Mantle)"""
    if not OPENAI_AVAILABLE:
        raise ImportError(
            "OpenAI provider requires langchain-openai package. "
            "Install with: pip install langchain-openai"
        )

    use_mantle = MODEL_PROVIDER == MODEL_PROVIDER_BEDROCK_MANTLE

    # No temperature: the whole GPT-5 family rejects the parameter outright
    # ("Unsupported parameter: 'temperature' is not supported with this model",
    # HTTP 400), including calls made with no reasoning config.
    base_config = {
        "model": MODEL_ID or "gpt-5.6-terra",
        "max_tokens": MAX_TOKENS,
        "use_responses_api": True,
        "streaming": True,
    }

    if use_mantle:
        if not base_config["model"].startswith(MANTLE_MODEL_PREFIX):
            base_config["model"] = f"{MANTLE_MODEL_PREFIX}{base_config['model']}"
        base_config["base_url"] = (
            f"https://bedrock-mantle.{MANTLE_REGION}.api.aws/openai/v1"
        )
        # Bearer token minted from the runtime role's credentials — no API key.
        base_config["api_key"] = _mantle_token_provider(MANTLE_REGION)
    else:
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        base_config["api_key"] = OPENAI_API_KEY

    # Always configured: budget levels start at 1, so reasoning is never off.
    reasoning_effort = REASONING_CONFIG.get(budget_level, "low")
    if reasoning_effort:
        base_config["reasoning"] = {"effort": reasoning_effort, "summary": "detailed"}
        # output_version is what puts the reasoning summary into the streamed
        # message content ({"type": "reasoning", "summary": [...]}) — without it
        # the summary lands in additional_kwargs and the UI shows no thinking.
        # Both GPT transports stream through the same ChatOpenAI Responses API,
        # so gating this on Mantle hid reasoning on direct-OpenAI deploys.
        base_config["output_version"] = "responses/v1"

    return base_config


def create_model(budget_level: int = MIN_BUDGET_LEVEL) -> Any:
    """Create model instance based on provider.

    The branch must match create_model_config's: "bedrock-mantle" is served by
    ChatOpenAI (it is the Bedrock OpenAI-compatible endpoint), so testing for
    "openai" alone would hand a GPT config — including a callable api_key — to
    ChatBedrockConverse.
    """
    config = create_model_config(budget_level)

    if MODEL_PROVIDER in OPENAI_FAMILY_PROVIDERS:
        return ChatOpenAI(**config)
    else:
        from langchain_aws import ChatBedrockConverse

        return ChatBedrockConverse(**config)
