from aws_lambda_powertools import Logger, Tracer
import boto3
import json
import uuid
from exceptions.exceptions import InternalError
from botocore.exceptions import ClientError
from exceptions.exceptions import UnauthorizedError
import os

STATE = os.environ.get("JOB_STATUS_TABLE")
FUNCTION = os.environ.get("THREAT_MODELING_LAMBDA")
AGENT_TABLE = os.environ.get("AGENT_STATE_TABLE")
ARCHITECTURE_BUCKET = os.environ.get("ARCHITECTURE_BUCKET")
REGION = os.environ.get("REGION")
dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")
s3_client = boto3.client("s3")
import decimal
from botocore.config import Config


s3_pre = boto3.client(
    "s3",
    region_name=REGION,
    endpoint_url=f"https://s3.{REGION}.amazonaws.com",
    config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
)
LOG = Logger(serialize_stacktrace=False)
tracer = Tracer()

table = dynamodb.Table(STATE)


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
    reasoning = payload.get("reasoning", False)
    if payload.get("replay", False):
        id = payload.get("id")
    else:
        id = generate_random_uuid()
    description = payload.get("description", " ")
    assumptions = payload.get("assumptions", [])
    title = payload.get("title", " ")
    try:
        lambda_client.invoke(
            FunctionName=FUNCTION,
            InvocationType="Event",
            Payload=json.dumps(
                {
                    "s3_location": s3_location,
                    "id": id,
                    "reasoning": reasoning,
                    "iteration": iteration,
                    "description": description,
                    "assumptions": assumptions,
                    "owner": owner,
                    "title": title,
                    "replay": payload.get("replay", False),
                }
            ),
        )
        item = {"id": id, "state": "START", "owner": owner}
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
            # Assuming there's a 'status' field in your DynamoDB item
            status = response["Item"].get("state", "Unknown")
            retry = response["Item"].get("retry", 0)
            return {"id": job_id, "state": status, "retry": int(retry)}
        else:
            return {"id": job_id, "state": "Not Found"}

    except Exception as e:
        print(e)
        raise InternalError(e)


@tracer.capture_method
def fetch_results(job_id):
    table = dynamodb.Table(AGENT_TABLE)  # Replace with your actual table name

    try:
        response = table.get_item(Key={"job_id": job_id})

        if "Item" in response:
            return {
                "job_id": job_id,
                "state": "Found",
                "item": convert_decimals(
                    response["Item"]
                ),  # Convert Decimals before returning
            }
        else:
            return {"job_id": job_id, "state": "Not Found", "item": None}

    except Exception as e:
        Logger.info(e)
        raise InternalError(e)


@tracer.capture_method
def update_results(job_id, payload, owner):
    table = dynamodb.Table(AGENT_TABLE)

    try:
        key = {"job_id": job_id}
        return update_dynamodb_item(table, key, payload, owner)

    except Exception as e:
        LOG.error(e)
        raise


@tracer.capture_method
def fetch_all(owner):
    table = dynamodb.Table(AGENT_TABLE)
    LOG.info(f"Fetching all items for owner: {owner} and table: {table}")
    try:
        items = get_all_by_owner(table, owner)
        return {"catalogs": convert_decimals(items)}
    except Exception as e:
        LOG.error(e)
        raise


@tracer.capture_method
def delete_tm(job_id, owner):
    table = dynamodb.Table(AGENT_TABLE)

    try:
        key = {"job_id": job_id}
        object_key = fetch_results(job_id).get("item").get("s3_location")
        if not object_key:
            LOG.info(f"Object key not found for job_id: {job_id}")
            raise InternalError(e)
        delete_dynamodb_item(table, key, owner)
        delete_s3_object(object_key)
        return {"job_id": job_id, "state": "Deleted"}
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


@tracer.capture_method
def generate_presigned_download_url(object_name, expiration=300):
    """
    Generate a presigned URL for downloading an object from S3.

    Args:
        object_name (str): The key/path of the object in the S3 bucket
        expiration (int, optional): Time in seconds until the presigned URL expires. Defaults to 300.

    Returns:
        str: Presigned URL that can be used to download the object

    Raises:
        InternalError: If there is an error generating the presigned URL
    """
    try:
        response = s3_pre.generate_presigned_url(
            "get_object",
            Params={"Bucket": ARCHITECTURE_BUCKET, "Key": object_name},
            ExpiresIn=expiration,
            HttpMethod="GET",
        )
    except Exception as e:
        LOG.error(e)
        raise InternalError(e)

    return response
