import base64
import copy
import datetime
import decimal
import hashlib
import json
import os
import uuid
import boto3
from aws_lambda_powertools import Logger, Tracer
from botocore.config import Config
from botocore.exceptions import ClientError
from exceptions.exceptions import (
    InternalError,
    NotFoundError,
    UnauthorizedError,
    ConflictError,
)
from utils.utils import create_dynamodb_item

STATE = os.environ.get("JOB_STATUS_TABLE")
FUNCTION = os.environ.get("THREAT_MODELING_LAMBDA")
AGENT_CORE_RUNTIME = os.environ.get("THREAT_MODELING_AGENT")
AGENT_TABLE = os.environ.get("AGENT_STATE_TABLE")
AGENT_TRAIL_TABLE = os.environ.get("AGENT_TRAIL_TABLE")
SHARING_TABLE = os.environ.get("SHARING_TABLE")
ARCHITECTURE_BUCKET = os.environ.get("ARCHITECTURE_BUCKET")
REGION = os.environ.get("REGION")
dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")
s3_client = boto3.client("s3")
agent_core_client = boto3.client("bedrock-agentcore")


s3_pre = boto3.client(
    "s3",
    region_name=REGION,
    endpoint_url=f"https://s3.{REGION}.amazonaws.com",
    config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
)
LOG = Logger(serialize_stacktrace=False)
tracer = Tracer()

table = dynamodb.Table(STATE)
trail_table = dynamodb.Table(AGENT_TRAIL_TABLE)


def convert_decimals(obj):
    """Recursively converts Decimal to float or int in a dictionary."""
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, decimal.Decimal):
        return (
            int(obj) if obj % 1 == 0 else float(obj)
        )  # Convert to int if it's a whole number
    else:
        return obj


def generate_random_uuid():
    return str(uuid.uuid4())


def calculate_content_hash(data):
    """
    Calculate a hash of the threat model content to detect actual changes.

    This excludes metadata fields like timestamps, lock info, etc. and only
    hashes the actual threat model content (threats, assets, flows, etc.)

    Parameters:
    data (dict): The threat model data

    Returns:
    str: SHA256 hash of the content
    """
    # Extract only the content fields that matter for change detection
    content_fields = {
        "description": data.get("description"),
        "assumptions": data.get("assumptions"),
        "threat_list": data.get("threat_list"),
        "assets": data.get("assets"),
        "system_architecture": data.get("system_architecture"),
    }

    # Convert to JSON string with sorted keys for consistent hashing
    content_json = json.dumps(content_fields, sort_keys=True, default=str)

    # Calculate SHA256 hash
    return hashlib.sha256(content_json.encode("utf-8")).hexdigest()


def delete_s3_object(object_key, bucket_name=ARCHITECTURE_BUCKET):
    """
    Delete an object from an S3 bucket

    Parameters:
    bucket_name (str): Name of the S3 bucket
    object_key (str): Key/path of the object to delete

    Returns:
    dict: Response from S3 delete operation
    """
    try:
        s3_client = boto3.client("s3")
        response = s3_client.delete_object(Bucket=bucket_name, Key=object_key)
        return response

    except ClientError as e:
        print(f"Error deleting object {object_key} from bucket {bucket_name}: {e}")
        raise


def update_dynamodb_item(
    table,
    key,
    update_attrs,
    owner,
    locked_attributes=["owner", "s3_location", "job_id"],
):
    """
    Update an item in DynamoDB table with owner validation and attribute locking

    Parameters:
    table_name (str): Name of the DynamoDB table
    key (dict): Primary key of the item to update
    update_attrs (dict): Attributes to update and their new values
    owner (str): Owner attempting to update the item
    locked_attributes (list): List of attribute names that should not change
    """

    # Remove locked attributes from update_attrs
    update_attrs = {k: v for k, v in update_attrs.items() if k not in locked_attributes}

    # Create expression attribute names for reserved words
    expression_names = {}
    for attr in locked_attributes + list(update_attrs.keys()):
        expression_names[f"#attr_{attr}"] = attr

    # Add owner to expression names
    expression_names["#owner"] = "owner"

    # Build condition expression to check owner and ensure locked attributes haven't changed
    owner_condition = "#owner = :current_owner"
    locked_conditions = [
        f"attribute_not_exists(#attr_{attr}) OR #attr_{attr} = :old_{attr}"
        for attr in locked_attributes
    ]
    condition_expression = owner_condition + " AND " + " AND ".join(locked_conditions)

    try:
        # Get current values for locked attributes
        current_item = table.get_item(Key=key)["Item"]
        expression_values = {
            ":current_owner": owner,  # Add owner check
            **{f":old_{attr}": current_item[attr] for attr in locked_attributes},
        }

        # Add update values
        for i, (attr, value) in enumerate(update_attrs.items()):
            expression_values[f":val{i}"] = value

        # Build update expression using expression attribute names
        update_expression = "SET " + ", ".join(
            [f"#attr_{k} = :val{i}" for i, k in enumerate(update_attrs.keys())]
        )

        response = table.update_item(
            Key=key,
            UpdateExpression=update_expression,
            ConditionExpression=condition_expression,
            ExpressionAttributeValues=expression_values,
            ExpressionAttributeNames=expression_names,
            ReturnValues="ALL_NEW",
        )
        return convert_decimals(response.get("Attributes"))

    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise UnauthorizedError(
                "Update rejected: Owner validation failed or locked attributes cannot be modified"
            )
        else:
            print(f"Error updating item: {e}")
        raise


def get_all_by_owner(table, owner: str):
    """
    Retrieves all items from DynamoDB table that match the specified owner using the owner-job-index.

    Args:
        table: DynamoDB table object
        owner (str): Owner identifier to query for

    Returns:
        list: List of dictionary items matching the owner. Empty list if no matches found.

    Raises:
        InternalError: If DynamoDB query fails
    """
    try:
        response = table.query(
            IndexName="owner-job-index",
            KeyConditionExpression="#owner = :owner_value",
            ExpressionAttributeNames={"#owner": "owner"},
            ExpressionAttributeValues={":owner_value": owner},
        )
        return response.get("Items", [])
    except Exception as e:
        LOG.error(e)
        raise InternalError(e)


def delete_dynamodb_item(table, key, owner):
    """
    Delete an item from DynamoDB table only if owner matches

    Parameters:
    table (boto3.resource.Table): DynamoDB table resource
    key (dict): Primary key of the item to delete
    owner (str): Owner attempting to delete the item
    """
    try:
        # Create condition expression to check owner
        condition_expression = "#owner = :owner"

        response = table.delete_item(
            Key=key,
            ConditionExpression=condition_expression,
            ExpressionAttributeNames={"#owner": "owner"},
            ExpressionAttributeValues={":owner": owner},
        )
        return response

    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise UnauthorizedError("Delete rejected: Owner validation failed")
        else:
            print(f"Error deleting item: {e}")
        raise


@tracer.capture_method
def invoke_lambda(owner, payload):
    s3_location = payload.get("s3_location")
    iteration = payload.get("iteration")
    reasoning = payload.get("reasoning", 0)
    instructions = payload.get("instructions", None)
    is_replay = payload.get("replay", False)

    if is_replay:
        id = payload.get("id")
    else:
        id = generate_random_uuid()

    description = payload.get("description", " ")
    assumptions = payload.get("assumptions", [])
    title = payload.get("title", " ")
    session_id = str(uuid.uuid4())
    LOG.info(f"Agent invoked with session: {session_id}")

    try:
        # If this is a replay, create backup BEFORE starting the agent
        if is_replay:
            agent_table = dynamodb.Table(AGENT_TABLE)

            # Get current item
            response = agent_table.get_item(Key={"job_id": id})

            if "Item" in response:
                item = response["Item"]
                backup_data = copy.deepcopy(item)

                # Remove existing backup to avoid nested backups
                if "backup" in backup_data:
                    del backup_data["backup"]

                # Set the backup
                item["backup"] = backup_data

                # Update the item with backup
                agent_table.put_item(Item=item)

                LOG.info(f"Backup created for job_id: {id} before replay")
            else:
                LOG.warning(f"Item not found for backup during replay: {id}")

        agent_core_client.invoke_agent_runtime(
            agentRuntimeArn=AGENT_CORE_RUNTIME,
            runtimeSessionId=session_id,
            payload=json.dumps(
                {
                    "input": {
                        "s3_location": s3_location,
                        "id": id,
                        "reasoning": reasoning,
                        "iteration": iteration,
                        "description": description,
                        "assumptions": assumptions,
                        "owner": owner,
                        "title": title,
                        "replay": is_replay,
                        "instructions": instructions,
                    }
                }
            ),
        )

        agent_state = {
            "job_id": id,
            "s3_location": s3_location,
            "owner": owner,
            "title": title,
            "retry": reasoning,
        }

        if not is_replay:
            create_dynamodb_item(agent_state, AGENT_TABLE)

        # Store execution_owner to track who initiated this execution
        item = {
            "id": id,
            "state": "START",
            "owner": owner,
            "session_id": session_id,
            "execution_owner": owner,
        }
        table.put_item(Item=item)

        return {"id": id}
    except Exception as e:
        LOG.error(e)
        raise InternalError(e)


@tracer.capture_method
def check_status(job_id):
    try:
        # Attempt to get the item from the DynamoDB table
        response = table.get_item(Key={"id": job_id})

        # Check if the item exists
        if "Item" in response:
            item = response["Item"]
            status = item.get("state", "Unknown")
            retry = item.get("retry", 0)
            detail = item.get("detail")
            session_id = item.get("session_id")
            execution_owner = item.get("execution_owner")

            result = {
                "id": job_id,
                "state": status,
                "retry": int(retry),
                "session_id": session_id,
            }

            # Only include detail if it exists
            if detail is not None:
                result["detail"] = detail

            # Include execution_owner if it exists
            if execution_owner is not None:
                result["execution_owner"] = execution_owner

            return result
        else:
            return {"id": job_id, "state": "Not Found"}

    except Exception as e:
        print(e)
        raise InternalError(e)


@tracer.capture_method
def check_trail(job_id):
    try:
        # Attempt to get the item from the DynamoDB table
        response = trail_table.get_item(Key={"id": job_id})

        # Check if the item exists
        if "Item" in response:
            # Assuming there's a 'status' field in your DynamoDB item
            assets = response["Item"].get("assets", "")
            flows = response["Item"].get("flows", "")
            gaps = response["Item"].get("gap", [])
            threats = response["Item"].get("threats", [])
            return {
                "id": job_id,
                "assets": assets,
                "flows": flows,
                "gaps": gaps,
                "threats": threats,
            }
        else:
            return {"id": job_id}

    except Exception as e:
        print(e)
        raise InternalError(e)


@tracer.capture_method
def fetch_results(job_id, user_id=None):
    table = dynamodb.Table(AGENT_TABLE)

    try:
        response = table.get_item(Key={"job_id": job_id})

        if "Item" in response:
            item = convert_decimals(response["Item"])

            # Add access information if user_id is provided
            if user_id and user_id != "MCP":
                from services.collaboration_service import check_access
                from exceptions.exceptions import UnauthorizedError

                access_info = check_access(job_id, user_id)

                # Check if user has access
                if not access_info["has_access"]:
                    LOG.warning(
                        f"User {user_id} does not have access to threat model {job_id}"
                    )
                    raise UnauthorizedError(
                        "You do not have access to this threat model"
                    )

                # Add access information to response
                item["is_owner"] = access_info["is_owner"]
                item["access_level"] = access_info["access_level"]

            # Ensure last_modified_at exists for version tracking
            if "last_modified_at" not in item:
                # Set initial timestamp if not present
                current_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
                item["last_modified_at"] = current_time

            return {
                "job_id": job_id,
                "state": "Found",
                "item": item,
            }
        else:
            return {"job_id": job_id, "state": "Not Found", "item": None}

    except UnauthorizedError:
        raise
    except Exception as e:
        LOG.error(e)
        raise InternalError(e)


@tracer.capture_method
def update_results(job_id, payload, owner, lock_token=None):
    table = dynamodb.Table(AGENT_TABLE)

    try:
        # For non-MCP users, check access and verify lock
        if owner != "MCP":
            from utils.authorization import require_access
            from services.lock_service import get_lock_status

            # Check if user has edit access (will raise UnauthorizedError if not)
            require_access(job_id, owner, required_level="EDIT")

            # Verify user holds valid lock (everyone including owner must have lock)
            lock_status = get_lock_status(job_id)

            if not lock_status.get("locked"):
                LOG.warning(f"No active lock for threat model {job_id}")
                raise UnauthorizedError("You must acquire a lock before editing")

            if lock_status.get("user_id") != owner:
                LOG.warning(
                    f"Lock for {job_id} held by {lock_status.get('user_id')}, not {owner}"
                )
                raise UnauthorizedError("Lock is held by another user")

            # Validate lock token if provided
            if lock_token and lock_status.get("lock_token") != lock_token:
                LOG.warning(f"Invalid lock token for threat model {job_id}")
                raise UnauthorizedError("Invalid lock token")

            # Get current server state for conflict detection and hash comparison
            current_item_response = table.get_item(Key={"job_id": job_id})
            current_item = None
            if "Item" in current_item_response:
                current_item = current_item_response["Item"]

            # Check for version conflict
            client_timestamp = payload.get("client_last_modified_at")
            if client_timestamp and current_item:
                server_timestamp = current_item.get("last_modified_at")

                # Compare timestamps - if server is newer, there's a conflict
                if server_timestamp and server_timestamp > client_timestamp:
                    LOG.warning(
                        f"Version conflict for {job_id}: server={server_timestamp}, client={client_timestamp}"
                    )
                    raise ConflictError(
                        {
                            "message": "The threat model has been modified by another user",
                            "server_timestamp": server_timestamp,
                            "client_timestamp": client_timestamp,
                            "server_state": convert_decimals(current_item),
                        }
                    )

            # Calculate content hash to detect actual changes
            new_content_hash = calculate_content_hash(payload)

            # Get previous content hash
            previous_content_hash = (
                current_item.get("content_hash") if current_item else None
            )

            # Only update timestamp and last_modified_by if content actually changed
            if new_content_hash != previous_content_hash:
                current_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
                payload["last_modified_by"] = owner
                payload["last_modified_at"] = current_time
                payload["content_hash"] = new_content_hash
                LOG.info(f"Content changed for {job_id}, updating timestamp")
            else:
                # Content hasn't changed, preserve existing timestamp
                if current_item:
                    payload["last_modified_at"] = current_item.get("last_modified_at")
                    payload["last_modified_by"] = current_item.get(
                        "last_modified_by", owner
                    )
                payload["content_hash"] = new_content_hash
                LOG.info(f"No content changes for {job_id}, preserving timestamp")

            # Remove client_last_modified_at from payload before saving
            payload.pop("client_last_modified_at", None)

        key = {"job_id": job_id}
        return update_dynamodb_item(table, key, payload, owner)

    except (UnauthorizedError, ConflictError):
        raise
    except Exception as e:
        LOG.error(e)
        raise


@tracer.capture_method
def restore(job_id, owner):
    agent_table = dynamodb.Table(AGENT_TABLE)
    state_table = dynamodb.Table(STATE)

    try:
        response = agent_table.get_item(Key={"job_id": job_id}, ConsistentRead=True)

        if "Item" not in response:
            LOG.warning(f"Item {job_id} not found")
            raise NotFoundError

        item = response["Item"]

        # Check if user has access (owner or EDIT permission)
        if owner != "MCP":
            from utils.authorization import require_access

            # This will raise UnauthorizedError if user doesn't have access
            # For restore, we need at least EDIT access
            require_access(job_id, owner, required_level="EDIT")

        if "backup" not in item:
            LOG.warning(f"No backup found for job {job_id}")
            raise NotFoundError

        backup_data = item["backup"]
        response = agent_table.put_item(Item=backup_data)

        current_time = datetime.datetime.now(datetime.timezone.utc).isoformat()

        state_response = state_table.get_item(Key={"id": job_id})
        if "Item" in state_response:
            retry = state_response["Item"].get("retry", 0)
        else:
            retry = 0

        # Use the actual owner from the item, not the requester
        actual_owner = item.get("owner")

        state_table.put_item(
            Item={
                "id": job_id,
                "owner": actual_owner,
                "retry": retry,
                "state": "COMPLETE",
                "updated_at": current_time,
            }
        )

        return True
    except Exception as e:
        LOG.error(f"Failed to restore job {job_id}: {str(e)}")
        raise InternalError


def validate_pagination_params(limit, filter_mode):
    """
    Validate pagination parameters.

    Args:
        limit: Page size
        filter_mode: Filter mode

    Raises:
        ValueError: If parameters are invalid
    """
    # Validate page size
    valid_page_sizes = [10, 20, 50, 100]
    if limit not in valid_page_sizes:
        raise ValueError(f"Page size must be one of {valid_page_sizes}")

    # Validate filter mode
    valid_filters = ["owned", "shared", "all"]
    if filter_mode not in valid_filters:
        raise ValueError(f"Filter mode must be one of {valid_filters}")


def decode_cursor(cursor_str):
    """
    Decode and validate pagination cursor.

    Args:
        cursor_str: Base64-encoded JSON cursor string

    Returns:
        dict: Decoded cursor with 'owned', 'shared', and 'filter' keys

    Raises:
        ValueError: If cursor is invalid or malformed
    """
    if not cursor_str:
        return None

    try:
        # Decode base64
        decoded_bytes = base64.b64decode(cursor_str)
        cursor_data = json.loads(decoded_bytes.decode("utf-8"))

        # Validate cursor structure
        if not isinstance(cursor_data, dict):
            raise ValueError("Cursor must be a JSON object")

        # Extract keys (they may be None if that query is exhausted)
        owned_key = cursor_data.get("owned")
        shared_key = cursor_data.get("shared")
        filter_mode = cursor_data.get("filter", "all")

        return {"owned": owned_key, "shared": shared_key, "filter": filter_mode}
    except (base64.binascii.Error, json.JSONDecodeError, UnicodeDecodeError) as e:
        LOG.warning(f"Invalid cursor format: {e}")
        raise ValueError("Invalid pagination cursor")


def encode_cursor(owned_key, shared_key, filter_mode):
    """
    Encode pagination state into a cursor string.

    Args:
        owned_key: DynamoDB LastEvaluatedKey for owned query (or None)
        shared_key: DynamoDB LastEvaluatedKey for shared query (or None)
        filter_mode: Current filter mode ('owned', 'shared', or 'all')

    Returns:
        str: Base64-encoded cursor, or None if both keys are None
    """
    # If both keys are None, there's no next page
    if owned_key is None and shared_key is None:
        return None

    cursor_data = {"owned": owned_key, "shared": shared_key, "filter": filter_mode}

    # Encode to JSON then base64
    cursor_json = json.dumps(cursor_data, default=str)
    cursor_bytes = cursor_json.encode("utf-8")
    cursor_b64 = base64.b64encode(cursor_bytes).decode("utf-8")

    return cursor_b64


def query_owned_paginated(table, owner, limit, exclusive_start_key=None):
    """
    Query owned threat models with pagination.

    Args:
        table: DynamoDB table resource
        owner: User ID
        limit: Maximum number of items to return
        exclusive_start_key: DynamoDB key to start from (for pagination)

    Returns:
        dict: {
            'items': List of threat model items,
            'last_evaluated_key': DynamoDB key for next page (or None)
        }
    """
    try:
        query_params = {
            "IndexName": "owner-job-index",
            "KeyConditionExpression": "#owner = :owner_value",
            "ExpressionAttributeNames": {"#owner": "owner"},
            "ExpressionAttributeValues": {":owner_value": owner},
            "Limit": limit,
        }

        if exclusive_start_key:
            query_params["ExclusiveStartKey"] = exclusive_start_key

        response = table.query(**query_params)

        return {
            "items": response.get("Items", []),
            "last_evaluated_key": response.get("LastEvaluatedKey"),
        }
    except Exception as e:
        LOG.error(f"Error querying owned threat models: {e}")
        raise InternalError(e)


def query_shared_paginated(
    sharing_table, table, owner, limit, exclusive_start_key=None
):
    """
    Query shared threat models with pagination.

    Args:
        sharing_table: DynamoDB sharing table resource
        table: DynamoDB agent table resource
        owner: User ID
        limit: Maximum number of items to return
        exclusive_start_key: DynamoDB key to start from (for pagination)

    Returns:
        dict: {
            'items': List of threat model items with sharing info,
            'last_evaluated_key': DynamoDB key for next page (or None)
        }
    """
    try:
        query_params = {
            "IndexName": "user-index",
            "KeyConditionExpression": "#user_id = :user_id",
            "ExpressionAttributeNames": {"#user_id": "user_id"},
            "ExpressionAttributeValues": {":user_id": owner},
            "Limit": limit,
        }

        if exclusive_start_key:
            query_params["ExclusiveStartKey"] = exclusive_start_key

        sharing_response = sharing_table.query(**query_params)

        # Fetch full threat model details for each shared record
        shared_items = []
        for sharing_record in sharing_response.get("Items", []):
            threat_model_id = sharing_record["threat_model_id"]
            tm_response = table.get_item(Key={"job_id": threat_model_id})

            if "Item" in tm_response:
                item = tm_response["Item"]
                # Add access information
                item["is_owner"] = False
                item["access_level"] = sharing_record["access_level"]
                item["shared_by"] = sharing_record.get("shared_by")
                shared_items.append(item)

        return {
            "items": shared_items,
            "last_evaluated_key": sharing_response.get("LastEvaluatedKey"),
        }
    except Exception as e:
        LOG.error(f"Error querying shared threat models: {e}")
        raise InternalError(e)


@tracer.capture_method
def fetch_all(owner, limit=20, cursor=None, filter_mode="all"):
    """
    Fetch paginated threat models for a user.

    Args:
        owner: User ID
        limit: Number of items per page (default: 20)
        cursor: Pagination cursor (base64-encoded JSON)
        filter_mode: Filter mode - "owned", "shared", or "all" (default: "all")

    Returns:
        dict: {
            "catalogs": [...],
            "pagination": {
                "hasNextPage": bool,
                "cursor": str|None,
                "totalReturned": int
            }
        }
    """
    table = dynamodb.Table(AGENT_TABLE)
    sharing_table = dynamodb.Table(os.environ.get("SHARING_TABLE"))
    LOG.info(
        f"Fetching paginated items for owner: {owner}, limit: {limit}, filter: {filter_mode}"
    )

    try:
        # Validate pagination parameters
        validate_pagination_params(limit, filter_mode)

        # Decode cursor if provided
        cursor_data = None
        if cursor:
            try:
                cursor_data = decode_cursor(cursor)
                # Validate filter mode matches cursor
                if cursor_data["filter"] != filter_mode:
                    LOG.warning(
                        f"Filter mode mismatch: cursor={cursor_data['filter']}, requested={filter_mode}"
                    )
                    # Reset cursor if filter changed
                    cursor_data = None
            except ValueError as e:
                LOG.warning(f"Invalid cursor, resetting to first page: {e}")
                cursor_data = None

        owned_items = []
        shared_items = []
        owned_last_key = None
        shared_last_key = None

        # Query owned threat models if needed
        if filter_mode in ["owned", "all"]:
            owned_start_key = cursor_data.get("owned") if cursor_data else None
            owned_result = query_owned_paginated(table, owner, limit, owned_start_key)
            owned_items = owned_result["items"]
            owned_last_key = owned_result["last_evaluated_key"]

            # Add access information to owned items
            for item in owned_items:
                item["is_owner"] = True
                item["access_level"] = "OWNER"

        # Query shared threat models if needed
        if filter_mode in ["shared", "all"] and owner != "MCP":
            shared_start_key = cursor_data.get("shared") if cursor_data else None
            shared_result = query_shared_paginated(
                sharing_table, table, owner, limit, shared_start_key
            )
            shared_items = shared_result["items"]
            shared_last_key = shared_result["last_evaluated_key"]

        # Combine and sort results by timestamp (newest first)
        all_items = owned_items + shared_items
        all_items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        # Limit to requested page size after merging
        all_items = all_items[:limit]

        # Determine if there's a next page
        has_next_page = owned_last_key is not None or shared_last_key is not None

        # Encode cursor for next page
        next_cursor = None
        if has_next_page:
            next_cursor = encode_cursor(owned_last_key, shared_last_key, filter_mode)

        return {
            "catalogs": convert_decimals(all_items),
            "pagination": {
                "hasNextPage": has_next_page,
                "cursor": next_cursor,
                "totalReturned": len(all_items),
            },
        }
    except ValueError:
        # Invalid cursor - return error
        raise
    except Exception as e:
        LOG.error(e)
        raise


@tracer.capture_method
def delete_tm(job_id, owner, force_release=False):
    table = dynamodb.Table(AGENT_TABLE)
    sharing_table = dynamodb.Table(os.environ.get("SHARING_TABLE"))

    try:
        # For non-MCP users, check if user is owner
        if owner != "MCP":
            from utils.authorization import require_owner
            from services.lock_service import (
                get_lock_status,
                force_release_lock as force_lock_release,
            )

            # Verify user is owner
            require_owner(job_id, owner)

            # Check for active locks
            lock_status = get_lock_status(job_id)

            if lock_status.get("locked"):
                lock_holder = lock_status.get("user_id")

                # If lock is held by someone else and force_release is not requested
                if lock_holder != owner and not force_release:
                    LOG.warning(f"Cannot delete {job_id} - locked by {lock_holder}")
                    raise ConflictError(
                        f"Cannot delete threat model while it is locked by {lock_holder}. "
                        "Use force_release=true to override."
                    )

                # Force release the lock if requested
                if lock_holder != owner:
                    LOG.info(f"Force releasing lock for {job_id} before deletion")
                    force_lock_release(job_id, owner)

        # Check if there's an active execution and stop it
        status = check_status(job_id)
        if status.get("state") not in ["COMPLETE", "FAILED", "Not Found"]:
            # There's an active execution, try to stop it
            session_id = status.get("session_id")
            if session_id:
                try:
                    LOG.info(f"Stopping active execution for {job_id} before deletion")
                    # Use override_execution_owner=True to allow owner to stop executions started by others
                    delete_session(
                        job_id, session_id, owner, override_execution_owner=True
                    )
                except Exception as e:
                    LOG.warning(f"Failed to stop execution for {job_id}: {e}")
                    # Continue with deletion even if stop fails

        # Delete associated attack trees before deleting threat model
        try:
            from services.attack_tree_service import (
                delete_attack_trees_for_threat_model,
            )

            LOG.info(f"Deleting attack trees for threat model {job_id}")
            delete_attack_trees_for_threat_model(job_id, owner)
        except Exception as e:
            LOG.warning(f"Error deleting attack trees for {job_id}: {e}")
            # Continue with threat model deletion even if attack tree deletion fails

        key = {"job_id": job_id}
        object_key = fetch_results(job_id).get("item").get("s3_location")
        if not object_key:
            LOG.info(f"Object key not found for job_id: {job_id}")
            raise InternalError()

        # Delete from DynamoDB
        delete_dynamodb_item(table, key, owner)

        # Delete S3 object
        delete_s3_object(object_key)

        # Clean up sharing records if any exist
        if owner != "MCP":
            try:
                # Query all sharing records for this threat model
                sharing_response = sharing_table.query(
                    KeyConditionExpression="threat_model_id = :tm_id",
                    ExpressionAttributeValues={":tm_id": job_id},
                )

                # Delete all sharing records
                with sharing_table.batch_writer() as batch:
                    for item in sharing_response.get("Items", []):
                        batch.delete_item(
                            Key={
                                "threat_model_id": item["threat_model_id"],
                                "user_id": item["user_id"],
                            }
                        )

                LOG.info(
                    f"Deleted {len(sharing_response.get('Items', []))} sharing records for {job_id}"
                )
            except Exception as e:
                LOG.warning(f"Error cleaning up sharing records: {e}")
                # Continue with deletion even if sharing cleanup fails

        return {"job_id": job_id, "state": "Deleted"}
    except UnauthorizedError:
        raise
    except Exception as e:
        LOG.error(e)
        raise


@tracer.capture_method
def delete_session(job_id, session_id, owner, override_execution_owner=False):
    agent_table = dynamodb.Table(AGENT_TABLE)
    state_table = dynamodb.Table(STATE)

    try:
        # Security validation: query STATE table and verify ownership
        state_response = state_table.get_item(Key={"id": job_id})

        if "Item" not in state_response:
            LOG.warning(f"Job {job_id} not found")
            raise NotFoundError

        state_item = state_response["Item"]

        # Verify session_id and id (job_id) match
        if state_item.get("session_id") != session_id or state_item.get("id") != job_id:
            LOG.warning(f"Session validation failed for job {job_id}")
            raise NotFoundError

        # When override_execution_owner is True (called from delete_tm), verify threat model ownership instead
        if override_execution_owner:
            # Verify the caller is the threat model owner
            tm_owner = state_item.get("owner")
            if tm_owner != owner:
                LOG.warning(
                    f"Authorization failed: {owner} is not the owner of threat model {job_id}"
                )
                raise UnauthorizedError(
                    "You do not have permission to stop this threat modeling session. Only the threat model owner can stop it during deletion."
                )
            LOG.info(
                f"Override enabled: {owner} (threat model owner) stopping execution started by {state_item.get('execution_owner')}"
            )
        else:
            # Normal flow: verify execution_owner matches (only the user who started the execution can stop it)
            execution_owner = state_item.get("execution_owner", state_item.get("owner"))
            if execution_owner != owner:
                LOG.warning(
                    f"Authorization failed: {owner} did not initiate execution of job {job_id}, {execution_owner} did"
                )
                raise UnauthorizedError(
                    "You do not have permission to stop this threat modeling session. Only the user who started the execution can stop it."
                )

        try:
            response = agent_core_client.stop_runtime_session(
                runtimeSessionId=session_id, agentRuntimeArn=AGENT_CORE_RUNTIME
            )
            LOG.info(
                f"Session {session_id} stopped successfully with response code: {response['statusCode']}"
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ResourceNotFoundException":
                LOG.warning(f"Session {session_id} not found, proceeding with cleanup")
            else:
                raise

        key = {"job_id": job_id}
        item = fetch_results(job_id).get("item")
        object_key = item.get("s3_location")
        backup = item.get("backup")
        if not backup:
            if not object_key:
                LOG.info(f"Object key not found for job_id: {job_id}")
                raise InternalError()
            delete_dynamodb_item(agent_table, key, owner)
            delete_s3_object(object_key)
            return {"job_id": job_id, "state": "Deleted"}
        restore(job_id, owner)
        return {"job_id": job_id, "state": "Restored"}
    except Exception as e:
        LOG.error(e)
        raise


@tracer.capture_method
def generate_presigned_url(file_type="image/png", expiration=300):
    key = str(uuid.uuid4())
    try:
        response = s3_pre.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": ARCHITECTURE_BUCKET,
                "Key": key,
                "ContentType": file_type,
            },
            ExpiresIn=expiration,
            HttpMethod="PUT",
        )
    except Exception as e:
        LOG.error(e)
        raise InternalError(e)

    return {"presigned": response, "name": key}


def extract_threat_model_id_from_s3_location(s3_location: str) -> str:
    """
    Extract threat model ID from S3 location.

    NOTE: This function currently assumes s3_location IS the threat model ID,
    which is INCORRECT. The s3_location is a separate UUID for the S3 object.

    TODO: This needs to be refactored to accept threat_model_id directly
    instead of s3_location. The API should be changed to:
    - Accept threat_model_id as input
    - Look up the threat model record to get s3_location
    - Generate presigned URL for that s3_location

    This would be more efficient (direct get vs scan) and more logical.

    Args:
        s3_location: The S3 key/path (currently incorrectly assumed to be UUID)

    Returns:
        str: The threat model ID (UUID)

    Raises:
        ValueError: If s3_location is empty or not a valid UUID format
        NotFoundError: If the ID cannot be extracted
    """
    if not s3_location or not s3_location.strip():
        raise ValueError("S3 location cannot be empty")

    # S3 location is the UUID itself (INCORRECT ASSUMPTION)
    threat_model_id = s3_location.strip()

    # Validate UUID format
    try:
        uuid.UUID(threat_model_id)
    except (ValueError, AttributeError):
        LOG.warning(f"Invalid UUID format for S3 location: {s3_location}")
        raise NotFoundError(f"Invalid threat model ID format: {s3_location}")

    return threat_model_id


@tracer.capture_method
def generate_presigned_download_url(threat_model_id, user_id=None, expiration=300):
    """
    Generate a presigned URL for downloading a threat model's architecture diagram from S3.

    Args:
        threat_model_id (str): The threat model ID (job_id)
        user_id (str, optional): User ID requesting the presigned URL. If provided, authorization is checked.
        expiration (int, optional): Time in seconds until the presigned URL expires. Defaults to 300.

    Returns:
        str: Presigned URL that can be used to download the object

    Raises:
        UnauthorizedError: If user doesn't have access to the threat model
        NotFoundError: If threat model not found or has no s3_location
        InternalError: If there is an error generating the presigned URL
    """
    # If user_id is provided, check authorization
    if user_id:
        from utils.authorization import require_access

        # Verify user has at least READ_ONLY access
        require_access(threat_model_id, user_id, required_level="READ_ONLY")

    # Look up the threat model to get the s3_location
    try:
        agent_table = dynamodb.Table(AGENT_TABLE)
        response = agent_table.get_item(Key={"job_id": threat_model_id})

        if "Item" not in response:
            raise NotFoundError(f"Threat model {threat_model_id} not found")

        s3_location = response["Item"].get("s3_location")
        if not s3_location:
            raise NotFoundError(
                f"Threat model {threat_model_id} has no architecture diagram"
            )

    except NotFoundError:
        raise
    except Exception as e:
        LOG.error(f"Error fetching threat model {threat_model_id}: {e}")
        raise InternalError(f"Failed to fetch threat model: {str(e)}")

    # Generate presigned URL for the S3 object
    try:
        response = s3_pre.generate_presigned_url(
            "get_object",
            Params={"Bucket": ARCHITECTURE_BUCKET, "Key": s3_location},
            ExpiresIn=expiration,
            HttpMethod="GET",
        )
    except Exception as e:
        LOG.error(e)
        raise InternalError(e)

    return response


def _batch_fetch_threat_models(threat_model_ids: list) -> dict:
    """
    Batch fetch threat models from DynamoDB.
    
    Args:
        threat_model_ids: List of threat model IDs to fetch
        
    Returns:
        Dict mapping threat_model_id -> threat model item
    """
    if not threat_model_ids:
        return {}
    
    try:
        # DynamoDB batch_get_item supports up to 100 items per request
        # Split into chunks if needed
        chunk_size = 100
        all_items = {}
        
        for i in range(0, len(threat_model_ids), chunk_size):
            chunk = threat_model_ids[i:i + chunk_size]
            
            response = dynamodb.batch_get_item(
                RequestItems={
                    AGENT_TABLE: {
                        'Keys': [{'job_id': tm_id} for tm_id in chunk]
                    }
                }
            )
            
            # Map items by job_id
            for item in response.get('Responses', {}).get(AGENT_TABLE, []):
                all_items[item['job_id']] = item
            
            # Handle unprocessed keys (throttling)
            unprocessed = response.get('UnprocessedKeys', {})
            if unprocessed:
                LOG.warning(f"Unprocessed keys in batch_get_item: {len(unprocessed)} items")
        
        return all_items
    except Exception as e:
        LOG.error(f"Error batch fetching threat models: {e}")
        return {}


def _batch_fetch_sharing_records(threat_model_ids: list, user_id: str) -> dict:
    """
    Batch fetch sharing records from DynamoDB.
    
    Args:
        threat_model_ids: List of threat model IDs
        user_id: User ID to check sharing for
        
    Returns:
        Dict mapping threat_model_id -> sharing record (if exists)
    """
    if not threat_model_ids:
        return {}
    
    try:
        # DynamoDB batch_get_item supports up to 100 items per request
        chunk_size = 100
        all_items = {}
        
        for i in range(0, len(threat_model_ids), chunk_size):
            chunk = threat_model_ids[i:i + chunk_size]
            
            response = dynamodb.batch_get_item(
                RequestItems={
                    SHARING_TABLE: {
                        'Keys': [
                            {'threat_model_id': tm_id, 'user_id': user_id}
                            for tm_id in chunk
                        ]
                    }
                }
            )
            
            # Map items by threat_model_id
            for item in response.get('Responses', {}).get(SHARING_TABLE, []):
                all_items[item['threat_model_id']] = item
        
        return all_items
    except Exception as e:
        LOG.error(f"Error batch fetching sharing records: {e}")
        return {}


def _check_access_cached(
    threat_model_id: str, user_id: str, threat_models_cache: dict, sharing_cache: dict
) -> dict:
    """
    Check access using pre-fetched cache data.
    
    Args:
        threat_model_id: Threat model ID to check
        user_id: User ID requesting access
        threat_models_cache: Pre-fetched threat models
        sharing_cache: Pre-fetched sharing records
        
    Returns:
        Dict with {has_access: bool, access_level: str, is_owner: bool}
        
    Raises:
        NotFoundError: If threat model not found
    """
    # Check if threat model exists in cache
    if threat_model_id not in threat_models_cache:
        raise NotFoundError(f"Threat model {threat_model_id} not found")
    
    item = threat_models_cache[threat_model_id]
    owner = item.get("owner")
    
    # Check if user is the owner
    if owner == user_id:
        return {"has_access": True, "is_owner": True, "access_level": "OWNER"}
    
    # Check if user is a collaborator (from cache)
    if threat_model_id in sharing_cache:
        return {
            "has_access": True,
            "is_owner": False,
            "access_level": sharing_cache[threat_model_id].get("access_level"),
        }
    
    # No access
    return {"has_access": False, "is_owner": False, "access_level": None}


def generate_presigned_download_url_with_auth(
    threat_model_id: str, user_id: str, expiration: int = 300
) -> str:
    """
    Generate presigned URL with authorization check.

    This function always performs authorization checks before generating
    the presigned URL. It verifies the user has at least READ_ONLY access
    to the threat model.

    Args:
        threat_model_id: The threat model ID (job_id)
        user_id: User requesting access
        expiration: URL expiration time in seconds (default: 300)

    Returns:
        str: Presigned URL for downloading the architecture diagram

    Raises:
        UnauthorizedError: If user lacks access to the threat model
        NotFoundError: If threat model not found
        InternalError: If presigned URL generation fails
    """
    # Generate presigned URL with authorization
    # The generate_presigned_download_url function will handle both authorization and S3 lookup
    return generate_presigned_download_url(
        threat_model_id, user_id=user_id, expiration=expiration
    )


def generate_presigned_download_urls_batch(
    threat_model_ids: list, user_id: str, expiration: int = 300
) -> list:
    """
    Generate multiple presigned URLs with authorization checks.

    Optimized to use batch DynamoDB reads for better performance.
    Processes requests in parallel for performance. Each threat model is
    processed independently - authorization failures for one threat model do not
    prevent processing of other threat models.

    Args:
        threat_model_ids: List of threat model IDs (job_ids)
        user_id: User requesting access
        expiration: URL expiration time in seconds (default: 300)

    Returns:
        List of dicts with structure:
        {
            "threat_model_id": str,
            "presigned_url": str (if successful),
            "error": str (if failed),
            "success": bool
        }

    Note:
        Results are returned in the same order as input threat_model_ids.
        Partial failures are supported - some items may succeed while others fail.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    # Batch fetch all threat models and sharing records upfront
    threat_models_cache = _batch_fetch_threat_models(threat_model_ids)
    sharing_cache = _batch_fetch_sharing_records(threat_model_ids, user_id)

    def process_single_threat_model(threat_model_id: str, index: int) -> dict:
        """
        Process a single threat model and return result with index for ordering.
        Uses cached data for authorization and threat model lookup.

        Args:
            threat_model_id: Threat model ID to process
            index: Original index in input list for maintaining order

        Returns:
            dict: Result with index for ordering
        """
        try:
            # Check authorization using cached data
            access_info = _check_access_cached(
                threat_model_id, user_id, threat_models_cache, sharing_cache
            )
            
            if not access_info["has_access"]:
                raise UnauthorizedError("You do not have access to this threat model")
            
            # Get s3_location from cached threat model
            if threat_model_id not in threat_models_cache:
                raise NotFoundError(f"Threat model {threat_model_id} not found")
            
            s3_location = threat_models_cache[threat_model_id].get("s3_location")
            if not s3_location:
                raise NotFoundError(
                    f"Threat model {threat_model_id} has no architecture diagram"
                )
            
            # Generate presigned URL (fast, no I/O)
            presigned_url = s3_pre.generate_presigned_url(
                "get_object",
                Params={"Bucket": ARCHITECTURE_BUCKET, "Key": s3_location},
                ExpiresIn=expiration,
                HttpMethod="GET",
            )
            
            return {
                "index": index,
                "threat_model_id": threat_model_id,
                "presigned_url": presigned_url,
                "success": True,
            }
        except UnauthorizedError as e:
            LOG.warning(f"Authorization failed for {threat_model_id}: {e}")
            return {
                "index": index,
                "threat_model_id": threat_model_id,
                "error": f"Unauthorized: {str(e)}",
                "success": False,
            }
        except NotFoundError as e:
            LOG.warning(f"Not found error for {threat_model_id}: {e}")
            return {
                "index": index,
                "threat_model_id": threat_model_id,
                "error": f"Not Found: {str(e)}",
                "success": False,
            }
        except ValueError as e:
            LOG.warning(f"Validation error for {threat_model_id}: {e}")
            return {
                "index": index,
                "threat_model_id": threat_model_id,
                "error": f"Invalid: {str(e)}",
                "success": False,
            }
        except Exception as e:
            LOG.error(f"Unexpected error processing {threat_model_id}: {e}")
            return {
                "index": index,
                "threat_model_id": threat_model_id,
                "error": f"Internal Error: {str(e)}",
                "success": False,
            }

    # Process all threat models in parallel
    results_with_index = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        # Submit all tasks with their original index
        future_to_index = {
            executor.submit(process_single_threat_model, tm_id, idx): idx
            for idx, tm_id in enumerate(threat_model_ids)
        }

        # Collect results as they complete
        for future in as_completed(future_to_index):
            try:
                result = future.result()
                results_with_index.append(result)
            except Exception as e:
                # This should not happen as exceptions are caught in process_single_threat_model
                idx = future_to_index[future]
                LOG.error(f"Unexpected error in future for index {idx}: {e}")
                results_with_index.append(
                    {
                        "index": idx,
                        "threat_model_id": threat_model_ids[idx],
                        "error": f"Internal Error: {str(e)}",
                        "success": False,
                    }
                )

    # Sort results by original index to maintain input order
    results_with_index.sort(key=lambda x: x["index"])

    # Remove index from results before returning
    results = []
    for result in results_with_index:
        result_copy = result.copy()
        del result_copy["index"]
        results.append(result_copy)

    return results
