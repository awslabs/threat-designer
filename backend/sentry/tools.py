import os
import json
from decimal import Decimal
from typing import List

import boto3
from botocore.exceptions import ClientError
from langchain_core.tools import tool
from langgraph.types import interrupt

from data_model import Threat


# Environment variables
ATTACK_TREE_TABLE = os.environ.get("ATTACK_TREE_TABLE")


class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles Decimal types from DynamoDB."""

    def default(self, obj):
        if isinstance(obj, Decimal):
            # Convert to int if it's a whole number, otherwise float
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super().default(obj)


def generate_attack_tree_id(threat_model_id: str, threat_name: str) -> str:
    """
    Generate a deterministic attack tree ID from threat model ID and threat name.

    This function creates a composite key by combining the threat_model_id with
    a normalized version of the threat_name. The normalization process converts
    the name to lowercase, replaces spaces with underscores, and removes special
    characters to ensure the ID is URL-safe and consistent.

    Args:
        threat_model_id: UUID of the parent threat model
        threat_name: Name of the threat

    Returns:
        Composite key in format: {threat_model_id}_{normalized_threat_name}

    Examples:
        >>> generate_attack_tree_id("abc-123", "SQL Injection Attack")
        'abc-123_sql_injection_attack'
        >>> generate_attack_tree_id("xyz-789", "Cross-Site Scripting (XSS)")
        'xyz-789_cross-site_scripting_xss'
    """
    # Normalize threat name: lowercase and replace spaces with underscores
    normalized_name = threat_name.strip().lower().replace(" ", "_")

    # Remove any characters that aren't ASCII alphanumeric, underscore, or hyphen
    normalized_name = "".join(
        c for c in normalized_name if (c.isascii() and c.isalnum()) or c in ("_", "-")
    )

    return f"{threat_model_id}_{normalized_name}"


@tool(
    name_or_callable="add_threats",
    description=""" Used to add new threats to the existing catalog""",
)
def add_threats(threats: List[Threat]):
    # Properly serialize the data using json.dumps
    payload_data = [threat.model_dump() for threat in threats]

    # Ensure all strings are properly escaped
    json_safe_payload = json.loads(json.dumps(payload_data))

    response = interrupt(
        {
            "payload": json_safe_payload,
            "tool_name": "add_threats",
        }
    )
    errors = response.get("args", {}).get("error", None)
    if response.get("type") == "add_threats" and not errors:
        return [{"name": threat.name} for threat in threats]
    else:
        raise Exception("Failed to add threats")


@tool(
    name_or_callable="edit_threats",
    description=""" Used to update threats from the existing catalog """,
)
def edit_threats(threats: List[Threat]):
    response = interrupt(
        {
            "payload": [threat.model_dump() for threat in threats],
            "tool_name": "edit_threats",
        }
    )
    errors = response.get("args", {}).get("error", None)
    if response["type"] == "edit_threats" and not errors:
        return [{"name": threat.name} for threat in threats]
    else:
        raise Exception("Failed to edit threats")


@tool(
    name_or_callable="delete_threats",
    description=""" Used to delete threats from the  existing catalog """,
)
def delete_threats(threats: List[Threat]):
    response = interrupt(
        {
            "payload": [threat.model_dump() for threat in threats],
            "tool_name": "delete_threats",
        }
    )
    errors = response.get("args", {}).get("error", None)
    if response["type"] == "delete_threats" and not errors:
        return {
            "response": [{"name": threat.name} for threat in threats],
        }
    else:
        raise Exception("Failed to delete threats")


@tool(
    name_or_callable="get_attack_tree",
    description="""Retrieves the attack tree for a specific threat. Use this when you need to analyze attack paths, understand how an attacker might achieve a goal, or discuss the hierarchical structure of potential attacks for a threat.""",
)
def get_attack_tree(threat_model_id: str, threat_name: str) -> str:
    """
    Retrieve attack tree data for a specific threat.

    Args:
        threat_model_id: The ID of the threat model containing the threat
        threat_name: The name of the threat to get the attack tree for

    Returns:
        JSON string containing attack_tree_id, threat_name, nodes, and edges
    """
    # Input validation
    if not threat_model_id or not threat_model_id.strip():
        raise ValueError("threat_model_id is required")

    if not threat_name or not threat_name.strip():
        raise ValueError("threat_name is required")

    # Generate the attack tree ID
    attack_tree_id = generate_attack_tree_id(threat_model_id, threat_name)

    # Query DynamoDB
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(ATTACK_TREE_TABLE)

    try:
        response = table.get_item(Key={"attack_tree_id": attack_tree_id})
    except ClientError as e:
        raise Exception(
            f"Failed to fetch attack tree: {e.response['Error']['Message']}"
        )

    # Handle not found case - return informational message, not an error
    if "Item" not in response:
        return json.dumps(
            {
                "status": "not_found",
                "message": f"No attack tree exists for threat: {threat_name}",
                "threat_name": threat_name,
            }
        )

    # Extract attack tree data
    item = response["Item"]
    attack_tree_data = item.get("attack_tree_data", {})

    result = {
        "attack_tree_id": attack_tree_id,
        "threat_name": threat_name,
        "nodes": attack_tree_data.get("nodes", []),
        "edges": attack_tree_data.get("edges", []),
    }

    return json.dumps(result, cls=DecimalEncoder)
