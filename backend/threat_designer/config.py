"""Configuration management for the Threat Designer Agent."""

from constants import (DEFAULT_MAX_EXECUTION_TIME_MINUTES, DEFAULT_MAX_RETRY,
                       DEFAULT_REASONING_ENABLED, DEFAULT_SUMMARY_MAX_WORDS,
                       ENV_AGENT_STATE_TABLE, MAX_EXECUTION_TIME_MINUTES,
                       MAX_RETRY_COUNT, MAX_SUMMARY_WORDS,
                       MIN_EXECUTION_TIME_MINUTES, MIN_RETRY_COUNT,
                       MIN_SUMMARY_WORDS)
from pydantic import Field
from pydantic_settings import BaseSettings


class ThreatModelingConfig(BaseSettings):
    """Configuration settings for threat modeling workflow."""

    agent_state_table: str = Field(..., env=ENV_AGENT_STATE_TABLE)
    max_retry: int = Field(
        default=DEFAULT_MAX_RETRY, ge=MIN_RETRY_COUNT, le=MAX_RETRY_COUNT
    )
    max_execution_time_minutes: int = Field(
        default=DEFAULT_MAX_EXECUTION_TIME_MINUTES,
        ge=MIN_EXECUTION_TIME_MINUTES,
        le=MAX_EXECUTION_TIME_MINUTES,
    )
    reasoning_enabled: bool = Field(default=DEFAULT_REASONING_ENABLED)
    summary_max_words: int = Field(
        default=DEFAULT_SUMMARY_MAX_WORDS, ge=MIN_SUMMARY_WORDS, le=MAX_SUMMARY_WORDS
    )

    class Config:
        validate_assignment = True


config = ThreatModelingConfig()
