"""
Centralized constants for the Threat Designer module.

This module contains all constants used throughout the threat modeling system,
organized by logical categories for better maintainability and consistency.
"""

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
ENV_LOG_LEVEL = "LOG_LEVEL"
ENV_TRACEBACK_ENABLED = "TRACEBACK_ENABLED"

# Model configuration environment variables
ENV_MAIN_MODEL = "MAIN_MODEL"
ENV_MODEL_STRUCT = "MODEL_STRUCT"
ENV_MODEL_SUMMARY = "MODEL_SUMMARY"
ENV_REASONING_MODELS = "REASONING_MODELS"


# ============================================================================
# DEFAULT VALUES
# ============================================================================

# AWS configuration defaults
DEFAULT_REGION = "us-west-2"
DEFAULT_TIMEOUT = 1000

# Model configuration defaults
DEFAULT_MAX_RETRY = 15
DEFAULT_MAX_EXECUTION_TIME_MINUTES = 12
DEFAULT_REASONING_ENABLED = False
DEFAULT_SUMMARY_MAX_WORDS = 40
DEFAULT_BUDGET = 4000

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

# Token budgets for different reasoning levels
TOKEN_BUDGETS: Dict[int, int] = {1: 8000, 2: 16000, 3: 32000}

# Stop sequences for model generation
STOP_SEQUENCES: List[str] = ["Human:", "User:", "Assistant:", "\nAI:"]

# Model temperature settings
MODEL_TEMPERATURE_DEFAULT = 0
MODEL_TEMPERATURE_REASONING = 1


# ============================================================================
# PROMPT CONFIGURATION
# ============================================================================

# Word limits for threat descriptions
THREAT_DESCRIPTION_MIN_WORDS = 35
THREAT_DESCRIPTION_MAX_WORDS = 50

# Mitigation constraints
MITIGATION_MIN_ITEMS = 2
MITIGATION_MAX_ITEMS = 5

# Summary configuration
SUMMARY_MAX_WORDS_DEFAULT = 40


# ============================================================================
# JOB STATES (ENUM)
# ============================================================================


class JobState(Enum):
    """Enumeration of possible job states in the threat modeling workflow."""

    ASSETS = "ASSETS"
    FLOW = "FLOW"
    THREAT = "THREAT"
    THREAT_RETRY = "THREAT_RETRY"
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
# ASSET AND ENTITY TYPES
# ============================================================================


class AssetType(Enum):
    """Types of assets and entities in threat modeling."""

    ASSET = "Asset"
    ENTITY = "Entity"


# ============================================================================
# LIKELIHOOD LEVELS
# ============================================================================


class LikelihoodLevel(Enum):
    """Threat likelihood assessment levels."""

    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


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
DB_FIELD_BACKUP = "backup"


# ============================================================================
# ERROR MESSAGES
# ============================================================================

# Common error message templates
ERROR_MISSING_ENV_VAR = "Environment variable not set"
ERROR_INVALID_JSON = "Invalid JSON in environment variables"
ERROR_MODEL_INIT_FAILED = "Model initialization failed"
ERROR_DYNAMODB_OPERATION_FAILED = "DynamoDB operation failed"
ERROR_S3_OPERATION_FAILED = "S3 operation failed"
ERROR_VALIDATION_FAILED = "Request validation failed"
ERROR_MISSING_REQUIRED_FIELDS = "Missing required fields"
ERROR_INVALID_REASONING_VALUE = "Reasoning must be 0 or 1"
ERROR_INVALID_REASONING_TYPE = "Invalid reasoning parameter"


# ============================================================================
# HTTP STATUS CODES
# ============================================================================

HTTP_STATUS_OK = 200
HTTP_STATUS_BAD_REQUEST = 400
HTTP_STATUS_UNPROCESSABLE_ENTITY = 422
HTTP_STATUS_INTERNAL_SERVER_ERROR = 500


# ============================================================================
# REASONING CONFIGURATION
# ============================================================================

# Valid reasoning levels
REASONING_DISABLED = 0
REASONING_ENABLED = [1, 2, 3]
VALID_REASONING_VALUES = [REASONING_DISABLED, *REASONING_ENABLED]

# Reasoning model configuration
REASONING_THINKING_TYPE = "enabled"
REASONING_BUDGET_FIELD = "budget_tokens"


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
# IMAGE PROCESSING
# ============================================================================

IMAGE_MIME_TYPE_JPEG = "image/jpeg"
IMAGE_URL_PREFIX = "data:image/jpeg;base64,"


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
MIN_REASONING_LEVEL = 0
MAX_REASONING_LEVEL = 3


# ============================================================================
# WORKFLOW CONFIGURATION
# ============================================================================

# Workflow node names
WORKFLOW_NODE_IMAGE_TO_BASE64 = "image_to_base64"
WORKFLOW_NODE_ASSET = "asset"
WORKFLOW_NODE_FLOWS = "flows"
WORKFLOW_NODE_THREATS = "threats"
WORKFLOW_NODE_GAP_ANALYSIS = "gap_analysis"
WORKFLOW_NODE_FINALIZE = "finalize"

# Workflow routing values
WORKFLOW_ROUTE_REPLAY = "replay"
WORKFLOW_ROUTE_FULL = "full"


# ============================================================================
# SLEEP INTERVALS
# ============================================================================

# Sleep time in seconds for workflow finalization
FINALIZATION_SLEEP_SECONDS = 3
