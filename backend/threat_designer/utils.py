"""
AWS utility functions for handling DynamoDB operations, and AI model interactions.
Provides functionality for state management, image processing, and error handling
in AWS Lambda environments. Includes tools for working with Amazon Bedrock and structured data.
"""

import base64
import copy
import decimal
import os
import traceback
from datetime import datetime, timezone
from typing import (Any, Callable, Dict, List, Optional, ParamSpec, TypeVar,
                    Union)

import boto3
import structlog
from botocore.exceptions import ClientError
from constants import (AWS_SERVICE_DYNAMODB, AWS_SERVICE_S3, DB_FIELD_ASSETS,
                       DB_FIELD_BACKUP, DB_FIELD_FLOWS, DB_FIELD_GAPS,
                       DB_FIELD_ID, DB_FIELD_JOB_ID, DB_FIELD_RETRY,
                       DB_FIELD_STATE, DB_FIELD_THREATS, DB_FIELD_TIMESTAMP,
                       DEFAULT_REGION, ENV_AGENT_TRAIL_TABLE, ENV_AWS_REGION,
                       ENV_JOB_STATUS_TABLE, ERROR_DYNAMODB_OPERATION_FAILED,
                       ERROR_MISSING_ENV_VAR, ERROR_S3_OPERATION_FAILED,
                       FLUSH_MODE_REPLACE)
from exceptions import DynamoDBError, S3Error, ThreatModelingError
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import BaseMessage
from langchain_core.messages.human import HumanMessage
from monitoring import operation_context, with_error_context
from prompts import structure_prompt
from state import AgentState

logger = structlog.get_logger()

# Environment variable lookups using centralized constants
JOB_STATUS_TABLE = os.environ.get(ENV_JOB_STATUS_TABLE)
TRAIL_TABLE = os.environ.get(ENV_AGENT_TRAIL_TABLE)
REGION = os.environ.get(ENV_AWS_REGION, DEFAULT_REGION)

# Type definitions
P = ParamSpec("P")
R = TypeVar("R")

# ============================================================================
# DATA CONVERSION UTILITIES
# ============================================================================


def convert_decimals(
    obj: Union[List[Any], Dict[Any, Any], decimal.Decimal, Any],
) -> Union[List[Any], Dict[Any, Any], int, float, Any]:
    """
    Recursively converts Decimal to float or int in a dictionary.

    Args:
        obj: Object that may contain Decimal values to convert.

    Returns:
        Object with Decimal values converted to int/float.
    """
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, decimal.Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    else:
        return obj


# ============================================================================
# DYNAMODB OPERATIONS
# ============================================================================


@with_error_context("update job state")
def update_job_state(
    job_id: str,
    state: AgentState,
    retry: Optional[bool] = None,
    job_context_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Update job state in DynamoDB with proper error handling and logging.

    Args:
        job_id: Unique identifier for the job.
        state: New state to set for the job.
        retry: Optional retry flag to set.
        job_context_id: Optional job context for operation tracking.

    Returns:
        DynamoDB response or None if operation failed.

    Raises:
        DynamoDBError: If update operation fails.
    """
    if not JOB_STATUS_TABLE:
        raise DynamoDBError(f"{ENV_JOB_STATUS_TABLE} {ERROR_MISSING_ENV_VAR}")

    context_id = job_context_id or f"update-job-{job_id}"

    with operation_context("update_job_state", context_id):
        try:
            logger.info(
                "Updating job state",
                job_id=job_id,
                new_state=state,
                retry=retry,
                table=JOB_STATUS_TABLE,
            )

            dynamodb = boto3.resource(AWS_SERVICE_DYNAMODB, region_name=REGION)
            table = dynamodb.Table(JOB_STATUS_TABLE)

            current_utc = datetime.now(timezone.utc).isoformat()

            # Build update expression and attributes
            update_expr = f"SET #{DB_FIELD_STATE} = :{DB_FIELD_STATE}, #{DB_FIELD_TIMESTAMP} = :{DB_FIELD_TIMESTAMP}"
            expr_names = {
                f"#{DB_FIELD_STATE}": DB_FIELD_STATE,
                f"#{DB_FIELD_TIMESTAMP}": DB_FIELD_TIMESTAMP,
            }
            expr_values = {
                f":{DB_FIELD_STATE}": state,
                f":{DB_FIELD_TIMESTAMP}": current_utc,
            }

            # Add retry if provided
            if retry is not None:
                update_expr += f", #{DB_FIELD_RETRY} = :{DB_FIELD_RETRY}"
                expr_names[f"#{DB_FIELD_RETRY}"] = DB_FIELD_RETRY
                expr_values[f":{DB_FIELD_RETRY}"] = retry

            response = table.update_item(
                Key={DB_FIELD_ID: job_id},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
                ReturnValues="UPDATED_NEW",
            )

            logger.info(
                "Job state updated successfully",
                job_id=job_id,
                state=state,
                updated_attributes=response.get("Attributes", {}),
            )

            return response

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"]["Message"]
            logger.error(
                "DynamoDB client error during job state update",
                job_id=job_id,
                error_code=error_code,
                error_message=error_message,
                table=JOB_STATUS_TABLE,
            )
            raise DynamoDBError(f"{ERROR_DYNAMODB_OPERATION_FAILED}: {error_message}")

        except Exception as e:
            logger.error(
                "Unexpected error during job state update",
                job_id=job_id,
                error=str(e),
                table=JOB_STATUS_TABLE,
            )
            raise


@with_error_context("update trail")
def update_trail(
    job_id: str,
    assets: Optional[str] = None,
    flows: Optional[str] = None,
    threats: Optional[Union[str, List[str]]] = None,
    gaps: Optional[Union[str, List[str]]] = None,
    flush: int = 0,
    job_context_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Update trail information in DynamoDB with comprehensive logging.

    Args:
        job_id: Unique identifier for the job.
        assets: Assets information to update.
        flows: Flows information to update.
        threats: Threats information to update (string or list).
        gaps: Gaps information to update (string or list).
        flush: Whether to flush existing list data (0=replace, 1=append).
        job_context_id: Optional job context for operation tracking.

    Returns:
        DynamoDB response or None if no updates needed.

    Raises:
        DynamoDBError: If update operation fails.
    """
    if not TRAIL_TABLE:
        raise DynamoDBError(f"{ENV_AGENT_TRAIL_TABLE} {ERROR_MISSING_ENV_VAR}")

    context_id = job_context_id or f"update-trail-{job_id}"

    with operation_context("update_trail", context_id):
        logger.info(
            "Starting trail update",
            job_id=job_id,
            has_assets=assets is not None,
            has_flows=flows is not None,
            has_threats=threats is not None,
            has_gaps=gaps is not None,
            flush_mode=flush,
            table=TRAIL_TABLE,
        )

        try:
            dynamodb = boto3.resource(AWS_SERVICE_DYNAMODB, region_name=REGION)
            table = dynamodb.Table(TRAIL_TABLE)

            # Build update expression
            update_expr = "SET "
            expr_names = {}
            expr_values = {}
            is_first = True

            # Handle string fields
            for field_name, field_value, db_field in [
                ("assets", assets, DB_FIELD_ASSETS),
                ("flows", flows, DB_FIELD_FLOWS),
            ]:
                if field_value is not None:
                    if not is_first:
                        update_expr += ", "
                    update_expr += f"#{db_field} = :{db_field}"
                    expr_names[f"#{db_field}"] = db_field
                    expr_values[f":{db_field}"] = field_value
                    is_first = False

            # Handle list fields
            for field_name, field_value, db_field in [
                ("threats", threats, DB_FIELD_THREATS),
                ("gaps", gaps, DB_FIELD_GAPS),
            ]:
                if field_value is not None:
                    field_list = (
                        field_value if isinstance(field_value, list) else [field_value]
                    )

                    if not is_first:
                        update_expr += ", "

                    if flush == FLUSH_MODE_REPLACE:
                        # Replace the entire list
                        update_expr += f"#{db_field} = :{db_field}"
                        expr_values[f":{db_field}"] = field_list
                        logger.debug(
                            f"Replacing {field_name} list",
                            job_id=job_id,
                            items_count=len(field_list),
                        )
                    else:
                        # Check if field exists and append or create
                        try:
                            response = table.get_item(
                                Key={DB_FIELD_ID: job_id}, ProjectionExpression=db_field
                            )
                            if db_field in response.get("Item", {}):
                                update_expr += f"#{db_field} = list_append(#{db_field}, :{db_field})"
                                logger.debug(
                                    f"Appending to existing {field_name} list",
                                    job_id=job_id,
                                    items_count=len(field_list),
                                )
                            else:
                                update_expr += f"#{db_field} = :{db_field}"
                                logger.debug(
                                    f"Creating new {field_name} list",
                                    job_id=job_id,
                                    items_count=len(field_list),
                                )
                        except ClientError as e:
                            logger.warning(
                                f"Could not check existing {field_name}, creating new list",
                                job_id=job_id,
                                error=str(e),
                            )
                            update_expr += f"#{db_field} = :{db_field}"

                        expr_values[f":{db_field}"] = field_list

                    expr_names[f"#{db_field}"] = db_field
                    is_first = False

            # Only proceed if there's something to update
            if is_first:
                logger.info("No fields to update in trail", job_id=job_id)
                return None

            response = table.update_item(
                Key={DB_FIELD_ID: job_id},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
                ReturnValues="UPDATED_NEW",
            )

            updated_fields = list(expr_names.values())
            logger.info(
                "Trail updated successfully",
                job_id=job_id,
                updated_fields=updated_fields,
                flush_mode=flush,
            )

            return response

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"]["Message"]
            logger.error(
                "DynamoDB client error during trail update",
                job_id=job_id,
                error_code=error_code,
                error_message=error_message,
                table=TRAIL_TABLE,
            )
            raise DynamoDBError(f"{ERROR_DYNAMODB_OPERATION_FAILED}: {error_message}")

        except Exception as e:
            logger.error(
                "Unexpected error during trail update",
                job_id=job_id,
                error=str(e),
                table=TRAIL_TABLE,
            )
            raise


@with_error_context("create DynamoDB item")
def create_dynamodb_item(
    agent_state: AgentState, table_name: str, job_context_id: Optional[str] = None
) -> None:
    """
    Create a new DynamoDB item from agent state.

    Args:
        agent_state: Agent state containing all job information.
        table_name: DynamoDB table name to insert into.
        job_context_id: Optional job context for operation tracking.

    Raises:
        DynamoDBError: If item creation fails.
    """
    context_id = job_context_id or f"create-item-{agent_state.get('job_id', 'unknown')}"

    with operation_context("create_dynamodb_item", context_id):
        try:
            job_id = agent_state.get("job_id")
            if not job_id:
                raise ValueError("job_id is required in agent_state")

            logger.info("Creating DynamoDB item", job_id=job_id, table=table_name)

            dynamodb = boto3.resource(AWS_SERVICE_DYNAMODB, region_name=REGION)
            table = dynamodb.Table(table_name)

            current_utc = datetime.now(timezone.utc).isoformat()

            # Convert agent state to DynamoDB item
            item = {
                DB_FIELD_JOB_ID: job_id,
                "summary": agent_state.get("summary"),
                "assets": agent_state["assets"].dict()
                if hasattr(agent_state["assets"], "dict")
                else agent_state["assets"],
                "system_architecture": agent_state["system_architecture"].dict()
                if hasattr(agent_state["system_architecture"], "dict")
                else agent_state["system_architecture"],
                "threat_list": agent_state["threat_list"].dict()
                if hasattr(agent_state["threat_list"], "dict")
                else agent_state["threat_list"],
                "description": agent_state.get("description"),
                "assumptions": agent_state.get("assumptions"),
                "s3_location": agent_state["s3_location"],
                "title": agent_state.get("title"),
                "owner": agent_state.get("owner"),
                "retry": agent_state.get("retry"),
                "timestamp": current_utc,
            }

            # Remove None values to avoid DynamoDB issues
            item = {k: v for k, v in item.items() if v is not None}

            table.put_item(Item=item)

            logger.info(
                "DynamoDB item created successfully",
                job_id=job_id,
                table=table_name,
                item_keys=list(item.keys()),
            )

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"]["Message"]
            logger.error(
                "DynamoDB client error during item creation",
                job_id=agent_state.get("job_id"),
                error_code=error_code,
                error_message=error_message,
                table=table_name,
            )
            raise DynamoDBError(f"{ERROR_DYNAMODB_OPERATION_FAILED}: {error_message}")

        except Exception as e:
            logger.error(
                "Unexpected error during item creation",
                job_id=agent_state.get("job_id"),
                error=str(e),
                table=table_name,
                stack_trace=traceback.format_exc(),
            )
            raise


@with_error_context("update item with backup")
def update_item_with_backup(
    job_id: str, table_name: str, job_context_id: Optional[str] = None
) -> None:
    """
    Update DynamoDB item with backup of original data.

    Args:
        job_id: The primary key of the item to update.
        table_name: The name of the DynamoDB table.
        job_context_id: Optional job context for operation tracking.

    Raises:
        DynamoDBError: If backup operation fails.
    """
    context_id = job_context_id or f"backup-{job_id}"

    with operation_context("update_item_with_backup", context_id):
        try:
            logger.info(
                "Creating backup for DynamoDB item", job_id=job_id, table=table_name
            )

            dynamodb = boto3.resource(AWS_SERVICE_DYNAMODB, region_name=REGION)
            table = dynamodb.Table(table_name)

            response = table.get_item(Key={DB_FIELD_JOB_ID: job_id})

            if "Item" not in response:
                logger.warning(
                    "Item not found for backup", job_id=job_id, table=table_name
                )
                raise DynamoDBError(
                    f"Item with job_id {job_id} not found in table {table_name}"
                )

            item = response["Item"]
            backup_data = copy.deepcopy(item)

            # Remove existing backup to avoid nested backups
            if DB_FIELD_BACKUP in backup_data:
                del backup_data[DB_FIELD_BACKUP]

            item[DB_FIELD_BACKUP] = backup_data

            response = table.put_item(Item=item)

            logger.info(
                "Item backup created successfully",
                job_id=job_id,
                table=table_name,
                backup_keys=list(backup_data.keys()),
            )

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"]["Message"]
            logger.error(
                "DynamoDB client error during backup",
                job_id=job_id,
                error_code=error_code,
                error_message=error_message,
                table=table_name,
            )
            raise DynamoDBError(f"{ERROR_DYNAMODB_OPERATION_FAILED}: {error_message}")

        except Exception as e:
            logger.error(
                "Unexpected error during backup creation",
                job_id=job_id,
                error=str(e),
                table=table_name,
                stack_trace=traceback.format_exc(),
            )
            raise


@with_error_context("fetch results")
def fetch_results(job_id: str, table_name: str) -> Dict[str, Any]:
    """
    Fetch results from DynamoDB with proper error handling.

    Args:
        job_id: The job ID to fetch results for.
        table_name: The DynamoDB table name.

    Returns:
        Dictionary containing job results or status.

    Raises:
        DynamoDBError: If fetch operation fails.
    """
    try:
        logger.info("Fetching job results", job_id=job_id, table=table_name)

        dynamodb = boto3.resource(AWS_SERVICE_DYNAMODB, region_name=REGION)
        table = dynamodb.Table(table_name)

        response = table.get_item(Key={DB_FIELD_JOB_ID: job_id})

        if "Item" in response:
            logger.info("Job results found", job_id=job_id, table=table_name)
            return {
                "job_id": job_id,
                "state": "Found",
                "item": convert_decimals(response["Item"]),
            }
        else:
            logger.warning("Job results not found", job_id=job_id, table=table_name)
            return {"job_id": job_id, "state": "Not Found", "item": None}

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]
        logger.error(
            "DynamoDB client error during fetch",
            job_id=job_id,
            error_code=error_code,
            error_message=error_message,
            table=table_name,
        )
        raise DynamoDBError(f"{ERROR_DYNAMODB_OPERATION_FAILED}: {error_message}")

    except Exception as e:
        logger.error(
            "Unexpected error during fetch",
            job_id=job_id,
            error=str(e),
            table=table_name,
        )
        raise


# ============================================================================
# S3 OPERATIONS
# ============================================================================


@with_error_context("parse S3 image to base64")
def parse_s3_image_to_base64(bucket_name: str, object_key: str) -> Optional[str]:
    """
    Download image from S3 and convert to base64.

    Args:
        bucket_name: S3 bucket name.
        object_key: S3 object key.

    Returns:
        Base64 encoded image string or None if operation failed.

    Raises:
        S3Error: If S3 operation fails.
    """
    try:
        logger.info("Converting S3 image to base64", bucket=bucket_name, key=object_key)

        s3_client = boto3.client(AWS_SERVICE_S3, region_name=REGION)

        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        image_content = response["Body"].read()

        base64_encoded = base64.b64encode(image_content).decode("utf-8")

        logger.info(
            "S3 image converted to base64 successfully",
            bucket=bucket_name,
            key=object_key,
            encoded_size=len(base64_encoded),
        )

        return base64_encoded

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]

        if error_code == "NoSuchKey":
            logger.error(
                "S3 object not found",
                bucket=bucket_name,
                key=object_key,
                error_code=error_code,
            )
            raise S3Error(
                f"The object {object_key} does not exist in bucket {bucket_name}"
            )
        elif error_code == "NoSuchBucket":
            logger.error(
                "S3 bucket not found", bucket=bucket_name, error_code=error_code
            )
            raise S3Error(f"The bucket {bucket_name} does not exist")
        else:
            logger.error(
                "S3 client error",
                bucket=bucket_name,
                key=object_key,
                error_code=error_code,
                error_message=error_message,
            )
            raise S3Error(f"{ERROR_S3_OPERATION_FAILED}: {error_message}")

    except Exception as e:
        logger.error(
            "Unexpected error during S3 operation",
            bucket=bucket_name,
            key=object_key,
            error=str(e),
        )
        raise


# ============================================================================
# AI MODEL UTILITIES
# ============================================================================


def _retry_with_structure(
    model: ChatBedrockConverse, response: BaseMessage, struct: ChatBedrockConverse
) -> BaseMessage:
    """
    Retry AI model response with structured output.

    Args:
        model: Main AI model instance.
        response: Original response to restructure.
        struct: Structured output model.

    Returns:
        Structured response message.
    """
    try:
        logger.debug("Retrying with structured output")

        human_structure = HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": "Convert the <response> into a structured output",
                },
            ]
        )

        reasoning = response.content[0].get("reasoning_content", {}).get("text", None)
        struct_message = [structure_prompt(reasoning), human_structure]
        model_with_tools = model.with_structured_output(struct)

        result = model_with_tools.invoke(struct_message)

        logger.debug("Structured output retry successful")
        return result

    except Exception as e:
        logger.error("Error during structured output retry", error=str(e))
        raise


def handle_asset_error(
    model: ChatBedrockConverse, struct: ChatBedrockConverse, thinking: bool = True
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """
    Decorator to handle asset processing errors with optional retry logic.

    Args:
        model: Main AI model instance.
        struct: Structured output model.
        thinking: Whether to retry with structured output on error.

    Returns:
        Decorator function for error handling.
    """

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        def wrapper(response: BaseMessage, *args: P.args, **kwargs: P.kwargs) -> R:
            try:
                logger.debug("Processing asset response", function=func.__name__)
                result = func(response, *args, **kwargs)
                logger.debug("Asset processing successful", function=func.__name__)
                return result

            except Exception as e:
                logger.error(
                    "Asset processing error",
                    function=func.__name__,
                    error=str(e),
                    thinking_enabled=thinking,
                )

                if thinking:
                    logger.info(
                        "Attempting structured output retry", function=func.__name__
                    )
                    try:
                        return _retry_with_structure(model, response, struct)
                    except Exception as retry_error:
                        logger.error(
                            "Structured output retry failed",
                            function=func.__name__,
                            retry_error=str(retry_error),
                        )
                        raise ThreatModelingError(
                            f"Asset processing failed after retry: {str(retry_error)}"
                        )
                else:
                    raise ThreatModelingError(f"Asset processing failed: {str(e)}")

        return wrapper

    return decorator
