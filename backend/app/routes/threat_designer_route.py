from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler.api_gateway import Router
from services.threat_designer_service import (
    check_status,
    check_trail,
    delete_tm,
    delete_session,
    fetch_all,
    fetch_results,
    generate_presigned_download_url,
    generate_presigned_url,
    invoke_lambda,
    restore,
    update_results,
)
from services.collaboration_service import (
    share_threat_model,
    get_collaborators,
    remove_collaborator,
    update_collaborator_access,
    list_cognito_users,
)
from services.lock_service import (
    acquire_lock,
    refresh_lock,
    release_lock,
    get_lock_status,
    force_release_lock,
)

tracer = Tracer()
router = Router()

LOG = logger = Logger(serialize_stacktrace=False)


@router.get("/threat-designer/mcp/status/<id>")
@router.get("/threat-designer/status/<id>")
def _tm_status(id):
    path = router.current_event.path
    if "/mcp" in path:
        # MCP endpoints bypass authorization
        return check_status(id)
    else:
        # Extract user_id from request context
        user_id = router.current_event.request_context.authorizer.get("user_id")

        # Verify user has at least READ_ONLY access
        from utils.authorization import require_access

        require_access(id, user_id, required_level="READ_ONLY")

        # Return status if authorized
        return check_status(id)


@router.get("/threat-designer/trail/<id>")
def _tm_trail(id):
    # Extract user_id from request context
    user_id = router.current_event.request_context.authorizer.get("user_id")

    # Verify user has at least READ_ONLY access
    from utils.authorization import require_access

    require_access(id, user_id, required_level="READ_ONLY")

    # Return trail if authorized
    return check_trail(id)


@router.get("/threat-designer/mcp/<id>")
@router.get("/threat-designer/<id>")
def _tm_fetch_results(id):
    path = router.current_event.path
    if "/mcp" in path:
        user_id = "MCP"
    else:
        user_id = router.current_event.request_context.authorizer.get("user_id")

    return fetch_results(id, user_id)


@router.post("/threat-designer/mcp")
@router.post("/threat-designer")
def tm_start():
    try:
        body = router.current_event.json_body

        path = router.current_event.path
        if "/mcp" in path:
            owner = "MCP"
        else:
            owner = router.current_event.request_context.authorizer.get("user_id")

        return invoke_lambda(owner, body)
    except Exception as e:
        LOG.exception(e)


@router.put("/threat-designer/mcp/restore/<id>")
@router.put("/threat-designer/restore/<id>")
def _restore(id):
    path = router.current_event.path
    if "/mcp" in path:
        owner = "MCP"
    else:
        owner = router.current_event.request_context.authorizer.get("user_id")
    return restore(id, owner)


@router.get("/threat-designer/mcp/all")
@router.get("/threat-designer/all")
def _fetch_all():
    path = router.current_event.path
    if "/mcp" in path:
        owner = "MCP"
    else:
        owner = router.current_event.request_context.authorizer.get("user_id")
    return fetch_all(owner)


@router.put("/threat-designer/mcp/<id>")
@router.put("/threat-designer/<id>")
def _update_results(id):
    body = router.current_event.json_body
    path = router.current_event.path
    if "/mcp" in path:
        owner = "MCP"
        lock_token = None
    else:
        owner = router.current_event.request_context.authorizer.get("user_id")
        lock_token = body.get("lock_token")

    return update_results(id, body, owner, lock_token)


@router.delete("/threat-designer/mcp/<id>")
@router.delete("/threat-designer/<id>")
def _delete(id):
    path = router.current_event.path
    if "/mcp" in path:
        owner = "MCP"
        force_release = False
    else:
        owner = router.current_event.request_context.authorizer.get("user_id")
        # Check query parameters for force_release flag
        query_params = router.current_event.query_string_parameters or {}
        force_release = query_params.get("force_release", "false").lower() == "true"

    return delete_tm(id, owner, force_release)


@router.delete("/threat-designer/mcp/<id>/session/<session_id>")
@router.delete("/threat-designer/<id>/session/<session_id>")
def _delete_session(id, session_id):
    path = router.current_event.path
    if "/mcp" in path:
        owner = "MCP"
    else:
        owner = router.current_event.request_context.authorizer.get("user_id")
    return delete_session(id, session_id, owner)


@router.post("/threat-designer/mcp/upload")
@router.post("/threat-designer/upload")
def _upload():
    try:
        body = router.current_event.json_body
        file_type = body.get("file_type")
        return generate_presigned_url(file_type)
    except Exception as e:
        LOG.exception(e)


@router.post("/threat-designer/download")
def _download():
    try:
        body = router.current_event.json_body
        object = body.get("s3_location")
        return generate_presigned_download_url(object)
    except Exception as e:
        LOG.exception(e)


# Collaboration endpoints


@router.post("/threat-designer/<id>/share")
def _share_threat_model(id):
    """Share a threat model with collaborators"""
    try:
        body = router.current_event.json_body
        owner = router.current_event.request_context.authorizer.get("user_id")
        collaborators = body.get("collaborators", [])

        return share_threat_model(id, owner, collaborators)
    except Exception as e:
        LOG.exception(e)
        raise


@router.get("/threat-designer/<id>/collaborators")
def _get_collaborators(id):
    """Get list of collaborators for a threat model"""
    try:
        requester = router.current_event.request_context.authorizer.get("user_id")
        return get_collaborators(id, requester)
    except Exception as e:
        LOG.exception(e)
        raise


@router.delete("/threat-designer/<id>/collaborators/<user_id>")
def _remove_collaborator(id, user_id):
    """Remove a collaborator from a threat model"""
    try:
        owner = router.current_event.request_context.authorizer.get("user_id")
        return remove_collaborator(id, owner, user_id)
    except Exception as e:
        LOG.exception(e)
        raise


@router.put("/threat-designer/<id>/collaborators/<user_id>")
def _update_collaborator_access(id, user_id):
    """Update a collaborator's access level"""
    try:
        body = router.current_event.json_body
        owner = router.current_event.request_context.authorizer.get("user_id")
        new_access_level = body.get("access_level")

        return update_collaborator_access(id, owner, user_id, new_access_level)
    except Exception as e:
        LOG.exception(e)
        raise


@router.get("/threat-designer/users")
def _list_users():
    """List available Cognito users for sharing with optional search"""
    try:
        # Get current user
        current_user = router.current_event.request_context.authorizer.get("user_id")

        # Get query parameters
        query_params = router.current_event.query_string_parameters or {}
        search = query_params.get("search")
        limit = int(query_params.get("limit", "100"))

        return list_cognito_users(
            search_filter=search, max_results=limit, exclude_user=current_user
        )
    except Exception as e:
        LOG.exception(e)
        raise


# Lock management endpoints


@router.post("/threat-designer/<id>/lock")
def _acquire_lock(id):
    """Acquire an edit lock on a threat model"""
    try:
        user_id = router.current_event.request_context.authorizer.get("user_id")
        result = acquire_lock(id, user_id)

        # Return 409 Conflict if lock is held by another user
        if not result.get("success"):
            from aws_lambda_powertools.event_handler import Response
            from aws_lambda_powertools.event_handler.api_gateway import content_types
            import json

            return Response(
                status_code=409,
                content_type=content_types.APPLICATION_JSON,
                body=json.dumps(result),
            )

        return result
    except Exception as e:
        LOG.exception(e)
        raise


@router.put("/threat-designer/<id>/lock/heartbeat")
def _refresh_lock(id):
    """Refresh lock timestamp (heartbeat)"""
    try:
        body = router.current_event.json_body
        user_id = router.current_event.request_context.authorizer.get("user_id")
        lock_token = body.get("lock_token")

        result = refresh_lock(id, user_id, lock_token)

        # Return 410 Gone if lock is lost
        if not result.get("success") and result.get("status_code") == 410:
            from aws_lambda_powertools.event_handler import Response
            from aws_lambda_powertools.event_handler.api_gateway import content_types
            import json

            return Response(
                status_code=410,
                content_type=content_types.APPLICATION_JSON,
                body=json.dumps(result),
            )

        return result
    except Exception as e:
        LOG.exception(e)
        raise


@router.delete("/threat-designer/<id>/lock")
def _release_lock(id):
    """Release an edit lock gracefully"""
    try:
        body = router.current_event.json_body
        user_id = router.current_event.request_context.authorizer.get("user_id")
        lock_token = body.get("lock_token")

        return release_lock(id, user_id, lock_token)
    except Exception as e:
        LOG.exception(e)
        raise


@router.get("/threat-designer/<id>/lock/status")
def _get_lock_status(id):
    """Get current lock status for a threat model"""
    try:
        return get_lock_status(id)
    except Exception as e:
        LOG.exception(e)
        raise


@router.delete("/threat-designer/<id>/lock/force")
def _force_release_lock(id):
    """Force release a lock (owner only)"""
    try:
        owner = router.current_event.request_context.authorizer.get("user_id")
        return force_release_lock(id, owner)
    except Exception as e:
        LOG.exception(e)
        raise
