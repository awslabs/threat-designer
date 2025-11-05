"""
Authorization utilities for threat model collaboration.

This module provides decorators and functions for enforcing access control
on threat model operations.
"""

from functools import wraps
from typing import Any, Dict

from aws_lambda_powertools import Logger
from exceptions.exceptions import UnauthorizedError
from services.collaboration_service import check_access

LOG = Logger(serialize_stacktrace=False)


def require_owner(threat_model_id: str, user_id: str) -> None:
    """
    Verify user is the owner of the threat model.

    Args:
        threat_model_id: The threat model ID
        user_id: The user to verify

    Raises:
        UnauthorizedError: If user is not the owner
    """
    access_info = check_access(threat_model_id, user_id)

    if not access_info["is_owner"]:
        LOG.warning(
            f"User {user_id} is not the owner of threat model {threat_model_id}"
        )
        raise UnauthorizedError("Only the owner can perform this operation")


def require_access(
    threat_model_id: str, user_id: str, required_level: str = "READ_ONLY"
) -> Dict[str, Any]:
    """
    Verify user has at least the required access level.

    Args:
        threat_model_id: The threat model ID
        user_id: The user to check
        required_level: "READ_ONLY" or "EDIT"

    Returns:
        Dict with access details {is_owner: bool, access_level: str}

    Raises:
        UnauthorizedError: If user doesn't have required access
    """
    access_info = check_access(threat_model_id, user_id)

    if not access_info["has_access"]:
        LOG.warning(
            f"User {user_id} does not have access to threat model {threat_model_id}"
        )
        raise UnauthorizedError("You do not have access to this threat model")

    # Owner has all permissions
    if access_info["is_owner"]:
        return access_info

    # Check if user has required access level
    if required_level == "EDIT":
        if access_info["access_level"] != "EDIT":
            LOG.warning(
                f"User {user_id} does not have EDIT access to threat model {threat_model_id}"
            )
            raise UnauthorizedError(
                "You do not have permission to edit this threat model"
            )

    return access_info


def require_edit_lock(threat_model_id: str, user_id: str, lock_token: str) -> None:
    """
    Verify user holds a valid edit lock.

    Args:
        threat_model_id: The threat model ID
        user_id: The user to verify
        lock_token: The lock token to validate

    Raises:
        UnauthorizedError: If user doesn't hold the lock
    """
    from services.lock_service import get_lock_status

    # First check if user has edit access
    require_access(threat_model_id, user_id, required_level="EDIT")

    # Then verify they hold the lock
    lock_status = get_lock_status(threat_model_id)

    if not lock_status.get("locked"):
        LOG.warning(f"No active lock for threat model {threat_model_id}")
        raise UnauthorizedError("You must acquire a lock before editing")

    if lock_status.get("user_id") != user_id:
        LOG.warning(
            f"Lock for {threat_model_id} held by {lock_status.get('user_id')}, not {user_id}"
        )
        raise UnauthorizedError("Lock is held by another user")

    # Note: We don't validate lock_token here as it's validated during save operations
    # This function just checks that the user holds an active lock


def owner_only(func):
    """
    Decorator to require owner access for a route handler.

    Usage:
        @router.delete("/threat-designer/<id>")
        @owner_only
        def delete_threat_model(id):
            # Only owner can execute this
            pass

    The decorated function must accept 'id' as the threat model ID parameter.
    The user_id will be extracted from the router's current_event.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        # Get the router instance from the function's module
        # This assumes the function is defined in a module with a 'router' variable
        import sys

        module = sys.modules[func.__module__]
        router = getattr(module, "router", None)

        if not router:
            raise RuntimeError("Router not found in function module")

        # Extract threat model ID from kwargs or args
        threat_model_id = kwargs.get("id") or (args[0] if args else None)
        if not threat_model_id:
            raise ValueError("Threat model ID not found in function arguments")

        # Get user ID from request context
        user_id = router.current_event.request_context.authorizer.get("user_id")

        # Check if user is owner
        require_owner(threat_model_id, user_id)

        # Call the original function
        return func(*args, **kwargs)

    return wrapper


def access_required(required_level: str = "READ_ONLY"):
    """
    Decorator to require specific access level for a route handler.

    Usage:
        @router.put("/threat-designer/<id>")
        @access_required(required_level="EDIT")
        def update_threat_model(id):
            # Only users with EDIT access can execute this
            pass

    Args:
        required_level: "READ_ONLY" or "EDIT"

    The decorated function must accept 'id' as the threat model ID parameter.
    The user_id will be extracted from the router's current_event.
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Get the router instance from the function's module
            import sys

            module = sys.modules[func.__module__]
            router = getattr(module, "router", None)

            if not router:
                raise RuntimeError("Router not found in function module")

            # Extract threat model ID from kwargs or args
            threat_model_id = kwargs.get("id") or (args[0] if args else None)
            if not threat_model_id:
                raise ValueError("Threat model ID not found in function arguments")

            # Get user ID from request context
            user_id = router.current_event.request_context.authorizer.get("user_id")

            # Check access level
            access_info = require_access(threat_model_id, user_id, required_level)

            # Store access info in kwargs for use in the handler
            kwargs["_access_info"] = access_info

            # Call the original function
            return func(*args, **kwargs)

        return wrapper

    return decorator
