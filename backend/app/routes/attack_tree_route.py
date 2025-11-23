"""
Attack Tree Route Handler

This module provides REST API endpoints for attack tree operations including
generation, status polling, retrieval, and deletion.
"""

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler.api_gateway import Router
from aws_lambda_powertools.event_handler import Response
from aws_lambda_powertools.event_handler.api_gateway import content_types

from services.attack_tree_service import (
    invoke_attack_tree_agent,
    check_attack_tree_status,
    fetch_attack_tree,
    delete_attack_tree,
    update_attack_tree,
    get_attack_tree_metadata,
)
from exceptions.exceptions import (
    BadRequestError,
    UnauthorizedError,
    NotFoundError,
    InternalError,
)

tracer = Tracer()
router = Router()

LOG = logger = Logger(serialize_stacktrace=False)


@router.post("/attack-tree")
def create_attack_tree():
    """
    Initiate attack tree generation for a specific threat.

    The attack_tree_id is computed deterministically as a composite key from
    threat_model_id and threat_name. It is NOT stored as a foreign key on the
    threat object.

    Request body:
        {
            "threat_model_id": "uuid",
            "threat_name": "string",
            "threat_description": "string",
            "reasoning": 0-3 (optional)
        }

    Returns:
        {
            "attack_tree_id": "composite_key",  # Format: {threat_model_id}_{normalized_threat_name}
            "status": "in_progress" | "completed",
            "message": "string (optional)"  # Present if attack tree already exists
        }

    Status codes:
        200: Attack tree generation initiated or already exists
        400: Invalid request body
        403: User not authorized (not owner or editor)
        404: Threat model not found
        500: Internal server error
    """
    try:
        # Extract user_id from request context
        user_id = router.current_event.request_context.authorizer.get("user_id")

        # Parse request body
        body = router.current_event.json_body

        # Validate required fields
        threat_model_id = body.get("threat_model_id")
        threat_name = body.get("threat_name")
        threat_description = body.get("threat_description")
        reasoning = body.get("reasoning", 0)

        if not threat_model_id:
            raise BadRequestError("threat_model_id is required")

        if not threat_name:
            raise BadRequestError("threat_name is required")

        if not threat_description:
            raise BadRequestError("threat_description is required")

        # Validate reasoning level
        if not isinstance(reasoning, int) or reasoning < 0 or reasoning > 3:
            raise BadRequestError("reasoning must be an integer between 0 and 3")

        # Invoke attack tree agent
        result = invoke_attack_tree_agent(
            owner=user_id,
            threat_model_id=threat_model_id,
            threat_name=threat_name,
            threat_description=threat_description,
            reasoning=reasoning,
        )

        LOG.info(f"Attack tree generation initiated: {result['attack_tree_id']}")
        return result

    except (BadRequestError, UnauthorizedError, NotFoundError, InternalError):
        raise
    except Exception as e:
        LOG.exception(f"Error creating attack tree: {e}")
        raise InternalError(f"Failed to initiate attack tree generation: {str(e)}")


@router.get("/attack-tree/<attack_tree_id>/status")
def get_attack_tree_status(attack_tree_id: str):
    """
    Poll the status of attack tree generation.

    Path parameters:
        attack_tree_id: Attack tree identifier (composite key format: {threat_model_id}_{normalized_threat_name})

    Returns:
        {
            "attack_tree_id": "composite_key",
            "status": "in_progress|completed|failed|not_found",
            "detail": "string (optional)",
            "error": "string (optional, if failed)"
        }

    Status codes:
        200: Status retrieved successfully
        403: User not authorized (no access to parent threat model)
        500: Internal server error
    """
    try:
        # Extract user_id from request context
        user_id = router.current_event.request_context.authorizer.get("user_id")

        # Check status
        result = check_attack_tree_status(attack_tree_id, user_id)

        return result

    except (UnauthorizedError, NotFoundError, InternalError):
        raise
    except Exception as e:
        LOG.exception(f"Error checking attack tree status: {e}")
        raise InternalError(f"Failed to check attack tree status: {str(e)}")


@router.get("/attack-tree/<attack_tree_id>")
def get_attack_tree(attack_tree_id: str):
    """
    Retrieve a completed attack tree in React Flow format.

    Path parameters:
        attack_tree_id: Attack tree identifier (composite key format: {threat_model_id}_{normalized_threat_name})

    Returns:
        {
            "attack_tree_id": "composite_key",
            "threat_model_id": "uuid",
            "threat_name": "string",
            "created_at": "ISO timestamp",
            "attack_tree": {
                "nodes": [...],
                "edges": [...]
            }
        }

    Status codes:
        200: Attack tree retrieved successfully
        403: User not authorized (no access to parent threat model)
        404: Attack tree not found
        500: Internal server error
    """
    try:
        # Extract user_id from request context
        user_id = router.current_event.request_context.authorizer.get("user_id")

        # Fetch attack tree
        result = fetch_attack_tree(attack_tree_id, user_id)

        LOG.info(f"Attack tree retrieved: {attack_tree_id}")
        return result

    except (UnauthorizedError, NotFoundError, InternalError):
        raise
    except Exception as e:
        LOG.exception(f"Error fetching attack tree: {e}")
        raise InternalError(f"Failed to fetch attack tree: {str(e)}")


@router.put("/attack-tree/<attack_tree_id>")
def update_attack_tree_endpoint(attack_tree_id: str):
    """
    Update an existing attack tree with new data.

    This endpoint validates the attack tree structure, checks for circular
    dependencies, and persists the validated data to the database.

    Path parameters:
        attack_tree_id: Attack tree identifier (composite key format)

    Request body:
        {
            "attack_tree": {
                "nodes": [
                    {
                        "id": "node-1",
                        "type": "root|and-gate|or-gate|leaf-attack",
                        "position": {"x": 100, "y": 100},
                        "data": {...}
                    }
                ],
                "edges": [
                    {
                        "id": "edge-1",
                        "source": "node-1",
                        "target": "node-2",
                        "type": "smoothstep"
                    }
                ]
            }
        }

    Returns:
        {
            "attack_tree_id": "composite_key",
            "updated_at": "ISO timestamp",
            "message": "Attack tree updated successfully"
        }

    Status codes:
        200: Attack tree updated successfully
        400: Invalid attack tree data (validation failed or circular dependency)
        403: User not authorized (not owner or editor)
        404: Attack tree not found
        500: Internal server error
    """
    try:
        # Extract user_id from request context
        user_id = router.current_event.request_context.authorizer.get("user_id")

        # Parse request body
        body = router.current_event.json_body

        # Validate required fields
        if "attack_tree" not in body:
            raise BadRequestError("attack_tree is required in request body")

        attack_tree_data = body["attack_tree"]

        if not isinstance(attack_tree_data, dict):
            raise BadRequestError("attack_tree must be an object")

        # Update attack tree
        result = update_attack_tree(attack_tree_id, attack_tree_data, user_id)

        LOG.info(f"Attack tree updated: {attack_tree_id}")
        return result

    except (BadRequestError, UnauthorizedError, NotFoundError, InternalError):
        raise
    except Exception as e:
        LOG.exception(f"Error updating attack tree: {e}")
        raise InternalError(f"Failed to update attack tree: {str(e)}")


@router.delete("/attack-tree/<attack_tree_id>")
def delete_attack_tree_endpoint(attack_tree_id: str):
    """
    Delete an attack tree.

    Note: The attack_tree_id is NOT stored as a foreign key on threat objects,
    so no foreign key cleanup is performed.

    Path parameters:
        attack_tree_id: Attack tree identifier (composite key format)

    Returns:
        204 No Content on success

    Status codes:
        204: Attack tree deleted successfully
        403: User not authorized (not owner or editor)
        404: Attack tree not found
        500: Internal server error
    """
    try:
        # Extract user_id from request context
        user_id = router.current_event.request_context.authorizer.get("user_id")

        # Delete attack tree
        delete_attack_tree(attack_tree_id, user_id)

        LOG.info(f"Attack tree deleted: {attack_tree_id}")

        # Return 204 No Content
        return Response(
            status_code=204,
            content_type=content_types.APPLICATION_JSON,
            body="",
        )

    except (UnauthorizedError, NotFoundError, InternalError):
        raise
    except Exception as e:
        LOG.exception(f"Error deleting attack tree: {e}")
        raise InternalError(f"Failed to delete attack tree: {str(e)}")


@router.get("/threat-models/<threat_model_id>/attack-trees/metadata")
def get_attack_tree_metadata_endpoint(threat_model_id: str):
    """
    Get metadata about which threats have attack trees.

    This endpoint returns a list of threat names that have associated attack
    trees without loading the full tree data. This is used for filtering
    threats in the catalog.

    Path parameters:
        threat_model_id: The threat model identifier

    Returns:
        {
            "threat_model_id": "uuid",
            "threats_with_attack_trees": ["threat_name_1", "threat_name_2", ...]
        }

    Status codes:
        200: Metadata retrieved successfully
        403: User not authorized (no access to threat model)
        404: Threat model not found
        500: Internal server error
    """
    try:
        # Extract user_id from request context
        user_id = router.current_event.request_context.authorizer.get("user_id")

        # Get attack tree metadata
        result = get_attack_tree_metadata(threat_model_id, user_id)

        LOG.info(
            f"Attack tree metadata retrieved for threat model: {threat_model_id}",
            extra={"count": len(result["threats_with_attack_trees"])},
        )
        return result

    except (UnauthorizedError, NotFoundError, InternalError):
        raise
    except Exception as e:
        LOG.exception(f"Error getting attack tree metadata: {e}")
        raise InternalError(f"Failed to get attack tree metadata: {str(e)}")
