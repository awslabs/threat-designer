"""Service for Spaces — document collections indexed in a Bedrock Knowledge Base."""

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import boto3
from aws_lambda_powertools import Logger, Tracer
from exceptions.exceptions import InternalError, NotFoundError, UnauthorizedError

SPACES_TABLE = os.environ.get("SPACES_TABLE")
SPACE_SHARING_TABLE = os.environ.get("SPACE_SHARING_TABLE")
SPACE_DOCUMENTS_TABLE = os.environ.get("SPACE_DOCUMENTS_TABLE")
SPACES_BUCKET = os.environ.get("SPACES_BUCKET")
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
KB_DATA_SOURCE_ID = os.environ.get("KB_DATA_SOURCE_ID", "")
PRESIGNED_URL_EXPIRY = int(os.environ.get("PRESIGNED_URL_EXPIRY", "900"))
USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")

_AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

dynamodb = boto3.resource("dynamodb")
cognito_client = boto3.client("cognito-idp")
s3_client = boto3.client(
    "s3",
    region_name=_AWS_REGION,
    endpoint_url=f"https://s3.{_AWS_REGION}.amazonaws.com",
)
bedrock_agent_client = boto3.client("bedrock-agent")

LOG = Logger(serialize_stacktrace=False)
tracer = Tracer()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _check_space_owner(space_id: str, user_id: str) -> Dict[str, Any]:
    """Return space item if user is owner, else raise UnauthorizedError."""
    table = dynamodb.Table(SPACES_TABLE)
    response = table.get_item(Key={"space_id": space_id})
    if "Item" not in response:
        raise NotFoundError(f"Space {space_id} not found")
    item = response["Item"]
    if item.get("owner") != user_id:
        raise UnauthorizedError("Only the space owner can perform this operation")
    return item


@tracer.capture_method
def check_space_access(space_id: str, user_id: str) -> Dict[str, Any]:
    """Return access info for user on space. Raises NotFoundError / UnauthorizedError."""
    table = dynamodb.Table(SPACES_TABLE)
    response = table.get_item(Key={"space_id": space_id})
    if "Item" not in response:
        raise NotFoundError(f"Space {space_id} not found")
    item = response["Item"]

    if item.get("owner") == user_id:
        return {"has_access": True, "is_owner": True, "access_level": "OWNER"}

    sharing_table = dynamodb.Table(SPACE_SHARING_TABLE)
    share_resp = sharing_table.get_item(Key={"space_id": space_id, "user_id": user_id})
    if "Item" in share_resp:
        return {
            "has_access": True,
            "is_owner": False,
            "access_level": share_resp["Item"].get("access_level", "READ_ONLY"),
        }

    raise UnauthorizedError("You do not have access to this space")


@tracer.capture_method
def create_space(owner: str, name: str, description: str = "") -> Dict[str, Any]:
    table = dynamodb.Table(SPACES_TABLE)
    space_id = str(uuid.uuid4())
    now = _now()
    item = {
        "space_id": space_id,
        "owner": owner,
        "name": name,
        "description": description,
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=item)
    LOG.debug("Space created", space_id=space_id, owner=owner)
    return item


@tracer.capture_method
def get_space(space_id: str, user_id: str) -> Dict[str, Any]:
    access = check_space_access(space_id, user_id)
    table = dynamodb.Table(SPACES_TABLE)
    response = table.get_item(Key={"space_id": space_id})
    item = dict(response["Item"])
    item["is_owner"] = access.get("is_owner", False)
    return item


@tracer.capture_method
def list_spaces(user_id: str) -> List[Dict[str, Any]]:
    """Return all spaces owned by or shared with user_id."""
    spaces_table = dynamodb.Table(SPACES_TABLE)
    sharing_table = dynamodb.Table(SPACE_SHARING_TABLE)

    # Owned spaces — scan with filter (no GSI needed for MVP)
    owned_resp = spaces_table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr("owner").eq(user_id)
    )
    owned = owned_resp.get("Items", [])
    owned_ids = {s["space_id"] for s in owned}

    # Shared spaces — query sharing table by user_id GSI
    try:
        shared_resp = sharing_table.query(
            IndexName="user_id-index",
            KeyConditionExpression=boto3.dynamodb.conditions.Key("user_id").eq(user_id),
        )
        shared_space_ids = [
            item["space_id"]
            for item in shared_resp.get("Items", [])
            if item["space_id"] not in owned_ids
        ]
        shared_spaces = []
        for sid in shared_space_ids:
            r = spaces_table.get_item(Key={"space_id": sid})
            if "Item" in r:
                shared_spaces.append(r["Item"])
    except Exception:
        shared_spaces = []

    return owned + shared_spaces


@tracer.capture_method
def update_space(
    space_id: str, user_id: str, name: Optional[str], description: Optional[str]
) -> Dict[str, Any]:
    _check_space_owner(space_id, user_id)
    table = dynamodb.Table(SPACES_TABLE)
    updates = {"updated_at": _now()}
    if name is not None:
        updates["name"] = name
    if description is not None:
        updates["description"] = description

    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
    expr_names = {f"#{k}": k for k in updates}
    expr_values = {f":{k}": v for k, v in updates.items()}

    response = table.update_item(
        Key={"space_id": space_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    return response["Attributes"]


@tracer.capture_method
def delete_space(space_id: str, user_id: str) -> None:
    _check_space_owner(space_id, user_id)
    table = dynamodb.Table(SPACES_TABLE)
    table.delete_item(Key={"space_id": space_id})
    LOG.debug("Space deleted", space_id=space_id)


@tracer.capture_method
def generate_document_upload_url(
    space_id: str, user_id: str, filename: str, file_type: str
) -> Dict[str, Any]:
    """Generate a presigned S3 PUT URL for a space document."""
    _check_space_owner(space_id, user_id)
    document_id = str(uuid.uuid4())
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    s3_key = f"spaces/{space_id}/{document_id}.{ext}"

    presigned_url = s3_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": SPACES_BUCKET, "Key": s3_key, "ContentType": file_type},
        ExpiresIn=PRESIGNED_URL_EXPIRY,
    )
    return {
        "document_id": document_id,
        "presigned_url": presigned_url,
        "s3_key": s3_key,
    }


@tracer.capture_method
def confirm_document_upload(
    space_id: str, user_id: str, document_id: str, s3_key: str, filename: str
) -> Dict[str, Any]:
    """Record document in DDB, write KB metadata sidecar, trigger KB ingestion."""
    _check_space_owner(space_id, user_id)
    now = _now()
    item = {
        "space_id": space_id,
        "document_id": document_id,
        "filename": filename,
        "s3_key": s3_key,
        "status": "INGESTING",
        "created_at": now,
        "updated_at": now,
    }
    docs_table = dynamodb.Table(SPACE_DOCUMENTS_TABLE)
    docs_table.put_item(Item=item)

    # Write metadata sidecar for KB filtering
    metadata_key = f"{s3_key}.metadata.json"
    import json

    metadata = {"metadataAttributes": {"space_id": space_id}}
    try:
        s3_client.put_object(
            Bucket=SPACES_BUCKET,
            Key=metadata_key,
            Body=json.dumps(metadata),
            ContentType="application/json",
        )
    except Exception as e:
        LOG.warning("Failed to write KB metadata sidecar", error=str(e), s3_key=s3_key)

    # Trigger Bedrock KB ingestion
    if KNOWLEDGE_BASE_ID and KB_DATA_SOURCE_ID:
        try:
            bedrock_agent_client.start_ingestion_job(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                dataSourceId=KB_DATA_SOURCE_ID,
            )
            LOG.debug(
                "KB ingestion triggered", space_id=space_id, document_id=document_id
            )
        except Exception as e:
            LOG.warning("Failed to start KB ingestion job", error=str(e))
    else:
        LOG.warning(
            "KB ingestion skipped — KNOWLEDGE_BASE_ID or KB_DATA_SOURCE_ID not set"
        )

    return item


@tracer.capture_method
def list_documents(space_id: str, user_id: str) -> List[Dict[str, Any]]:
    check_space_access(space_id, user_id)
    docs_table = dynamodb.Table(SPACE_DOCUMENTS_TABLE)
    response = docs_table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("space_id").eq(space_id)
    )
    items = response.get("Items", [])

    # Resolve INGESTING status against completed KB ingestion jobs
    ingesting = [d for d in items if d.get("status") == "INGESTING"]
    if ingesting and KNOWLEDGE_BASE_ID and KB_DATA_SOURCE_ID:
        try:
            jobs_resp = bedrock_agent_client.list_ingestion_jobs(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                dataSourceId=KB_DATA_SOURCE_ID,
                filters=[
                    {"attribute": "STATUS", "operator": "EQ", "values": ["COMPLETE"]}
                ],
                sortBy={"attribute": "STARTED_AT", "order": "DESCENDING"},
                maxResults=1,
            )
            summaries = jobs_resp.get("ingestionJobSummaries", [])
            if summaries:
                last_complete_at = summaries[0].get("updatedAt")  # datetime
                if last_complete_at is not None:
                    if last_complete_at.tzinfo is None:
                        last_complete_at = last_complete_at.replace(tzinfo=timezone.utc)
                    now = _now()
                    for doc in ingesting:
                        doc_created = doc.get("created_at", "")
                        try:
                            doc_dt = datetime.fromisoformat(doc_created)
                            if doc_dt.tzinfo is None:
                                doc_dt = doc_dt.replace(tzinfo=timezone.utc)
                            if doc_dt <= last_complete_at:
                                docs_table.update_item(
                                    Key={
                                        "space_id": space_id,
                                        "document_id": doc["document_id"],
                                    },
                                    UpdateExpression="SET #s = :s, updated_at = :u",
                                    ExpressionAttributeNames={"#s": "status"},
                                    ExpressionAttributeValues={
                                        ":s": "READY",
                                        ":u": now,
                                    },
                                )
                                doc["status"] = "READY"
                        except (ValueError, TypeError):
                            pass
        except Exception as e:
            LOG.warning("Failed to resolve ingestion status", error=str(e))

    return items


@tracer.capture_method
def delete_document(space_id: str, user_id: str, document_id: str) -> None:
    _check_space_owner(space_id, user_id)
    docs_table = dynamodb.Table(SPACE_DOCUMENTS_TABLE)
    resp = docs_table.get_item(Key={"space_id": space_id, "document_id": document_id})
    if "Item" not in resp:
        raise NotFoundError(f"Document {document_id} not found in space {space_id}")
    item = resp["Item"]
    s3_key = item.get("s3_key")

    # Delete from S3 + metadata sidecar
    if s3_key:
        try:
            s3_client.delete_object(Bucket=SPACES_BUCKET, Key=s3_key)
            s3_client.delete_object(Bucket=SPACES_BUCKET, Key=f"{s3_key}.metadata.json")
        except Exception as e:
            LOG.warning("S3 delete failed", error=str(e), s3_key=s3_key)

    docs_table.delete_item(Key={"space_id": space_id, "document_id": document_id})

    # Re-trigger ingestion to sync KB
    if KNOWLEDGE_BASE_ID and KB_DATA_SOURCE_ID:
        try:
            bedrock_agent_client.start_ingestion_job(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                dataSourceId=KB_DATA_SOURCE_ID,
            )
        except Exception as e:
            LOG.warning("Failed to start KB ingestion after delete", error=str(e))


@tracer.capture_method
def share_space(space_id: str, owner: str, user_ids: List[str]) -> List[Dict[str, Any]]:
    """Grant READ_ONLY access to a list of users."""
    _check_space_owner(space_id, owner)
    sharing_table = dynamodb.Table(SPACE_SHARING_TABLE)
    now = _now()
    results = []
    for uid in user_ids:
        if uid == owner:
            continue
        item = {
            "space_id": space_id,
            "user_id": uid,
            "access_level": "READ_ONLY",
            "granted_at": now,
        }
        sharing_table.put_item(Item=item)
        results.append(item)
    return results


@tracer.capture_method
def get_space_sharing(space_id: str, user_id: str) -> List[Dict[str, Any]]:
    _check_space_owner(space_id, user_id)
    sharing_table = dynamodb.Table(SPACE_SHARING_TABLE)
    response = sharing_table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("space_id").eq(space_id)
    )
    items = response.get("Items", [])

    if not USER_POOL_ID:
        return items

    for item in items:
        uid = item.get("user_id", "")
        try:
            resp = cognito_client.list_users(
                UserPoolId=USER_POOL_ID,
                Filter=f'sub = "{uid}"',
                Limit=1,
            )
            users = resp.get("Users", [])
            if users:
                for attr in users[0].get("Attributes", []):
                    if attr["Name"] == "email":
                        item["email"] = attr["Value"]
                    elif attr["Name"] == "name":
                        item["name"] = attr["Value"]
        except Exception as e:
            LOG.warning("Failed to lookup user in Cognito", user_id=uid, error=str(e))

    return items


@tracer.capture_method
def remove_space_sharing(space_id: str, owner: str, target_user_id: str) -> None:
    _check_space_owner(space_id, owner)
    sharing_table = dynamodb.Table(SPACE_SHARING_TABLE)
    sharing_table.delete_item(Key={"space_id": space_id, "user_id": target_user_id})
