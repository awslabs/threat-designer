"""
Authorization utilities for threat model collaboration.

This module provides decorators and functions for enforcing access control
on threat model operations.
"""

from functools import wraps
from typing import Any, Dict, List

import json
import os
import time

import boto3
from aws_lambda_powertools import Logger
from exceptions.exceptions import UnauthorizedError
from services.collaboration_service import check_access

LOG = Logger(serialize_stacktrace=False)

GOVERNANCE_GROUP = os.environ.get("GOVERNANCE_GROUP", "governance")
USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
# Seconds to cache a live group-membership lookup per warm container. Bounds the
# stale-authorization window for revoked members well below the token TTL while
# keeping AdminListGroupsForUser off the hot path for rapid successive calls.
GROUP_CHECK_TTL = int(os.environ.get("GOVERNANCE_GROUP_CHECK_TTL", "60"))

_cognito_client = None
# username -> (groups, expires_at_epoch)
_group_cache: Dict[str, tuple] = {}


def _get_cognito_client():
    global _cognito_client
    if _cognito_client is None:
        _cognito_client = boto3.client("cognito-idp")
    return _cognito_client


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


def _live_user_groups(username: str) -> List[str]:
    """Return the user's current Cognito groups via AdminListGroupsForUser.

    Cached per warm container for GROUP_CHECK_TTL seconds. This is the
    authoritative source for privileged endpoints: a token minted while the
    user was in the group stays valid until it expires, so trusting the
    embedded claim alone would leave a revoked admin able to mutate system
    spaces for up to the token TTL. Paginates so membership isn't truncated.
    """
    now = time.time()
    cached = _group_cache.get(username)
    if cached and cached[1] > now:
        return cached[0]

    if not USER_POOL_ID:
        # No pool configured (e.g. local/dev). Cannot verify; deny by default
        # rather than silently trusting the unverifiable claim.
        LOG.warning("COGNITO_USER_POOL_ID not set; cannot verify group membership")
        return []

    client = _get_cognito_client()
    groups: List[str] = []
    kwargs: Dict[str, Any] = {"UserPoolId": USER_POOL_ID, "Username": username}
    try:
        while True:
            resp = client.admin_list_groups_for_user(**kwargs)
            groups.extend(g["GroupName"] for g in resp.get("Groups", []))
            next_token = resp.get("NextToken")
            if not next_token:
                break
            kwargs["NextToken"] = next_token
    except client.exceptions.UserNotFoundException:
        groups = []
    except Exception as e:
        # Fail closed: an unavailable Cognito must not grant access.
        LOG.error(f"Live group check failed for {username}: {e}")
        raise UnauthorizedError("Unable to verify permissions")

    _group_cache[username] = (groups, now + GROUP_CHECK_TTL)
    return groups


def parse_groups(raw: Any) -> List[str]:
    """Parse the authorizer 'groups' context value into a list.

    The authorizer JSON-encodes the Cognito groups array because API Gateway
    context values must be strings. Missing or malformed values yield an empty
    list rather than raising, so a user in no groups is simply unauthorized.
    """
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        LOG.warning("Failed to parse groups from authorizer context")
        return []
    return parsed if isinstance(parsed, list) else []


def require_group(group: str, user_groups: List[str], user_id: str = "") -> None:
    """Verify the user belongs to the required Cognito group.

    Args:
        group: Required group name.
        user_groups: Groups extracted from the authorizer context.
        user_id: Optional, for logging only.

    Raises:
        UnauthorizedError: If the user is not in the group.
    """
    if group not in user_groups:
        LOG.warning(
            f"User {user_id or '<unknown>'} not in required group '{group}'"
        )
        raise UnauthorizedError("You do not have permission to perform this operation")


def governance_only(func):
    """Decorator restricting a route to members of the governance group.

    Unlike owner_only / access_required, this is resource-independent: it gates
    on the caller's Cognito group membership, not per-object collaboration.

    Authorization is verified LIVE against Cognito (AdminListGroupsForUser), not
    from the token claim, so removing a user from the group revokes their access
    within GROUP_CHECK_TTL rather than at token expiry. The token claim is used
    only as a cheap pre-filter to avoid a Cognito call for the common case of a
    caller who was never in the group.

    Usage:
        @router.post("/governance/spaces")
        @governance_only
        def create_system_space():
            ...
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        import sys

        module = sys.modules[func.__module__]
        router = getattr(module, "router", None)

        if not router:
            raise RuntimeError("Router not found in function module")

        authorizer = router.current_event.request_context.authorizer
        user_id = authorizer.get("user_id")
        username = authorizer.get("username") or user_id
        claim_groups = parse_groups(authorizer.get("groups"))

        # Cheap pre-filter: if the token never asserted the group, the user
        # can't have gained it since minting, so skip the Cognito call.
        if GOVERNANCE_GROUP not in claim_groups:
            LOG.warning(f"User {user_id} not in group per token claim")
            raise UnauthorizedError(
                "You do not have permission to perform this operation"
            )

        # Authoritative live check: catches revocation after token issuance.
        live_groups = _live_user_groups(username)
        require_group(GOVERNANCE_GROUP, live_groups, user_id)

        return func(*args, **kwargs)

    return wrapper
