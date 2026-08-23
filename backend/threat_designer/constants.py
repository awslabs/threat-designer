"""
Centralized constants for the Threat Designer module.

This module contains all constants used throughout the threat modeling system,
organized by logical categories for better maintainability and consistency.
"""

import hashlib
from enum import Enum
from typing import Dict, List

# ============================================================================
# ENVIRONMENT VARIABLE NAMES
# ============================================================================

# Environment variable names used throughout the application
ENV_AGENT_STATE_TABLE = "AGENT_STATE_TABLE"
ENV_MODEL = "MODEL"
ENV_AWS_REGION = "AWS_REGION"
ENV_REGION = "REGION"
ENV_ARCHITECTURE_BUCKET = "ARCHITECTURE_BUCKET"
ENV_JOB_STATUS_TABLE = "JOB_STATUS_TABLE"
ENV_AGENT_TRAIL_TABLE = "AGENT_TRAIL_TABLE"
ENV_ATTACK_TREE_TABLE = "ATTACK_TREE_TABLE"
ENV_LOG_LEVEL = "LOG_LEVEL"
ENV_TRACEBACK_ENABLED = "TRACEBACK_ENABLED"
ENV_MAESTRO_ENABLED = "MAESTRO_ENABLED"


# Model configuration environment variables
ENV_MAIN_MODEL = "MAIN_MODEL"
ENV_MODEL_STRUCT = "MODEL_STRUCT"
ENV_MODEL_SUMMARY = "MODEL_SUMMARY"
ENV_ADAPTIVE_THINKING_MODELS = "ADAPTIVE_THINKING_MODELS"

# Model provider configuration
ENV_MODEL_PROVIDER = "MODEL_PROVIDER"
MODEL_PROVIDER_BEDROCK = "bedrock"
MODEL_PROVIDER_OPENAI = "openai"
# GPT models served through the Bedrock Mantle OpenAI-compatible endpoint —
# same models and prompts as the "openai" provider, but SigV4 bearer-token
# auth instead of an OpenAI API key.
MODEL_PROVIDER_BEDROCK_MANTLE = "bedrock-mantle"
# Providers that serve OpenAI GPT models (shared prompts, message format, and
# reasoning-effort semantics); they differ only in transport/auth.
OPENAI_FAMILY_PROVIDERS = (MODEL_PROVIDER_OPENAI, MODEL_PROVIDER_BEDROCK_MANTLE)
ENV_OPENAI_API_KEY = "OPENAI_API_KEY"

# Bedrock Mantle configuration. GPT-5.x on Mantle is served only from US
# regions (us-east-2 / us-west-2), independent of the deployment region.
ENV_MANTLE_REGION = "MANTLE_REGION"
DEFAULT_MANTLE_REGION = "us-east-2"
# Mantle GPT model IDs carry an "openai." prefix (e.g. "openai.gpt-5.6-sol").
MANTLE_MODEL_PREFIX = "openai."


# ============================================================================
# DEFAULT VALUES
# ============================================================================

# AWS configuration defaults
DEFAULT_REGION = "us-west-2"
DEFAULT_TIMEOUT = 1000

# Model configuration defaults
DEFAULT_MAX_RETRY = 10
DEFAULT_MAX_EXECUTION_TIME_MINUTES = 12
DEFAULT_SUMMARY_MAX_WORDS = 40

# Validation defaults
DEFAULT_MIN_RETRY = 1
DEFAULT_MAX_RETRY_LIMIT = 50
DEFAULT_MIN_EXECUTION_TIME = 1
DEFAULT_MAX_EXECUTION_TIME = 60
DEFAULT_MIN_SUMMARY_WORDS = 10
DEFAULT_MAX_SUMMARY_WORDS = 100


# ============================================================================
# MODEL CONFIGURATION
# ============================================================================

# Stop sequences for model generation
STOP_SEQUENCES: List[str] = ["Human:", "User:", "Assistant:"]

# No temperature settings: Claude 4.6+ and the whole GPT-5 family reject the
# parameter, and pre-4.6 models with thinking enabled require the default of 1.
# See _build_adaptive_model_config / _create_openai_model in model_utils.py.


# ============================================================================
# PROMPT CONFIGURATION
# ============================================================================

# Mitigation constraints
MITIGATION_MIN_ITEMS = 2
MITIGATION_MAX_ITEMS = 5

# Summary configuration
SUMMARY_MAX_WORDS_DEFAULT = 40

# Tool usage limits
# These limits work together to enforce iterative threat catalog refinement:
#
# MAX_ADD_THREATS_USES: Maximum number of times add_threats can be called before
# requiring gap_analysis validation. When this limit is reached, the agent must
# call gap_analysis to verify the threat catalog's completeness before continuing.
# This counter is RESET to 0 each time gap_analysis is successfully invoked,
# allowing the agent to add more threats after validation.
#
# MAX_GAP_ANALYSIS_USES: Maximum number of times gap_analysis can be called during
# a threat modeling session. This limit prevents excessive gap analysis cycles and
# ensures the agent makes progress toward completion. Unlike add_threats, this
# counter is NOT reset and accumulates throughout the entire session.
#
# Relationship: These limits create a validation cycle where the agent must
# periodically validate the threat catalog (via gap_analysis) before continuing
# to add threats. The theoretical maximum threats that can be added is:
# MAX_ADD_THREATS_USES * (MAX_GAP_ANALYSIS_USES + 1)
# Example: 10 * (3 + 1) = 40 total add_threats calls possible
#
# When both limits are exhausted, the agent can only delete threats or finish.
MAX_ADD_THREATS_USES = 5
MAX_GAP_ANALYSIS_USES = 5

# Minimum threats required before gap analysis can run
MIN_GAP_THRESHOLD = 25


# ============================================================================
# JOB STATES (ENUM)
# ============================================================================


class JobState(Enum):
    """Enumeration of possible job states in the threat modeling workflow."""

    SPACE_CONTEXT = "SPACE_CONTEXT"
    ASSETS = "ASSETS"
    FLOW = "FLOW"
    THREAT = "THREAT"
    THREAT_RETRY = "THREAT_RETRY"
    ATTACK_TREE = "ATTACK_TREE"
    VERSION_DIFF = "VERSION_DIFF"
    VERSION_ASSETS = "VERSION_ASSETS"
    VERSION_FLOWS = "VERSION_FLOWS"
    VERSION_BOUNDARIES = "VERSION_BOUNDARIES"
    VERSION_THREATS = "VERSION_THREATS"
    FINALIZE = "FINALIZE"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


# ============================================================================
# STRIDE CATEGORIES (ENUM)
# ============================================================================


class StrideCategory(Enum):
    """STRIDE threat modeling categories for type-safe threat classification."""

    SPOOFING = "Spoofing"
    TAMPERING = "Tampering"
    REPUDIATION = "Repudiation"
    INFORMATION_DISCLOSURE = "Information Disclosure"
    DENIAL_OF_SERVICE = "Denial of Service"
    ELEVATION_OF_PRIVILEGE = "Elevation of Privilege"


# ============================================================================
# MAESTRO LAYERS (ENUM)
# ============================================================================


class Methodology(Enum):
    """Threat modeling methodology applied to a threat model."""

    STRIDE = "stride"
    MAESTRO = "maestro"


DEFAULT_METHODOLOGY = Methodology.STRIDE.value


class MaestroLayer(Enum):
    """CSA MAESTRO layers for agentic AI threat classification.

    Layers 1-5 and 7 are horizontal: each maps to a distinct part of the agentic
    stack. Layer 6 is defined by the framework as a *vertical* layer that cuts
    across all the others, so it is always applicable regardless of architecture.
    CROSS_LAYER is not a MAESTRO layer; it carries the framework's cross-layer
    threat class (supply chain, lateral movement, goal-misalignment cascades)
    which by definition lives in the interaction between layers rather than in one.
    """

    FOUNDATION_MODELS = "Foundation Models"
    DATA_OPERATIONS = "Data Operations"
    AGENT_FRAMEWORKS = "Agent Frameworks"
    DEPLOYMENT_AND_INFRASTRUCTURE = "Deployment and Infrastructure"
    EVALUATION_AND_OBSERVABILITY = "Evaluation and Observability"
    SECURITY_AND_COMPLIANCE = "Security and Compliance"
    AGENT_ECOSYSTEM = "Agent Ecosystem"
    CROSS_LAYER = "Cross-Layer"


# Layers that always apply to an agentic system and so are never architecture-
# dependent: Layer 6 is vertical, and cross-layer threats span whatever exists.
MAESTRO_ALWAYS_APPLICABLE = frozenset(
    {
        MaestroLayer.SECURITY_AND_COMPLIANCE.value,
        MaestroLayer.CROSS_LAYER.value,
    }
)

# The layers whose presence depends on the architecture, and so are the only ones
# worth asking the model about. Ordered to match the framework's numbering.
MAESTRO_DETECTABLE_LAYERS = tuple(
    layer.value
    for layer in MaestroLayer
    if layer.value not in MAESTRO_ALWAYS_APPLICABLE
)

# Shared by both provider prompt modules so the framework definitions cannot drift
# between them. Only the surrounding instructions are provider-tuned.
MAESTRO_LAYER_DEFINITIONS = """\
- Foundation Models: a pretrained or fine-tuned model performing inference,
  reasoning or generation. In scope whenever the system calls a model at all,
  whether hosted, third-party API, or self-served.
- Data Operations: pipelines that ingest, label, embed, store or retrieve data
  for the system — training corpora, vector stores, RAG sources, feature stores,
  preprocessing jobs, caches of model input or output.
- Agent Frameworks: orchestration that lets a model plan or act rather than only
  respond — agent loops, tool or function calling, planners, MCP servers, memory,
  workflow engines that drive a model.
- Deployment and Infrastructure: the compute, network and supply chain the system
  runs on — containers, serverless functions, clusters, API gateways, queues,
  registries, CI/CD.
- Evaluation and Observability: monitoring, logging, tracing, evaluation harnesses,
  guardrail or safety scoring, drift detection, human review queues.
- Agent Ecosystem: interaction between this system's agents and other agents or
  external parties — agent-to-agent protocols, delegation, marketplaces,
  third-party plugins or tools, shared task queues between distinct agents."""


# Shared text fragments for threading the active methodology through the
# threat-generation and gap-analysis prompts in both prompts.py and
# prompts_gpt.py, so the two provider variants cannot drift apart.


def methodology_role_directive(methodology: str) -> str:
    """One-sentence directive naming the active classification framework."""
    if methodology == Methodology.MAESTRO.value:
        return (
            "You classify every threat against the CSA MAESTRO framework for "
            "agentic AI systems, not STRIDE."
        )
    return "You classify every threat using the STRIDE methodology."


def methodology_framework_block(methodology: str) -> str:
    """Framework definitions to inject wherever a prompt actually classifies threats."""
    if methodology == Methodology.MAESTRO.value:
        return f"""<maestro_layers>
{MAESTRO_LAYER_DEFINITIONS}

Security and Compliance and Cross-Layer are always in scope. A prior scoping
step has already determined which of the remaining layers this architecture
touches — classify each threat into the layer it actually belongs to, choosing
Cross-Layer only when the threat exists in the interaction between layers
rather than within one.
</maestro_layers>"""
    return f"""<stride_categories>
{', '.join(c.value for c in StrideCategory)}
</stride_categories>"""


def classification_field_name(methodology: str) -> str:
    return "maestro_layer" if methodology == Methodology.MAESTRO.value else "stride_category"


def classification_field_guidance(methodology: str) -> str:
    """Field-level instruction for the classification field, for output-schema blocks."""
    if methodology == Methodology.MAESTRO.value:
        return (
            "maestro_layer: exactly one of "
            f"{', '.join(layer.value for layer in MaestroLayer)}. Use Cross-Layer "
            "only when the threat exists in the interaction between layers rather "
            "than within one."
        )
    return (
        "stride_category: exactly one of "
        f"{', '.join(category.value for category in StrideCategory)}."
    )


def coverage_label(methodology: str) -> str:
    """Short noun phrase for the active classification axis, for coverage-language sentences."""
    return "MAESTRO layer" if methodology == Methodology.MAESTRO.value else "STRIDE category"


# ============================================================================
# ASSET AND ENTITY TYPES
# ============================================================================


class AssetType(Enum):
    """Types of assets and entities in threat modeling."""

    ASSET = "Asset"
    ENTITY = "Entity"


# ============================================================================
# DATABASE FIELD NAMES
# ============================================================================

# DynamoDB field names for consistency
DB_FIELD_JOB_ID = "job_id"
DB_FIELD_ID = "id"
DB_FIELD_STATE = "state"
DB_FIELD_TIMESTAMP = "updated_at"
DB_FIELD_RETRY = "retry"
DB_FIELD_ASSETS = "assets"
DB_FIELD_FLOWS = "flows"
DB_FIELD_THREATS = "threats"
DB_FIELD_GAPS = "gap"
DB_FIELD_SPACE_CONTEXT = "space_context"
DB_FIELD_BACKUP = "backup"


# ============================================================================
# ERROR MESSAGES
# ============================================================================

# Common error message templates
ERROR_MISSING_ENV_VAR = "Environment variable not set"
ERROR_MODEL_INIT_FAILED = "Model initialization failed"
ERROR_DYNAMODB_OPERATION_FAILED = "DynamoDB operation failed"
ERROR_S3_OPERATION_FAILED = "S3 operation failed"
ERROR_VALIDATION_FAILED = "Request validation failed"
ERROR_MISSING_REQUIRED_FIELDS = "Missing required fields"
ERROR_INVALID_REASONING_VALUE = "Reasoning must be an integer between 1 and 4"
ERROR_INVALID_REASONING_TYPE = "Invalid reasoning parameter"


# ============================================================================
# HTTP STATUS CODES
# ============================================================================

HTTP_STATUS_BAD_REQUEST = 400
HTTP_STATUS_UNPROCESSABLE_ENTITY = 422
HTTP_STATUS_INTERNAL_SERVER_ERROR = 500


# ============================================================================
# REASONING CONFIGURATION
# ============================================================================

# Reasoning levels: 1-4, with no "off" level.
#
# Every current model is a reasoning model. On Claude Opus 5 thinking is on by
# default and cannot be disabled above effort "high", and omitting the thinking
# config does not turn it off — it runs adaptive thinking at the provider's
# default effort. An "off" level therefore promised something the models no
# longer deliver: it billed for thinking while discarding the reasoning output.
# Level 1 (low effort) is the cheap end of the ladder instead. The range itself
# lives in MIN_REASONING_LEVEL/MAX_REASONING_LEVEL below, which
# normalize_reasoning_level enforces.
DEFAULT_REASONING_LEVEL = 1

# Reasoning model configuration
REASONING_THINKING_TYPE = "enabled"
REASONING_BUDGET_FIELD = "budget_tokens"

# Adaptive thinking configuration
ADAPTIVE_THINKING_TYPE = "adaptive"
# Level 4 tops out at "xhigh", not "max": xhigh is the recommended setting for
# demanding coding and agentic work, while max costs substantially more for
# marginal gains. Models still accept "max" if a per-model effort_map sets it.
ADAPTIVE_EFFORT_MAP: Dict[int, str] = {1: "low", 2: "medium", 3: "high", 4: "xhigh"}

# OpenAI reasoning effort mapping. GPT-5.6 (Sol/Terra/Luna) accepts
# none|low|medium|high|xhigh|max across the whole fleet — "minimal" was
# removed and is rejected with a 400 — so a single map serves every model.
# Level 4 tops out at "xhigh" for the same cost/quality reason as the adaptive
# map above; "max" stays available via a per-model reasoning_effort override.
OPENAI_REASONING_EFFORT_MAP: Dict[int, str] = {
    0: "none",
    1: "low",
    2: "medium",
    3: "high",
    4: "xhigh",
}

# Known GPT-5 family models that support reasoning
OPENAI_GPT5_FAMILY_MODELS: List[str] = [
    "gpt-5.6",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.4-2026-03-05",
    "gpt-5.2-2025-12-11",
    "gpt-5.1-2025-11-13",
    "gpt-5-2025-08-07",
    "gpt-5-mini-2025-08-07",
]


# ============================================================================
# FLUSH MODES FOR TRAIL UPDATES
# ============================================================================

FLUSH_MODE_REPLACE = 0
FLUSH_MODE_APPEND = 1


# ============================================================================
# AWS SERVICE NAMES
# ============================================================================

AWS_SERVICE_BEDROCK_RUNTIME = "bedrock-runtime"
AWS_SERVICE_DYNAMODB = "dynamodb"
AWS_SERVICE_S3 = "s3"


# ============================================================================
# VALIDATION CONSTRAINTS
# ============================================================================

# Retry validation
MIN_RETRY_COUNT = 1
MAX_RETRY_COUNT = 50

# Execution time validation (minutes)
MIN_EXECUTION_TIME_MINUTES = 1
MAX_EXECUTION_TIME_MINUTES = 60

# Summary word count validation
MIN_SUMMARY_WORDS = 10
MAX_SUMMARY_WORDS = 100

# Reasoning level validation
MIN_REASONING_LEVEL = 1
MAX_REASONING_LEVEL = 4

# Legacy clients (a cached frontend bundle, an older CLI, the MCP server) may
# still send 0, which used to mean "no thinking". It is accepted at the API
# boundary and normalized to the minimum level rather than rejected, so
# replaying an existing threat model keeps working.
LEGACY_REASONING_DISABLED = 0


# ============================================================================
# SAFETY IDENTIFIER
# ============================================================================

# Namespace prefix so the same user hashes differently here than in any other
# system that might hash the same Cognito sub.
_SAFETY_ID_NAMESPACE = "threat-designer:"


def safety_identifier(owner) -> str:
    """A stable, privacy-preserving per-user id for OpenAI's safety_identifier.

    OpenAI uses this to attribute traffic per end user, which reduces
    false-positive trips of the real-time cyber/bio misuse classifiers on
    legitimate dual-use work such as threat modeling. It must be STABLE for a
    given user (so a hash, not a per-request value) and must not carry PII —
    hence a namespaced SHA-256 of the Cognito sub rather than the sub itself.

    Returns "" when there is no owner, so the caller can omit the field.
    """
    if not owner:
        return ""
    return hashlib.sha256(f"{_SAFETY_ID_NAMESPACE}{owner}".encode("utf-8")).hexdigest()


def normalize_reasoning_level(value) -> int:
    """Coerce an incoming reasoning level onto the supported 1-4 ladder.

    ``None`` (absent) resolves to :data:`DEFAULT_REASONING_LEVEL`, and the
    legacy 0 clamps up to :data:`MIN_REASONING_LEVEL`.

    Raises:
        ValueError: for non-numeric input or a level outside 0-4.
    """
    if value is None or value == "":
        return DEFAULT_REASONING_LEVEL
    level = int(value)
    if level < LEGACY_REASONING_DISABLED or level > MAX_REASONING_LEVEL:
        raise ValueError(
            f"reasoning must be between {MIN_REASONING_LEVEL} and {MAX_REASONING_LEVEL}"
        )
    return max(level, MIN_REASONING_LEVEL)


# ============================================================================
# WORKFLOW CONFIGURATION
# ============================================================================

# Workflow node names
WORKFLOW_NODE_IMAGE_TO_BASE64 = "image_to_base64"
WORKFLOW_NODE_SPACE_CONTEXT = "space_context"
WORKFLOW_NODE_ASSET = "asset"
WORKFLOW_NODE_FLOWS = "flows"
WORKFLOW_NODE_THREATS_TRADITIONAL = "threats_traditional"
WORKFLOW_NODE_THREATS_AGENTIC = "threats_agentic"
WORKFLOW_NODE_VERSION_DIFF = "version_diff"
WORKFLOW_NODE_VERSION = "version"
WORKFLOW_NODE_FINALIZE = "finalize"

# Space context knowledge base query budget
KB_QUERY_BUDGET = 10

# Maximum number of space insights to capture before moving on
MAX_SPACE_INSIGHTS = 20

# ============================================================================
# SLEEP INTERVALS
# ============================================================================

# Sleep time in seconds for workflow finalization
FINALIZATION_SLEEP_SECONDS = 3


# Maximum execution time for attack tree generation (5 minutes)
MAX_EXECUTION_TIME_SECONDS = 900
