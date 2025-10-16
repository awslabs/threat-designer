"""
Threat Designer entry point
"""

import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Dict
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from models import InvocationRequest
from fastapi.middleware.cors import CORSMiddleware
import boto3
import time
from threading import Lock
from config import ThreatModelingConfig
from constants import (
    ENV_AGENT_STATE_TABLE,
    ENV_ARCHITECTURE_BUCKET,
    ENV_TRACEBACK_ENABLED,
    ERROR_INVALID_REASONING_TYPE,
    ERROR_INVALID_REASONING_VALUE,
    ERROR_MISSING_REQUIRED_FIELDS,
    ERROR_VALIDATION_FAILED,
    HTTP_STATUS_BAD_REQUEST,
    HTTP_STATUS_INTERNAL_SERVER_ERROR,
    HTTP_STATUS_UNPROCESSABLE_ENTITY,
    REASONING_DISABLED,
    VALID_REASONING_VALUES,
    JobState,
)
from exceptions import ThreatModelingError, ValidationError
from model_utils import initialize_models
from monitoring import logger, operation_context, with_error_context
from state import AgentState, AssetsList, FlowsList, ThreatsList
from utils import fetch_results, parse_s3_image_to_base64, update_job_state
from workflow import ConfigSchema, agent

dynamodb = boto3.resource("dynamodb")
S3_BUCKET = os.environ.get(ENV_ARCHITECTURE_BUCKET)
AGENT_TABLE = os.environ.get(ENV_AGENT_STATE_TABLE)

# Create a thread pool executor for background tasks
executor = ThreadPoolExecutor(max_workers=10)

# Initialize configuration
threat_config = ThreatModelingConfig()

# Track active invocation requests
invocation_lock = Lock()
active_invocations = 0

last_known_status = None
last_status_update_time = time.time()


def _run_agent_async(state: Dict, config: Dict, job_id: str, agent_config: Dict):
    """
    Run the agent in a background thread.
    """
    try:
        with operation_context("agent_execution", job_id):
            logger.info(
                "Starting threat modeling analysis in background",
                job_id=job_id,
                reasoning=agent_config["reasoning"],
                iteration=state.get("iteration", 0),
            )

            # Execute the threat modeling workflow
            agent.invoke(state, config=config)

            logger.info(
                "Threat modeling completed successfully",
                job_id=job_id,
                execution_time_seconds=(
                    datetime.now() - agent_config["start_time"]
                ).total_seconds(),
            )

    except ThreatModelingError as e:
        _handle_error_response(e, job_id, HTTP_STATUS_UNPROCESSABLE_ENTITY)

    except Exception as e:
        _handle_error_response(e, job_id, HTTP_STATUS_INTERNAL_SERVER_ERROR)
    finally:
        # Decrement active invocations counter
        with invocation_lock:
            global active_invocations
            active_invocations -= 1
        logger.info(
            "Background invocation completed", active_invocations=active_invocations
        )


@with_error_context("create agent configuration")
def _create_agent_config(event: Dict[str, Any]) -> ConfigSchema:
    """
    Create configuration for the threat modeling agent.

    Args:
        event: event containing configuration parameters

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
        "model_assets": models["assets_model"],
        "model_flows": models["flows_model"],
        "model_threats": models["threats_model"],
        "model_gaps": models["gaps_model"],
        "model_struct": models["struct_model"],
        "model_summary": models["summary_model"],
        "start_time": datetime.now(),
        "reasoning": thinking,
    }


def _initialize_state(event: Dict[str, Any], job_id: str) -> AgentState:
    """
    Initialize the agent state for threat modeling analysis.

    Args:
        event: event containing job configuration
        job_id: Unique identifier for the analysis job

    Returns:
        AgentState: Initialized state object for the analysis
    """
    with operation_context("initialize_state", job_id):
        state = AgentState()
        state["job_id"] = job_id
        state["iteration"] = event.get("iteration", REASONING_DISABLED)
        state["instructions"] = (event.get("instructions") or "").strip() or None

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

        threat_list_data = item["threat_list"].copy()
        threat_list_data["threats"] = [
            threat
            for threat in threat_list_data["threats"]
            if threat.get("starred", False)
        ]

        threat_list = ThreatsList(**threat_list_data)

        state.update(
            {
                "replay": True,
                "summary": item.get("summary"),
                "assets": assets,
                "system_architecture": system_architecture,
                "threat_list": threat_list,
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
        event: event with job configuration

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
    Validate the incoming event.

    Args:
        event: event to validate

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

    return JSONResponse(
        {"error": user_message, "message": error_msg, "job_id": job_id},
        status_code=status_code,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


# Initialize FastAPI app
app = FastAPI(title="Threat Designer Agent Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET, POST, OPTIONS"],
    allow_headers=["*"],
)


@app.options("/invocations")
async def handle_options():
    return {"message": "OK"}


@app.get("/ping")
async def ping():
    global active_invocations, last_known_status, last_status_update_time

    with invocation_lock:
        # Determine current status
        if active_invocations > 0:
            current_status = "HealthyBusy"
        else:
            current_status = "Healthy"

        # Update timestamp only when status changes
        if last_known_status != current_status:
            last_known_status = current_status
            last_status_update_time = time.time()

        return JSONResponse(
            {
                "status": current_status,
                "time_of_last_update": int(last_status_update_time),
            }
        )


@app.post("/invocations")
async def handler(request: InvocationRequest, http_request: Request) -> Dict[str, Any]:
    """
    Handler for threat modeling analysis using the refactored agent.
    Returns immediately after starting the process.

    Args:
        request: InvocationRequest containing job configuration
        http_request: FastAPI Request object

    Returns:
        Dict: Response containing status code and job acceptance
    """

    global active_invocations
    job_id = None
    event = request.input

    try:
        job_id = event["id"]

        with operation_context("handler", job_id):
            logger.info("Processing threat modeling request", job_id=job_id)

            # Create agent configuration
            agent_config = _create_agent_config(event)

            # Initialize state
            state = _initialize_state(event, job_id)

            # Track active invocation
            with invocation_lock:
                active_invocations += 1

            logger.info(
                "Agent invocation accepted", active_invocations=active_invocations
            )

            # Log execution start
            logger.info(
                "Accepting threat modeling request",
                job_id=job_id,
                replay=event.get("replay", False),
                reasoning=agent_config["reasoning"],
                iteration=state.get("iteration", 0),
            )

            # Create full configuration for the agent
            config = {"configurable": agent_config}

            # Submit the agent execution to run in background
            loop = asyncio.get_event_loop()
            loop.run_in_executor(
                executor, _run_agent_async, state, config, job_id, agent_config
            )

            # Return immediately with 200 status
            return JSONResponse(
                {
                    "message": "Threat modeling process started",
                    "job_id": job_id,
                    "status": "processing",
                },
                status_code=200,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            )

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        loop="uvloop",
        http="httptools",
        timeout_keep_alive=75,
        access_log=False,
    )
