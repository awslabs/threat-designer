"""
Attack Tree Service Layer

This module provides functions for managing attack tree generation, storage, and retrieval.
It handles authorization, agent invocation, status tracking, and data transformation.
"""

import json
import os
import uuid
from typing import Any, Dict, List, Optional, Tuple

import boto3
from aws_lambda_powertools import Logger, Tracer
from botocore.exceptions import ClientError
from pydantic import ValidationError
from exceptions.exceptions import (
    InternalError,
    NotFoundError,
    UnauthorizedError,
)
from utils.authorization import require_access, require_owner

# Environment variables
STATE_TABLE = os.environ.get("JOB_STATUS_TABLE")
AGENT_TABLE = os.environ.get("AGENT_STATE_TABLE")
ATTACK_TREE_TABLE = os.environ.get("ATTACK_TREE_TABLE")
AGENT_CORE_RUNTIME = os.environ.get("THREAT_MODELING_AGENT")

# AWS clients
dynamodb = boto3.resource("dynamodb")
agent_core_client = boto3.client("bedrock-agentcore")

LOG = Logger(serialize_stacktrace=False)
tracer = Tracer()

# Allowed node types for validation
ALLOWED_NODE_TYPES = {"root", "and-gate", "or-gate", "leaf-attack"}


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

    Raises:
        ValueError: If threat_model_id or threat_name is invalid

    Examples:
        >>> generate_attack_tree_id("abc-123", "SQL Injection Attack")
        'abc-123_sql_injection_attack'
        >>> generate_attack_tree_id("xyz-789", "Cross-Site Scripting (XSS)")
        'xyz-789_cross_site_scripting_xss'
    """
    # Validate threat_model_id
    if not threat_model_id or not isinstance(threat_model_id, str):
        raise ValueError("threat_model_id must be a non-empty string")

    if not threat_model_id.strip():
        raise ValueError("threat_model_id must be a non-empty string")

    # Validate threat_name
    if not threat_name or not isinstance(threat_name, str):
        raise ValueError("threat_name must be a non-empty string")

    if not threat_name.strip():
        raise ValueError("threat_name must be a non-empty string")

    # Normalize threat name: lowercase and replace spaces with underscores
    normalized_name = threat_name.strip().lower().replace(" ", "_")

    # Remove any characters that aren't ASCII alphanumeric, underscore, or hyphen
    # Using ASCII-only for URL safety and consistency
    normalized_name = "".join(
        c for c in normalized_name if (c.isascii() and c.isalnum()) or c in ("_", "-")
    )

    # Validate that normalized name has at least one alphanumeric character
    if not normalized_name or not any(c.isalnum() for c in normalized_name):
        raise ValueError("threat_name must contain at least one alphanumeric character")

    # Create composite key
    composite_key = f"{threat_model_id}_{normalized_name}"

    LOG.info(
        "Generated composite attack tree ID",
        extra={
            "threat_model_id": threat_model_id,
            "threat_name": threat_name,
            "normalized_name": normalized_name,
            "composite_key": composite_key,
        },
    )

    return composite_key


def _update_status_to_failed(attack_tree_id: str, error_message: str) -> None:
    """
    Update attack tree status to failed with error message.

    This is a helper function used internally to mark attack tree generation
    as failed when errors occur. It handles DynamoDB errors gracefully.

    Args:
        attack_tree_id: ID of the attack tree
        error_message: Error message to store
    """
    try:
        state_table = dynamodb.Table(STATE_TABLE)
        state_table.update_item(
            Key={"id": attack_tree_id},
            UpdateExpression="SET #state = :state, #error = :error",
            ExpressionAttributeNames={
                "#state": "state",
                "#error": "error",
            },
            ExpressionAttributeValues={
                ":state": "failed",
                ":error": error_message,
            },
        )
        LOG.info(
            f"Updated attack tree status to failed",
            extra={
                "attack_tree_id": attack_tree_id,
                "error_message": error_message,
            },
        )
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        LOG.error(
            f"Failed to update status to failed: {error_code}",
            extra={
                "attack_tree_id": attack_tree_id,
                "original_error": error_message,
            },
        )
        # Don't raise - this is a best-effort operation
    except Exception as e:
        LOG.error(
            f"Unexpected error updating status to failed: {str(e)}",
            extra={
                "attack_tree_id": attack_tree_id,
                "original_error": error_message,
            },
        )
        # Don't raise - this is a best-effort operation


# Allowed values for categorical fields
ALLOWED_ATTACK_PHASES = {
    "Reconnaissance",
    "Resource Development",
    "Initial Access",
    "Execution",
    "Persistence",
    "Privilege Escalation",
    "Defense Evasion",
    "Credential Access",
    "Discovery",
    "Lateral Movement",
    "Collection",
    "Command and Control",
    "Exfiltration",
    "Impact",
}

ALLOWED_SEVERITY_LEVELS = {"low", "medium", "high", "critical"}
ALLOWED_SKILL_LEVELS = {"novice", "intermediate", "expert"}
ALLOWED_GATE_TYPES = {"AND", "OR"}


def validate_attack_tree_structure(
    attack_tree_data: Dict[str, Any],
) -> Tuple[bool, Optional[str]]:
    """
    Validate attack tree structure against schema and business rules.

    This function performs comprehensive validation including:
    - Schema validation (nodes and edges structure)
    - Node type validation
    - Required fields validation
    - Data type validation
    - Business rule validation (single root, unique IDs, valid references)

    Args:
        attack_tree_data: Attack tree data dictionary with 'nodes' and 'edges'

    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if validation passes, False otherwise
        - error_message: None if valid, descriptive error message if invalid
    """
    try:
        # Validate top-level structure
        if not isinstance(attack_tree_data, dict):
            return False, "Attack tree data must be a dictionary"

        if "nodes" not in attack_tree_data:
            return False, "Attack tree data must contain 'nodes' array"

        if "edges" not in attack_tree_data:
            return False, "Attack tree data must contain 'edges' array"

        nodes = attack_tree_data.get("nodes", [])
        edges = attack_tree_data.get("edges", [])

        if not isinstance(nodes, list):
            return False, "'nodes' must be an array"

        if not isinstance(edges, list):
            return False, "'edges' must be an array"

        if len(nodes) == 0:
            return False, "Attack tree must contain at least one node"

        # Validate nodes
        node_ids = set()
        root_count = 0

        for idx, node in enumerate(nodes):
            # Validate node structure
            if not isinstance(node, dict):
                return False, f"Node at index {idx} must be a dictionary"

            if "id" not in node:
                return False, f"Node at index {idx} is missing required field 'id'"

            if "type" not in node:
                return False, f"Node at index {idx} is missing required field 'type'"

            if "data" not in node:
                return False, f"Node at index {idx} is missing required field 'data'"

            node_id = node["id"]
            node_type = node["type"]
            node_data = node["data"]

            # Validate node ID uniqueness
            if node_id in node_ids:
                return False, f"Duplicate node ID found: {node_id}"
            node_ids.add(node_id)

            # Validate node type
            if node_type not in ALLOWED_NODE_TYPES:
                return (
                    False,
                    f"Node {node_id} has invalid type '{node_type}'. Allowed types: {', '.join(ALLOWED_NODE_TYPES)}",
                )

            # Count root nodes
            if node_type == "root":
                root_count += 1

            # Validate node data
            if not isinstance(node_data, dict):
                return False, f"Node {node_id} data must be a dictionary"

            if "label" not in node_data:
                return False, f"Node {node_id} is missing required field 'data.label'"

            # Type-specific validation
            validation_result = _validate_node_data(node_id, node_type, node_data)
            if not validation_result[0]:
                return validation_result

        # Validate exactly one root node
        if root_count == 0:
            return False, "Attack tree must have exactly one root node"
        if root_count > 1:
            return (
                False,
                f"Attack tree must have exactly one root node, found {root_count}",
            )

        # Validate root is first node
        if nodes[0]["type"] != "root":
            return False, "Root node must be the first node in the nodes array"

        # Validate edges
        for idx, edge in enumerate(edges):
            if not isinstance(edge, dict):
                return False, f"Edge at index {idx} must be a dictionary"

            if "id" not in edge:
                return False, f"Edge at index {idx} is missing required field 'id'"

            if "source" not in edge:
                return False, f"Edge at index {idx} is missing required field 'source'"

            if "target" not in edge:
                return False, f"Edge at index {idx} is missing required field 'target'"

            edge_id = edge["id"]
            source = edge["source"]
            target = edge["target"]

            # Validate edge references valid nodes
            if source not in node_ids:
                return (
                    False,
                    f"Edge {edge_id} references non-existent source node '{source}'",
                )

            if target not in node_ids:
                return (
                    False,
                    f"Edge {edge_id} references non-existent target node '{target}'",
                )

            # Validate edge type if present
            if "type" in edge and edge["type"] not in [
                "smoothstep",
                "default",
                "straight",
                "step",
            ]:
                return False, f"Edge {edge_id} has invalid type '{edge['type']}'"

        return True, None

    except Exception as e:
        LOG.error(f"Unexpected error during validation: {e}")
        return False, f"Validation error: {str(e)}"


def _validate_node_data(
    node_id: str, node_type: str, node_data: Dict[str, Any]
) -> Tuple[bool, Optional[str]]:
    """
    Validate node-specific data based on node type.

    Args:
        node_id: ID of the node being validated
        node_type: Type of the node
        node_data: Data dictionary for the node

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        if node_type == "root":
            # Root nodes only need label
            return True, None

        elif node_type in ["and-gate", "or-gate"]:
            # Gate nodes need gateType
            if "gateType" not in node_data:
                return (
                    False,
                    f"Gate node {node_id} is missing required field 'data.gateType'",
                )

            gate_type = node_data["gateType"]
            if gate_type not in ALLOWED_GATE_TYPES:
                return (
                    False,
                    f"Gate node {node_id} has invalid gateType '{gate_type}'. Allowed: {', '.join(ALLOWED_GATE_TYPES)}",
                )

            # Validate gate type matches node type
            expected_gate_type = node_type.split("-")[0].upper()
            if gate_type != expected_gate_type:
                return (
                    False,
                    f"Gate node {node_id} type '{node_type}' does not match gateType '{gate_type}'",
                )

        elif node_type == "leaf-attack":
            # Leaf attack nodes have required fields
            required_fields = ["attackChainPhase", "impactSeverity"]

            for field in required_fields:
                if field not in node_data:
                    return (
                        False,
                        f"Leaf attack node {node_id} is missing required field 'data.{field}'",
                    )

            # Validate attackChainPhase
            attack_phase = node_data["attackChainPhase"]
            if attack_phase not in ALLOWED_ATTACK_PHASES:
                return (
                    False,
                    f"Leaf attack node {node_id} has invalid attackChainPhase '{attack_phase}'",
                )

            # Validate impactSeverity
            impact_severity = node_data["impactSeverity"]
            if impact_severity not in ALLOWED_SEVERITY_LEVELS:
                return (
                    False,
                    f"Leaf attack node {node_id} has invalid impactSeverity '{impact_severity}'. Allowed: {', '.join(ALLOWED_SEVERITY_LEVELS)}",
                )

            # Validate optional fields if present
            if "likelihood" in node_data:
                likelihood = node_data["likelihood"]
                if likelihood not in ALLOWED_SEVERITY_LEVELS:
                    return (
                        False,
                        f"Leaf attack node {node_id} has invalid likelihood '{likelihood}'. Allowed: {', '.join(ALLOWED_SEVERITY_LEVELS)}",
                    )

            if "skillLevel" in node_data:
                skill_level = node_data["skillLevel"]
                if skill_level not in ALLOWED_SKILL_LEVELS:
                    return (
                        False,
                        f"Leaf attack node {node_id} has invalid skillLevel '{skill_level}'. Allowed: {', '.join(ALLOWED_SKILL_LEVELS)}",
                    )

            # Validate list fields if present
            if "prerequisites" in node_data:
                if not isinstance(node_data["prerequisites"], list):
                    return (
                        False,
                        f"Leaf attack node {node_id} field 'prerequisites' must be an array",
                    )

            if "techniques" in node_data:
                if not isinstance(node_data["techniques"], list):
                    return (
                        False,
                        f"Leaf attack node {node_id} field 'techniques' must be an array",
                    )

        return True, None

    except Exception as e:
        LOG.error(f"Error validating node {node_id} data: {e}")
        return False, f"Node {node_id} validation error: {str(e)}"


def validate_react_flow_format(
    attack_tree_data: Dict[str, Any],
) -> Tuple[bool, Optional[str]]:
    """
    Validate that attack tree data is in proper React Flow format.

    This is a lighter validation focused on React Flow compatibility,
    used before returning data to the client.

    Args:
        attack_tree_data: Attack tree data dictionary

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        # Check basic structure
        if not isinstance(attack_tree_data, dict):
            return False, "Attack tree data must be a dictionary"

        if "nodes" not in attack_tree_data or "edges" not in attack_tree_data:
            return False, "Attack tree data must contain 'nodes' and 'edges' arrays"

        nodes = attack_tree_data["nodes"]
        edges = attack_tree_data["edges"]

        if not isinstance(nodes, list) or not isinstance(edges, list):
            return False, "Both 'nodes' and 'edges' must be arrays"

        if len(nodes) == 0:
            return False, "Attack tree must contain at least one node"

        # Validate each node has required React Flow fields
        for node in nodes:
            if not isinstance(node, dict):
                return False, "All nodes must be dictionaries"

            if "id" not in node or "type" not in node or "data" not in node:
                return False, "All nodes must have 'id', 'type', and 'data' fields"

            if not isinstance(node["data"], dict):
                return (
                    False,
                    f"Node {node.get('id', 'unknown')} data must be a dictionary",
                )

            if "label" not in node["data"]:
                return (
                    False,
                    f"Node {node.get('id', 'unknown')} data must have 'label' field",
                )

        # Validate each edge has required React Flow fields
        for edge in edges:
            if not isinstance(edge, dict):
                return False, "All edges must be dictionaries"

            if "id" not in edge or "source" not in edge or "target" not in edge:
                return False, "All edges must have 'id', 'source', and 'target' fields"

        return True, None

    except Exception as e:
        LOG.error(f"Error validating React Flow format: {e}")
        return False, f"React Flow format validation error: {str(e)}"


def convert_decimals(obj):
    """Recursively converts Decimal to float or int in a dictionary."""
    import decimal

    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, decimal.Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    else:
        return obj


@tracer.capture_method
def invoke_attack_tree_agent(
    owner: str,
    threat_model_id: str,
    threat_name: str,
    threat_description: str,
    reasoning: int = 0,
) -> Dict[str, Any]:
    """
    Invoke the attack tree generation agent for a specific threat.

    Args:
        owner: User ID of the requester
        threat_model_id: ID of the parent threat model
        threat_name: Name of the threat to generate attack tree for
        threat_description: Description of the threat
        reasoning: Reasoning level (0-3)

    Returns:
        Dict with attack_tree_id and status

    Raises:
        UnauthorizedError: If user doesn't have EDIT access
        NotFoundError: If threat model doesn't exist
        InternalError: If agent invocation fails
    """
    attack_tree_id = None
    try:
        # Validate user has EDIT access to the threat model
        require_access(threat_model_id, owner, required_level="EDIT")

        # Generate deterministic attack tree ID from composite key
        attack_tree_id = generate_attack_tree_id(threat_model_id, threat_name)

        # Check if attack tree already exists and is in progress or completed
        state_table = dynamodb.Table(STATE_TABLE)
        try:
            existing_status = state_table.get_item(Key={"id": attack_tree_id})
            if "Item" in existing_status:
                current_state = existing_status["Item"].get("state")
                if current_state in ["in_progress", "completed"]:
                    LOG.info(
                        f"Attack tree already exists with status: {current_state}",
                        extra={
                            "attack_tree_id": attack_tree_id,
                            "current_state": current_state,
                        },
                    )
                    # Return existing attack tree info instead of creating new one
                    return {
                        "attack_tree_id": attack_tree_id,
                        "status": current_state,
                        "message": f"Attack tree already exists with status: {current_state}",
                    }
                elif current_state == "failed":
                    LOG.info(
                        f"Retrying failed attack tree generation",
                        extra={"attack_tree_id": attack_tree_id},
                    )
                    # Continue with generation - allow retry of failed attempts
        except ClientError as e:
            # If status check fails, continue with generation
            LOG.warning(
                f"Failed to check existing status, continuing with generation: {e}",
                extra={"attack_tree_id": attack_tree_id},
            )

        # Create session ID for agent runtime
        session_id = str(uuid.uuid4())
        LOG.info(
            f"Invoking attack tree agent",
            extra={
                "attack_tree_id": attack_tree_id,
                "session_id": session_id,
                "threat_model_id": threat_model_id,
                "threat_name": threat_name,
                "owner": owner,
            },
        )

        # Create status record in STATE table
        state_table = dynamodb.Table(STATE_TABLE)
        try:
            state_table.put_item(
                Item={
                    "id": attack_tree_id,
                    "state": "in_progress",
                    "owner": owner,
                    "session_id": session_id,
                    "execution_owner": owner,
                    "threat_model_id": threat_model_id,
                    "threat_name": threat_name,
                }
            )
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            LOG.error(
                f"DynamoDB error creating status record: {error_code} - {error_msg}",
                extra={
                    "attack_tree_id": attack_tree_id,
                    "error_code": error_code,
                    "error_message": error_msg,
                },
            )
            if error_code == "ProvisionedThroughputExceededException":
                raise InternalError(
                    "Service temporarily unavailable due to high load. Please try again."
                )
            elif error_code == "ResourceNotFoundException":
                raise InternalError("Status table not found. Please contact support.")
            else:
                raise InternalError(f"Failed to create status record: {error_msg}")

        # Invoke Bedrock Agent Core runtime
        try:
            agent_core_client.invoke_agent_runtime(
                agentRuntimeArn=AGENT_CORE_RUNTIME,
                runtimeSessionId=session_id,
                payload=json.dumps(
                    {
                        "input": {
                            "id": attack_tree_id,  # Required by agent.py validation
                            "attack_tree_id": attack_tree_id,
                            "threat_model_id": threat_model_id,
                            "threat_name": threat_name,
                            "threat_description": threat_description,
                            "owner": owner,
                            "reasoning": reasoning,
                            "type": "attack_tree",
                        }
                    }
                ),
            )
            LOG.info(
                f"Successfully invoked agent runtime",
                extra={"attack_tree_id": attack_tree_id, "session_id": session_id},
            )
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            LOG.error(
                f"Bedrock Agent Core error: {error_code} - {error_msg}",
                extra={
                    "attack_tree_id": attack_tree_id,
                    "error_code": error_code,
                    "error_message": error_msg,
                },
            )
            # Update status to failed
            _update_status_to_failed(
                attack_tree_id, f"Agent invocation failed: {error_msg}"
            )

            if error_code == "ThrottlingException":
                raise InternalError(
                    "Service temporarily unavailable due to rate limiting. Please try again."
                )
            elif error_code == "ValidationException":
                raise InternalError(f"Invalid agent configuration: {error_msg}")
            elif error_code == "ResourceNotFoundException":
                raise InternalError("Agent runtime not found. Please contact support.")
            else:
                raise InternalError(f"Failed to invoke agent: {error_msg}")
        except Exception as e:
            LOG.error(
                f"Unexpected error invoking agent runtime: {str(e)}",
                extra={"attack_tree_id": attack_tree_id},
            )
            _update_status_to_failed(
                attack_tree_id, f"Agent invocation failed: {str(e)}"
            )
            raise InternalError(f"Failed to invoke agent: {str(e)}")

        return {"attack_tree_id": attack_tree_id, "status": "in_progress"}

    except (UnauthorizedError, NotFoundError):
        raise
    except InternalError:
        raise
    except Exception as e:
        LOG.error(
            f"Unexpected error in invoke_attack_tree_agent: {str(e)}",
            extra={
                "attack_tree_id": attack_tree_id,
                "threat_model_id": threat_model_id,
                "owner": owner,
            },
        )
        if attack_tree_id:
            _update_status_to_failed(attack_tree_id, f"Unexpected error: {str(e)}")
        raise InternalError(f"Failed to invoke attack tree agent: {str(e)}")


@tracer.capture_method
def check_attack_tree_status(attack_tree_id: str, user_id: str) -> Dict[str, Any]:
    """
    Check the status of attack tree generation.

    Args:
        attack_tree_id: ID of the attack tree
        user_id: User ID of the requester

    Returns:
        Dict with attack_tree_id, status, and optional detail/error

    Raises:
        UnauthorizedError: If user doesn't have access
        NotFoundError: If attack tree doesn't exist
        InternalError: If DynamoDB operation fails
    """
    try:
        state_table = dynamodb.Table(STATE_TABLE)

        # Get status record
        try:
            response = state_table.get_item(Key={"id": attack_tree_id})
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            LOG.error(
                f"DynamoDB error fetching status: {error_code} - {error_msg}",
                extra={
                    "attack_tree_id": attack_tree_id,
                    "error_code": error_code,
                },
            )
            if error_code == "ProvisionedThroughputExceededException":
                raise InternalError(
                    "Service temporarily unavailable due to high load. Please try again."
                )
            elif error_code == "ResourceNotFoundException":
                raise InternalError("Status table not found. Please contact support.")
            else:
                raise InternalError(f"Failed to fetch status: {error_msg}")

        if "Item" not in response:
            LOG.info(f"Attack tree status not found: {attack_tree_id}")
            return {"attack_tree_id": attack_tree_id, "status": "not_found"}

        item = response["Item"]
        threat_model_id = item.get("threat_model_id")

        # Validate user has access to parent threat model
        require_access(threat_model_id, user_id, required_level="READ_ONLY")

        # Build response
        result = {
            "attack_tree_id": attack_tree_id,
            "status": item.get("state", "unknown"),
        }

        # Include detail if present
        if "detail" in item:
            result["detail"] = item["detail"]

        # Include error if failed
        if item.get("state") == "failed" and "error" in item:
            result["error"] = item["error"]

        LOG.info(
            f"Attack tree status retrieved",
            extra={
                "attack_tree_id": attack_tree_id,
                "status": result["status"],
            },
        )

        return result

    except (UnauthorizedError, NotFoundError):
        raise
    except InternalError:
        raise
    except Exception as e:
        LOG.error(
            f"Unexpected error checking attack tree status: {str(e)}",
            extra={"attack_tree_id": attack_tree_id},
        )
        raise InternalError(f"Failed to check status: {str(e)}")


@tracer.capture_method
def fetch_attack_tree(attack_tree_id: str, user_id: str) -> Dict[str, Any]:
    """
    Fetch a completed attack tree and transform to React Flow format.

    Args:
        attack_tree_id: ID of the attack tree
        user_id: User ID of the requester

    Returns:
        Dict with attack tree data in React Flow format

    Raises:
        UnauthorizedError: If user doesn't have access
        NotFoundError: If attack tree doesn't exist
        InternalError: If DynamoDB operation fails or data is invalid
    """
    try:
        # First check status to get threat_model_id
        state_table = dynamodb.Table(STATE_TABLE)
        try:
            status_response = state_table.get_item(Key={"id": attack_tree_id})
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            LOG.error(
                f"DynamoDB error fetching status: {error_code} - {error_msg}",
                extra={
                    "attack_tree_id": attack_tree_id,
                    "error_code": error_code,
                },
            )
            if error_code == "ProvisionedThroughputExceededException":
                raise InternalError(
                    "Service temporarily unavailable due to high load. Please try again."
                )
            else:
                raise InternalError(f"Failed to fetch status: {error_msg}")

        if "Item" not in status_response:
            LOG.warning(f"Attack tree not found: {attack_tree_id}")
            raise NotFoundError(f"Attack tree {attack_tree_id} not found")

        status_item = status_response["Item"]
        threat_model_id = status_item.get("threat_model_id")

        # Validate user has access to parent threat model
        require_access(threat_model_id, user_id, required_level="READ_ONLY")

        # Check if generation is complete
        current_state = status_item.get("state", "unknown")
        if current_state != "completed":
            LOG.info(
                f"Attack tree not ready for fetch",
                extra={
                    "attack_tree_id": attack_tree_id,
                    "current_state": current_state,
                },
            )
            # Include error message if failed
            if current_state == "failed":
                error_msg = status_item.get("error", "Unknown error")
                raise InternalError(f"Attack tree generation failed: {error_msg}")
            else:
                raise InternalError(
                    f"Attack tree generation is not complete. Current status: {current_state}"
                )

        # Fetch attack tree data
        attack_tree_table = dynamodb.Table(ATTACK_TREE_TABLE)
        try:
            tree_response = attack_tree_table.get_item(
                Key={"attack_tree_id": attack_tree_id}
            )
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            LOG.error(
                f"DynamoDB error fetching attack tree data: {error_code} - {error_msg}",
                extra={
                    "attack_tree_id": attack_tree_id,
                    "error_code": error_code,
                },
            )
            if error_code == "ProvisionedThroughputExceededException":
                raise InternalError(
                    "Service temporarily unavailable due to high load. Please try again."
                )
            else:
                raise InternalError(f"Failed to fetch attack tree data: {error_msg}")

        if "Item" not in tree_response:
            LOG.error(
                f"Attack tree data not found despite completed status",
                extra={"attack_tree_id": attack_tree_id},
            )
            raise NotFoundError(f"Attack tree data not found for {attack_tree_id}")

        item = tree_response["Item"]

        # The attack tree data should already be in React Flow format
        # (converted by the agent workflow before storage)
        attack_tree_data = item.get("attack_tree_data")

        if not attack_tree_data:
            LOG.error(
                f"Attack tree data is empty", extra={"attack_tree_id": attack_tree_id}
            )
            raise InternalError("Attack tree data is empty")

        # Convert decimals
        attack_tree_data = convert_decimals(attack_tree_data)

        # Validate React Flow format before returning to client
        is_valid, error_message = validate_react_flow_format(attack_tree_data)
        if not is_valid:
            LOG.error(
                f"Attack tree failed React Flow validation: {error_message}",
                extra={"attack_tree_id": attack_tree_id},
            )
            raise InternalError(f"Attack tree data validation failed: {error_message}")

        LOG.info(
            f"Successfully fetched attack tree",
            extra={
                "attack_tree_id": attack_tree_id,
                "node_count": len(attack_tree_data.get("nodes", [])),
                "edge_count": len(attack_tree_data.get("edges", [])),
            },
        )

        return {
            "attack_tree_id": attack_tree_id,
            "threat_model_id": threat_model_id,
            "threat_name": item.get("threat_name"),
            "created_at": item.get("created_at"),
            "attack_tree": attack_tree_data,
        }

    except (UnauthorizedError, NotFoundError, InternalError):
        raise
    except Exception as e:
        LOG.error(
            f"Unexpected error fetching attack tree: {str(e)}",
            extra={"attack_tree_id": attack_tree_id},
        )
        raise InternalError(f"Failed to fetch attack tree: {str(e)}")


@tracer.capture_method
def delete_attack_tree(attack_tree_id: str, owner: str) -> Dict[str, Any]:
    """
    Delete an attack tree.

    Note: The attack_tree_id is NOT stored as a foreign key on threat objects,
    so no foreign key cleanup is performed.

    Args:
        attack_tree_id: ID of the attack tree to delete (composite key format)
        owner: User ID of the requester

    Returns:
        Dict with deletion status

    Raises:
        UnauthorizedError: If user doesn't have EDIT access
        NotFoundError: If attack tree doesn't exist
        InternalError: If DynamoDB operation fails
    """
    try:
        # Get attack tree status to find threat_model_id
        state_table = dynamodb.Table(STATE_TABLE)
        try:
            status_response = state_table.get_item(Key={"id": attack_tree_id})
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            LOG.error(
                f"DynamoDB error fetching status for deletion: {error_code} - {error_msg}",
                extra={
                    "attack_tree_id": attack_tree_id,
                    "error_code": error_code,
                },
            )
            if error_code == "ProvisionedThroughputExceededException":
                raise InternalError(
                    "Service temporarily unavailable due to high load. Please try again."
                )
            else:
                raise InternalError(f"Failed to fetch status: {error_msg}")

        if "Item" not in status_response:
            LOG.warning(f"Attack tree not found for deletion: {attack_tree_id}")
            raise NotFoundError(f"Attack tree {attack_tree_id} not found")

        status_item = status_response["Item"]
        threat_model_id = status_item.get("threat_model_id")

        # Validate user has EDIT access to parent threat model
        require_access(threat_model_id, owner, required_level="EDIT")

        # Delete from attack tree table
        attack_tree_table = dynamodb.Table(ATTACK_TREE_TABLE)
        try:
            attack_tree_table.delete_item(Key={"attack_tree_id": attack_tree_id})
            LOG.info(
                f"Deleted attack tree from ATTACK_TREE_TABLE",
                extra={"attack_tree_id": attack_tree_id},
            )
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code == "ResourceNotFoundException":
                LOG.warning(f"Attack tree data not found in table: {attack_tree_id}")
                # Continue - data may not have been created yet
            elif error_code == "ProvisionedThroughputExceededException":
                raise InternalError(
                    "Service temporarily unavailable due to high load. Please try again."
                )
            else:
                error_msg = e.response["Error"]["Message"]
                LOG.error(
                    f"DynamoDB error deleting attack tree data: {error_code} - {error_msg}",
                    extra={"attack_tree_id": attack_tree_id},
                )
                raise InternalError(f"Failed to delete attack tree data: {error_msg}")

        # Delete status record
        try:
            state_table.delete_item(Key={"id": attack_tree_id})
            LOG.info(
                f"Deleted attack tree status", extra={"attack_tree_id": attack_tree_id}
            )
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            LOG.error(
                f"DynamoDB error deleting status: {error_code} - {error_msg}",
                extra={"attack_tree_id": attack_tree_id},
            )
            if error_code == "ProvisionedThroughputExceededException":
                raise InternalError(
                    "Service temporarily unavailable due to high load. Please try again."
                )
            else:
                raise InternalError(f"Failed to delete status: {error_msg}")

        return {"attack_tree_id": attack_tree_id, "status": "deleted"}

    except (UnauthorizedError, NotFoundError):
        raise
    except InternalError:
        raise
    except Exception as e:
        LOG.error(
            f"Unexpected error deleting attack tree: {str(e)}",
            extra={"attack_tree_id": attack_tree_id},
        )
        raise InternalError(f"Failed to delete attack tree: {str(e)}")


@tracer.capture_method
def delete_attack_trees_for_threat_model(
    threat_model_id: str, owner: str
) -> Dict[str, Any]:
    """
    Delete all attack trees associated with a threat model (cascade deletion).

    This function is called during threat model deletion to clean up
    associated attack trees. It handles failures gracefully and continues
    deletion even if some attack trees fail to delete.

    Args:
        threat_model_id: ID of the threat model being deleted
        owner: User ID of the threat model owner

    Returns:
        Dict with deletion summary

    Raises:
        UnauthorizedError: If user is not the owner
    """
    try:
        # Verify user is owner of the threat model
        require_owner(threat_model_id, owner)

        # Get threat model to compute attack_tree_id for each threat
        agent_table = dynamodb.Table(AGENT_TABLE)
        try:
            tm_response = agent_table.get_item(Key={"job_id": threat_model_id})
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            LOG.error(
                f"DynamoDB error fetching threat model for cascade deletion: {error_code} - {error_msg}",
                extra={
                    "threat_model_id": threat_model_id,
                    "error_code": error_code,
                },
            )
            # Don't raise - allow threat model deletion to continue
            return {"deleted_count": 0, "failed_count": 0, "error": error_msg}

        if "Item" not in tm_response:
            LOG.warning(
                f"Threat model not found for cascade deletion",
                extra={"threat_model_id": threat_model_id},
            )
            return {"deleted_count": 0, "failed_count": 0}

        item = tm_response["Item"]
        threats = item.get("threat_list", {}).get("threats", [])

        # Generate attack_tree_id for each threat
        attack_tree_ids = []
        for threat in threats:
            threat_name = threat.get("name")
            if threat_name:
                try:
                    attack_tree_id = generate_attack_tree_id(
                        threat_model_id, threat_name
                    )
                    attack_tree_ids.append(attack_tree_id)
                except ValueError as e:
                    LOG.warning(
                        f"Failed to generate attack_tree_id for threat: {e}",
                        extra={
                            "threat_model_id": threat_model_id,
                            "threat_name": threat_name,
                        },
                    )
                    # Continue with next threat

        if not attack_tree_ids:
            LOG.info(
                f"No attack trees found for threat model",
                extra={"threat_model_id": threat_model_id},
            )
            return {"deleted_count": 0, "failed_count": 0}

        LOG.info(
            f"Starting cascade deletion of attack trees",
            extra={
                "threat_model_id": threat_model_id,
                "attack_tree_count": len(attack_tree_ids),
            },
        )

        # Delete each attack tree
        deleted_count = 0
        failed_count = 0
        attack_tree_table = dynamodb.Table(ATTACK_TREE_TABLE)
        state_table = dynamodb.Table(STATE_TABLE)

        for attack_tree_id in attack_tree_ids:
            try:
                # Delete from attack tree table
                try:
                    attack_tree_table.delete_item(
                        Key={"attack_tree_id": attack_tree_id}
                    )
                except ClientError as e:
                    error_code = e.response["Error"]["Code"]
                    if error_code != "ResourceNotFoundException":
                        # Log but continue
                        LOG.warning(
                            f"DynamoDB error deleting attack tree data: {error_code}",
                            extra={"attack_tree_id": attack_tree_id},
                        )

                # Delete status record
                try:
                    state_table.delete_item(Key={"id": attack_tree_id})
                except ClientError as e:
                    error_code = e.response["Error"]["Code"]
                    if error_code != "ResourceNotFoundException":
                        # Log but continue
                        LOG.warning(
                            f"DynamoDB error deleting status: {error_code}",
                            extra={"attack_tree_id": attack_tree_id},
                        )

                deleted_count += 1
                LOG.info(
                    f"Deleted attack tree in cascade",
                    extra={"attack_tree_id": attack_tree_id},
                )

            except Exception as e:
                failed_count += 1
                LOG.error(
                    f"Failed to delete attack tree in cascade: {str(e)}",
                    extra={"attack_tree_id": attack_tree_id},
                )
                # Continue with next attack tree

        LOG.info(
            f"Attack tree cascade deletion complete",
            extra={
                "threat_model_id": threat_model_id,
                "deleted_count": deleted_count,
                "failed_count": failed_count,
            },
        )

        return {"deleted_count": deleted_count, "failed_count": failed_count}

    except UnauthorizedError:
        raise
    except Exception as e:
        LOG.error(
            f"Unexpected error in cascade deletion: {str(e)}",
            extra={"threat_model_id": threat_model_id},
        )
        # Don't raise - allow threat model deletion to continue
        return {"deleted_count": 0, "failed_count": 0, "error": str(e)}
