"""
AWS Lambda handler for threat modeling analysis.
"""

import json
import os
from datetime import datetime
from typing import Any, Dict

import boto3
from config import ThreatModelingConfig
from constants import (ENV_AGENT_STATE_TABLE, ENV_ARCHITECTURE_BUCKET,
                       ENV_TRACEBACK_ENABLED, ERROR_INVALID_REASONING_TYPE,
                       ERROR_INVALID_REASONING_VALUE,
                       ERROR_MISSING_REQUIRED_FIELDS, ERROR_VALIDATION_FAILED,
                       HTTP_STATUS_BAD_REQUEST,
                       HTTP_STATUS_INTERNAL_SERVER_ERROR, HTTP_STATUS_OK,
                       HTTP_STATUS_UNPROCESSABLE_ENTITY, REASONING_DISABLED,
                       VALID_REASONING_VALUES, JobState)
from exceptions import ThreatModelingError, ValidationError
from model_utils import initialize_models
from monitoring import logger, operation_context, with_error_context
from state import AgentState, AssetsList, FlowsList
from utils import fetch_results, parse_s3_image_to_base64, update_job_state
from workflow import ConfigSchema, agent

dynamodb = boto3.resource("dynamodb")
S3_BUCKET = os.environ.get(ENV_ARCHITECTURE_BUCKET)
AGENT_TABLE = os.environ.get(ENV_AGENT_STATE_TABLE)


# Initialize configuration
threat_config = ThreatModelingConfig()


@with_error_context("create agent configuration")
def _create_agent_config(event: Dict[str, Any]) -> ConfigSchema:
    """
    Create configuration for the threat modeling agent.

    Args:
        event: Lambda event containing configuration parameters

    Returns:
        ConfigSchema: Properly typed configuration for the agent
    """
    reasoning = int(event.get("reasoning", str(REASONING_DISABLED)))
    models = initialize_models(reasoning)
    thinking = reasoning != REASONING_DISABLED

    logger.info(
        "Created agent configuration",
        reasoning=thinking,
    )

    return {
        "model_main": models["main_model"],
        "model_struct": models["struct_model"],
        "model_summary": models["summary_model"],
        "start_time": datetime.now(),
        "reasoning": thinking,
    }


def _initialize_state(event: Dict[str, Any], job_id: str) -> AgentState:
    """
    Initialize the agent state for threat modeling analysis.

    Args:
        event: The Lambda event containing job configuration
        job_id: Unique identifier for the analysis job

    Returns:
        AgentState: Initialized state object for the analysis
    """
    with operation_context("initialize_state", job_id):
        state = AgentState()
        state["job_id"] = job_id
        state["iteration"] = event.get("iteration", REASONING_DISABLED)

        replay_mode = event.get("replay", False)
        logger.info(
            "Initializing state",
            job_id=job_id,
            replay_mode=replay_mode,
            iteration=state["iteration"],
        )

        if replay_mode:
            return _handle_replay_state(state, job_id)
        return _handle_new_state(state, event)


@with_error_context("handle replay state")
def _handle_replay_state(state: AgentState, job_id: str) -> AgentState:
    """
    Handle replay of previous analysis by loading saved state.

    Args:
        state: Current agent state
        job_id: ID of job to replay

    Returns:
        AgentState: State loaded from previous analysis
    """
    with operation_context("handle_replay", job_id):
        logger.info("Loading replay state", job_id=job_id)

        results = fetch_results(job_id, AGENT_TABLE)
        item = results["item"]

        # Parse stored data back into proper types
        assets = AssetsList(**item["assets"]) if item.get("assets") else None
        system_architecture = (
            FlowsList(**item["system_architecture"])
            if item.get("system_architecture")
            else None
        )

        state.update(
            {
                "replay": True,
                "summary": item.get("summary"),
                "assets": assets,
                "system_architecture": system_architecture,
                "retry": 1,
                "image_data": parse_s3_image_to_base64(S3_BUCKET, item["s3_location"]),
                "description": item.get("description", ""),
                "assumptions": item.get("assumptions", []),
                "title": item.get("title"),
                "owner": item.get("owner"),
                "s3_location": item["s3_location"],
            }
        )

        logger.info(
            "Successfully loaded replay state",
            job_id=job_id,
            has_assets=assets is not None,
            has_system_architecture=system_architecture is not None,
            assumptions_count=len(state["assumptions"]),
        )
        return state


@with_error_context("handle new state")
def _handle_new_state(state: AgentState, event: Dict[str, Any]) -> AgentState:
    """
    Initialize state for new analysis.

    Args:
        state: Current agent state
        event: Lambda event with job configuration

    Returns:
        AgentState: Initialized state for new analysis
    """
    job_id = state.get("job_id", "unknown")
    with operation_context("handle_new_state", job_id):
        # Validate required fields
        required_fields = ["s3_location"]
        missing_fields = [field for field in required_fields if not event.get(field)]
        if missing_fields:
            logger.error(
                "Missing required fields for new state",
                job_id=job_id,
                missing_fields=missing_fields,
            )
            raise ValidationError(f"{ERROR_MISSING_REQUIRED_FIELDS}: {missing_fields}")

        state.update(
            {
                "image_data": parse_s3_image_to_base64(S3_BUCKET, event["s3_location"]),
                "description": event.get("description", " "),
                "assumptions": event.get("assumptions", []),
                "s3_location": event["s3_location"],
                "owner": event.get("owner"),
                "title": event.get("title"),
            }
        )

        logger.info(
            "Successfully initialized new state",
            job_id=job_id,
            s3_location=event["s3_location"],
            has_description=bool(event.get("description")),
            assumptions_count=len(event.get("assumptions", [])),
            has_owner=bool(event.get("owner")),
            has_title=bool(event.get("title")),
        )
        return state


@with_error_context("validate event")
def _validate_event(event: Dict[str, Any]) -> None:
    """
    Validate the incoming Lambda event.

    Args:
        event: Lambda event to validate

    Raises:
        ValidationError: If required fields are missing or invalid
    """
    logger.info("Validating incoming event", event_keys=list(event.keys()))

    required_fields = ["id"]
    missing_fields = [field for field in required_fields if not event.get(field)]

    if missing_fields:
        logger.error(
            "Event validation failed - missing fields", missing_fields=missing_fields
        )
        raise ValidationError(f"{ERROR_MISSING_REQUIRED_FIELDS}: {missing_fields}")

    # Validate reasoning parameter if provided
    if "reasoning" in event:
        try:
            reasoning_value = int(event["reasoning"])
            if reasoning_value not in VALID_REASONING_VALUES:
                logger.error(
                    "Invalid reasoning value",
                    reasoning_value=reasoning_value,
                    expected_values=VALID_REASONING_VALUES,
                )
                raise ValidationError(ERROR_INVALID_REASONING_VALUE)
        except (ValueError, TypeError) as e:
            logger.error(
                "Invalid reasoning parameter type",
                reasoning_param=event["reasoning"],
                error=str(e),
            )
            raise ValidationError(ERROR_INVALID_REASONING_TYPE)

    logger.info("Event validation successful", event_id=event["id"])


def _handle_error_response(
    error: Exception, job_id: str = None, status_code: int = 500
) -> Dict[str, Any]:
    """
    Handle error responses with proper logging and job state updates.

    Args:
        error: The exception that occurred
        job_id: Job ID if available
        status_code: HTTP status code to return

    Returns:
        Dict: Error response
    """
    error_type = type(error).__name__
    error_msg = str(error)
    show_traceback = os.environ.get(ENV_TRACEBACK_ENABLED, "false").lower() == "true"
    logger.error(
        "Request failed",
        error_type=error_type,
        error_message=error_msg,
        job_id=job_id,
        status_code=status_code,
        exc_info=show_traceback,
    )

    if job_id:
        try:
            update_job_state(job_id, JobState.FAILED.value)
            logger.info("Updated job state to FAILED", job_id=job_id)
        except Exception as update_error:
            logger.error(
                "Failed to update job state to FAILED",
                job_id=job_id,
                update_error=str(update_error),
            )

    # Map error types to user-friendly messages
    error_messages = {
        "ValidationError": ERROR_VALIDATION_FAILED,
        "ValueError": "Invalid request parameters",
        "KeyError": "Missing required data",
        "ThreatModelingError": "Threat modeling process failed",
    }

    user_message = error_messages.get(error_type, "Internal server error occurred")

    return {
        "statusCode": status_code,
        "body": json.dumps(
            {"error": user_message, "message": error_msg, "job_id": job_id}
        ),
    }


def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    AWS Lambda handler for threat modeling analysis using the refactored agent.

    Args:
        event: Lambda event containing job configuration
        context: Lambda context object

    Returns:
        Dict: Response containing status code and execution result
    """
    job_id = None
    request_id = getattr(context, "aws_request_id", "unknown")

    logger.info(
        "Lambda handler invoked",
        request_id=request_id,
        function_name=getattr(context, "function_name", "unknown"),
        remaining_time_ms=getattr(context, "get_remaining_time_in_millis", lambda: 0)(),
    )

    try:
        # Validate incoming event
        _validate_event(event)
        job_id = event["id"]

        with operation_context("lambda_handler", job_id):
            logger.info(
                "Processing threat modeling request",
                job_id=job_id,
                request_id=request_id,
            )

            # Create agent configuration
            agent_config = _create_agent_config(event)

            # Initialize state
            state = _initialize_state(event, job_id)

            # Log execution start
            logger.info(
                "Starting threat modeling analysis",
                job_id=job_id,
                replay=event.get("replay", False),
                reasoning=agent_config["reasoning"],
                iteration=state.get("iteration", 0),
            )

            # Create full configuration for the agent
            config = {"configurable": agent_config}

            # Execute the threat modeling workflow
            agent.invoke(state, config=config)

            logger.info(
                "Threat modeling completed successfully",
                job_id=job_id,
                request_id=request_id,
                execution_time_seconds=(
                    datetime.now() - agent_config["start_time"]
                ).total_seconds(),
            )

            return {
                "statusCode": HTTP_STATUS_OK,
                "body": json.dumps(
                    {
                        "message": "Threat modeling completed successfully",
                        "job_id": job_id,
                        "request_id": request_id,
                    }
                ),
            }

    except ValidationError as e:
        return _handle_error_response(e, job_id, HTTP_STATUS_BAD_REQUEST)

    except ValueError as e:
        return _handle_error_response(e, job_id, HTTP_STATUS_BAD_REQUEST)

    except KeyError as e:
        return _handle_error_response(e, job_id, HTTP_STATUS_BAD_REQUEST)

    except ThreatModelingError as e:
        return _handle_error_response(e, job_id, HTTP_STATUS_UNPROCESSABLE_ENTITY)

    except Exception as e:
        return _handle_error_response(e, job_id, HTTP_STATUS_INTERNAL_SERVER_ERROR)
