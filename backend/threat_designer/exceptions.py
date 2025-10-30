"""Custom exceptions for threat modeling operations."""


class ThreatModelingError(Exception):
    """Base exception for threat modeling operations."""

    pass


class DynamoDBError(ThreatModelingError):
    """Custom exception for DynamoDB operations."""

    pass


class S3Error(ThreatModelingError):
    """Custom exception for S3 operations."""

    pass


class ModelInvocationError(ThreatModelingError):
    """Raised when model invocation fails."""

    pass


class StateUpdateError(ThreatModelingError):
    """Raised when state update operations fail."""

    pass


class ValidationError(ThreatModelingError):
    """Raised when data validation fails."""

    pass


class ModelProviderError(ThreatModelingError):
    """Raised when model provider configuration is invalid."""

    pass


class OpenAIAuthenticationError(ThreatModelingError):
    """Raised when OpenAI API key authentication fails."""

    pass


class OpenAIRateLimitError(ThreatModelingError):
    """Raised when OpenAI rate limits are exceeded."""

    pass
