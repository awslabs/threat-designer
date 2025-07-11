"""Monitoring and observability utilities."""

import logging
import os
import time
from contextlib import contextmanager
from typing import Generator

import structlog
from constants import (ENV_LOG_LEVEL, ERROR_DYNAMODB_OPERATION_FAILED,
                       ERROR_MODEL_INIT_FAILED, ERROR_S3_OPERATION_FAILED,
                       ERROR_VALIDATION_FAILED)
from exceptions import ThreatModelingError

logging.basicConfig(level=os.environ.get(ENV_LOG_LEVEL, "INFO").upper())
logger = structlog.get_logger()


@contextmanager
def operation_context(operation_name: str, job_id: str) -> Generator[None, None, None]:
    """Context manager for operation monitoring."""
    start_time = time.time()
    logger.info("Operation started", operation=operation_name, job_id=job_id)

    try:
        yield
        duration = time.time() - start_time
        logger.info(
            "Operation completed",
            operation=operation_name,
            job_id=job_id,
            duration=duration,
        )
    except Exception as e:
        duration = time.time() - start_time
        logger.error(
            "Operation failed",
            operation=operation_name,
            job_id=job_id,
            duration=duration,
            error=str(e),
        )
        raise


def with_error_context(operation_name: str):
    """Decorator to add error context to operations."""

    def decorator(func):
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Error in {operation_name}: {e}", exc_info=True)

                # Use centralized error messages for consistent formatting
                error_message = _get_error_message_for_operation(operation_name, str(e))
                raise ThreatModelingError(error_message) from e

        return wrapper

    return decorator


def _get_error_message_for_operation(operation_name: str, original_error: str) -> str:
    """Get appropriate error message based on operation type."""
    operation_lower = operation_name.lower()

    if "model" in operation_lower or "bedrock" in operation_lower:
        return f"{ERROR_MODEL_INIT_FAILED}: {original_error}"
    elif "dynamodb" in operation_lower or "database" in operation_lower:
        return f"{ERROR_DYNAMODB_OPERATION_FAILED}: {original_error}"
    elif "s3" in operation_lower or "bucket" in operation_lower:
        return f"{ERROR_S3_OPERATION_FAILED}: {original_error}"
    elif "validation" in operation_lower or "validate" in operation_lower:
        return f"{ERROR_VALIDATION_FAILED}: {original_error}"
    else:
        return f"Failed to {operation_name}: {original_error}"
