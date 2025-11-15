"""
Unit tests for lock_service.py

Tests the lock service functionality including:
- acquire_lock: Acquiring locks on threat models
- refresh_lock: Refreshing lock timestamps (heartbeat)
- release_lock: Releasing locks gracefully
- get_lock_status: Getting current lock status
- force_release_lock: Force releasing locks (owner only)
- get_username_from_cognito: Helper for username lookup
"""

import sys
import os
from pathlib import Path
from decimal import Decimal
from unittest.mock import Mock, patch, MagicMock, call
import pytest
import time

# Add backend/app to path for imports
backend_path = str(Path(__file__).parent.parent.parent.parent / "backend" / "app")
sys.path.insert(0, backend_path)

# Mock AWS X-Ray before importing services
sys.modules["aws_xray_sdk"] = MagicMock()
sys.modules["aws_xray_sdk.core"] = MagicMock()

from services.lock_service import (
    acquire_lock,
    refresh_lock,
    release_lock,
    get_lock_status,
    force_release_lock,
    get_username_from_cognito,
    LOCK_EXPIRATION_SECONDS,
    STALE_LOCK_THRESHOLD,
)
from exceptions.exceptions import NotFoundError, UnauthorizedError, InternalError


# ============================================================================
# Tests for get_username_from_cognito
# ============================================================================


class TestGetUsernameFromCognito:
    """Tests for get_username_from_cognito helper function."""

    @patch("services.lock_service.cognito_client")
    @patch("services.lock_service.USER_POOL_ID", "us-east-1_TestPool")
    def test_returns_username_for_valid_user_id(self, mock_cognito):
        """Test returns username for valid user_id."""
        # Arrange
        user_id = "user-123"
        mock_cognito.list_users.return_value = {
            "Users": [
                {
                    "Username": "testuser",
                    "Attributes": [{"Name": "sub", "Value": "user-123"}],
                }
            ]
        }

        # Act
        result = get_username_from_cognito(user_id)

        # Assert
        assert result == "testuser"
        mock_cognito.list_users.assert_called_once_with(
            UserPoolId="us-east-1_TestPool", Filter='sub = "user-123"', Limit=1
        )

    @patch.dict(os.environ, {"COGNITO_USER_POOL_ID": "us-east-1_TestPool"})
    @patch("services.lock_service.cognito_client")
    def test_returns_user_id_if_cognito_lookup_fails(self, mock_cognito):
        """Test returns user_id if Cognito lookup fails."""
        # Arrange
        user_id = "user-123"
        mock_cognito.list_users.return_value = {"Users": []}

        # Act
        result = get_username_from_cognito(user_id)

        # Assert
        assert result == "user-123"

    @patch.dict(os.environ, {"COGNITO_USER_POOL_ID": "us-east-1_TestPool"})
    @patch("services.lock_service.cognito_client")
    def test_handles_cognito_errors_gracefully(self, mock_cognito):
        """Test handles Cognito errors gracefully."""
        # Arrange
        user_id = "user-123"
        mock_cognito.list_users.side_effect = Exception("Cognito error")

        # Act
        result = get_username_from_cognito(user_id)

        # Assert
        assert result == "user-123"


# ============================================================================
# Tests for acquire_lock
# ============================================================================


class TestAcquireLock:
    """Tests for acquire_lock function."""

    @patch.dict(
        os.environ,
        {
            "LOCKS_TABLE": "test-locks-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "COGNITO_USER_POOL_ID": "us-east-1_TestPool",
        },
    )
    @patch("services.lock_service.time.time")
    @patch("services.collaboration_service.check_access")
    @patch("services.lock_service.dynamodb")
    def test_successfully_acquires_lock_on_available_resource(
        self, mock_dynamodb, mock_check_access, mock_time
    ):
        """Test successfully acquires lock on available resource."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        current_time = 1704067200
        mock_time.return_value = current_time

        # Mock tables - dynamodb.Table() is called twice: first for lock_table, then agent_table
        mock_lock_table = Mock()
        mock_agent_table = Mock()
        mock_dynamodb.Table.side_effect = [mock_lock_table, mock_agent_table]

        # Threat model exists
        mock_agent_table.get_item.return_value = {
            "Item": {"job_id": threat_model_id, "owner": user_id}
        }

        # User has access
        mock_check_access.return_value = {
            "has_access": True,
            "is_owner": True,
            "access_level": "OWNER",
        }

        # No existing lock
        mock_lock_table.get_item.return_value = {}

        # Act
        result = acquire_lock(threat_model_id, user_id)

        # Assert
        assert result["success"] is True
        assert "lock_token" in result
        assert result["message"] == "Lock acquired successfully"
        assert result["expires_at"] == current_time + LOCK_EXPIRATION_SECONDS

        # Verify lock was created
        mock_lock_table.put_item.assert_called_once()
        call_args = mock_lock_table.put_item.call_args[1]
        assert call_args["Item"]["threat_model_id"] == threat_model_id
        assert call_args["Item"]["user_id"] == user_id
        assert call_args["Item"]["lock_timestamp"] == current_time

    @patch.dict(
        os.environ,
        {
            "LOCKS_TABLE": "test-locks-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "COGNITO_USER_POOL_ID": "us-east-1_TestPool",
        },
    )
    @patch("services.lock_service.time.time")
    @patch("services.lock_service.get_username_from_cognito")
    @patch("services.collaboration_service.check_access")
    @patch("services.lock_service.dynamodb")
    def test_returns_conflict_when_lock_held_by_another_user(
        self, mock_dynamodb, mock_check_access, mock_get_username, mock_time
    ):
        """Test returns conflict when lock held by another user."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        other_user_id = "user-456"
        current_time = 1704067200
        mock_time.return_value = current_time
        mock_get_username.return_value = "otheruser"

        # Mock tables
        mock_agent_table = Mock()
        mock_lock_table = Mock()
        mock_dynamodb.Table.side_effect = lambda name: (
            mock_agent_table if name and "agent" in name else mock_lock_table
        )

        # Threat model exists
        mock_agent_table.get_item.return_value = {
            "Item": {"job_id": threat_model_id, "owner": user_id}
        }

        # User has access
        mock_check_access.return_value = {
            "has_access": True,
            "is_owner": True,
            "access_level": "OWNER",
        }

        # Lock held by another user (fresh lock)
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": other_user_id,
                "lock_token": "other-token",
                "lock_timestamp": current_time - 60,  # 1 minute ago (fresh)
                "acquired_at": "2024-01-01T00:00:00Z",
            }
        }

        # Act
        result = acquire_lock(threat_model_id, user_id)

        # Assert
        assert result["success"] is False
        assert result["held_by"] == other_user_id
        assert result["username"] == "otheruser"
        assert "Threat model is currently locked by" in result["message"]

        # Verify lock was NOT created
        mock_lock_table.put_item.assert_not_called()

    @patch.dict(
        os.environ,
        {
            "LOCKS_TABLE": "test-locks-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "COGNITO_USER_POOL_ID": "us-east-1_TestPool",
        },
    )
    @patch("services.lock_service.time.time")
    @patch("services.collaboration_service.check_access")
    @patch("services.lock_service.dynamodb")
    def test_user_can_reacquire_their_own_lock(
        self, mock_dynamodb, mock_check_access, mock_time
    ):
        """Test user can re-acquire their own lock."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        current_time = 1704067200
        mock_time.return_value = current_time

        # Mock tables
        mock_agent_table = Mock()
        mock_lock_table = Mock()
        mock_dynamodb.Table.side_effect = lambda name: (
            mock_agent_table if name and "agent" in name else mock_lock_table
        )

        # Threat model exists
        mock_agent_table.get_item.return_value = {
            "Item": {"job_id": threat_model_id, "owner": user_id}
        }

        # User has access
        mock_check_access.return_value = {
            "has_access": True,
            "is_owner": True,
            "access_level": "OWNER",
        }

        # User already holds the lock
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": user_id,
                "lock_token": "old-token",
                "lock_timestamp": current_time - 60,
                "acquired_at": "2024-01-01T00:00:00Z",
            }
        }

        # Act
        result = acquire_lock(threat_model_id, user_id)

        # Assert
        assert result["success"] is True
        assert "lock_token" in result
        assert result["lock_token"] != "old-token"  # New token generated

        # Verify lock was updated
        mock_lock_table.put_item.assert_called_once()

    @patch.dict(
        os.environ,
        {
            "LOCKS_TABLE": "test-locks-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "COGNITO_USER_POOL_ID": "us-east-1_TestPool",
        },
    )
    @patch("services.lock_service.time.time")
    @patch("services.collaboration_service.check_access")
    @patch("services.lock_service.dynamodb")
    def test_stale_lock_is_auto_released_and_new_lock_acquired(
        self, mock_dynamodb, mock_check_access, mock_time
    ):
        """Test stale lock is auto-released and new lock acquired."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        other_user_id = "user-456"
        current_time = 1704067200
        mock_time.return_value = current_time

        # Mock tables
        mock_agent_table = Mock()
        mock_lock_table = Mock()
        mock_dynamodb.Table.side_effect = lambda name: (
            mock_agent_table if name and "agent" in name else mock_lock_table
        )

        # Threat model exists
        mock_agent_table.get_item.return_value = {
            "Item": {"job_id": threat_model_id, "owner": user_id}
        }

        # User has access
        mock_check_access.return_value = {
            "has_access": True,
            "is_owner": True,
            "access_level": "OWNER",
        }

        # Stale lock held by another user (older than STALE_LOCK_THRESHOLD)
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": other_user_id,
                "lock_token": "stale-token",
                "lock_timestamp": current_time - STALE_LOCK_THRESHOLD - 10,  # Stale
                "acquired_at": "2024-01-01T00:00:00Z",
            }
        }

        # Act
        result = acquire_lock(threat_model_id, user_id)

        # Assert
        assert result["success"] is True
        assert "lock_token" in result

        # Verify stale lock was deleted
        mock_lock_table.delete_item.assert_called_once_with(
            Key={"threat_model_id": threat_model_id}
        )

        # Verify new lock was created
        mock_lock_table.put_item.assert_called_once()

    @patch.dict(
        os.environ,
        {
            "LOCKS_TABLE": "test-locks-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "COGNITO_USER_POOL_ID": "us-east-1_TestPool",
        },
    )
    @patch("services.collaboration_service.check_access")
    @patch("services.lock_service.dynamodb")
    def test_requires_edit_access_level(self, mock_dynamodb, mock_check_access):
        """Test requires EDIT access level."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-456"

        # Mock tables - dynamodb.Table() is called twice: first for lock_table, then agent_table
        mock_lock_table = Mock()
        mock_agent_table = Mock()
        mock_dynamodb.Table.side_effect = [mock_lock_table, mock_agent_table]

        # Threat model exists
        mock_agent_table.get_item.return_value = {
            "Item": {"job_id": threat_model_id, "owner": "user-123"}
        }

        # User has READ_ONLY access
        mock_check_access.return_value = {
            "has_access": True,
            "is_owner": False,
            "access_level": "READ_ONLY",
        }

        # Act & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            acquire_lock(threat_model_id, user_id)

        assert "EDIT access" in str(exc_info.value)

    @patch.dict(
        os.environ,
        {
            "LOCKS_TABLE": "test-locks-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "COGNITO_USER_POOL_ID": "us-east-1_TestPool",
        },
    )
    @patch("services.lock_service.dynamodb")
    def test_threat_model_not_found_raises_not_found_error(self, mock_dynamodb):
        """Test threat model not found raises NotFoundError."""
        # Arrange
        threat_model_id = "nonexistent-job"
        user_id = "user-123"

        # Mock tables - dynamodb.Table() is called twice: first for lock_table, then agent_table
        mock_lock_table = Mock()
        mock_agent_table = Mock()
        mock_dynamodb.Table.side_effect = [mock_lock_table, mock_agent_table]

        # Threat model does not exist
        mock_agent_table.get_item.return_value = {}

        # Act & Assert
        with pytest.raises(NotFoundError) as exc_info:
            acquire_lock(threat_model_id, user_id)

        assert threat_model_id in str(exc_info.value)


# ============================================================================
# Tests for refresh_lock
# ============================================================================


class TestRefreshLock:
    """Tests for refresh_lock function."""

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.time.time")
    @patch("services.lock_service.dynamodb")
    def test_successfully_refreshes_lock_with_valid_token(
        self, mock_dynamodb, mock_time
    ):
        """Test successfully refreshes lock with valid token."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        lock_token = "valid-token"
        current_time = 1704067200
        mock_time.return_value = current_time

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Existing lock with matching user and token
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": user_id,
                "lock_token": lock_token,
                "lock_timestamp": current_time - 60,
                "acquired_at": "2024-01-01T00:00:00Z",
            }
        }

        # Act
        result = refresh_lock(threat_model_id, user_id, lock_token)

        # Assert
        assert result["success"] is True
        assert result["message"] == "Lock refreshed successfully"
        assert result["expires_at"] == current_time + LOCK_EXPIRATION_SECONDS

        # Verify lock was updated
        mock_lock_table.update_item.assert_called_once()
        call_args = mock_lock_table.update_item.call_args[1]
        assert call_args["ExpressionAttributeValues"][":timestamp"] == current_time
        assert (
            call_args["ExpressionAttributeValues"][":ttl"]
            == current_time + LOCK_EXPIRATION_SECONDS
        )

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.dynamodb")
    def test_returns_error_if_lock_not_found(self, mock_dynamodb):
        """Test returns error if lock not found."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        lock_token = "some-token"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # No lock exists
        mock_lock_table.get_item.return_value = {}

        # Act
        result = refresh_lock(threat_model_id, user_id, lock_token)

        # Assert
        assert result["success"] is False
        assert result["message"] == "Lock not found"
        assert result["status_code"] == 410

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.dynamodb")
    def test_returns_error_if_lock_held_by_different_user(self, mock_dynamodb):
        """Test returns error if lock held by different user."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        other_user_id = "user-456"
        lock_token = "some-token"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Lock held by different user
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": other_user_id,
                "lock_token": lock_token,
                "lock_timestamp": 1704067200,
            }
        }

        # Act
        result = refresh_lock(threat_model_id, user_id, lock_token)

        # Assert
        assert result["success"] is False
        assert result["message"] == "Lock is held by another user"
        assert result["held_by"] == other_user_id
        assert result["status_code"] == 410

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.dynamodb")
    def test_returns_error_if_lock_token_invalid(self, mock_dynamodb):
        """Test returns error if lock token invalid."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        lock_token = "invalid-token"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Lock exists with different token
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": user_id,
                "lock_token": "correct-token",
                "lock_timestamp": 1704067200,
            }
        }

        # Act
        result = refresh_lock(threat_model_id, user_id, lock_token)

        # Assert
        assert result["success"] is False
        assert result["message"] == "Invalid lock token"
        assert result["status_code"] == 410

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.time.time")
    @patch("services.lock_service.dynamodb")
    def test_updates_lock_timestamp_and_ttl(self, mock_dynamodb, mock_time):
        """Test updates lock_timestamp and TTL."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        lock_token = "valid-token"
        current_time = 1704067200
        mock_time.return_value = current_time

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Existing lock
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": user_id,
                "lock_token": lock_token,
                "lock_timestamp": current_time - 120,
                "ttl": current_time - 120 + LOCK_EXPIRATION_SECONDS,
            }
        }

        # Act
        result = refresh_lock(threat_model_id, user_id, lock_token)

        # Assert
        assert result["success"] is True

        # Verify update_item was called with correct values
        mock_lock_table.update_item.assert_called_once()
        call_args = mock_lock_table.update_item.call_args[1]
        assert call_args["Key"] == {"threat_model_id": threat_model_id}
        assert call_args["ExpressionAttributeValues"][":timestamp"] == current_time
        assert (
            call_args["ExpressionAttributeValues"][":ttl"]
            == current_time + LOCK_EXPIRATION_SECONDS
        )


# ============================================================================
# Tests for release_lock
# ============================================================================


class TestReleaseLock:
    """Tests for release_lock function."""

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.dynamodb")
    def test_successfully_releases_lock_with_valid_token(self, mock_dynamodb):
        """Test successfully releases lock with valid token."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        lock_token = "valid-token"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Existing lock with matching user and token
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": user_id,
                "lock_token": lock_token,
                "lock_timestamp": 1704067200,
            }
        }

        # Act
        result = release_lock(threat_model_id, user_id, lock_token)

        # Assert
        assert result["success"] is True
        assert result["message"] == "Lock released successfully"

        # Verify lock was deleted
        mock_lock_table.delete_item.assert_called_once_with(
            Key={"threat_model_id": threat_model_id}
        )

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.dynamodb")
    def test_returns_success_if_no_lock_exists(self, mock_dynamodb):
        """Test returns success if no lock exists."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        lock_token = "some-token"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # No lock exists
        mock_lock_table.get_item.return_value = {}

        # Act
        result = release_lock(threat_model_id, user_id, lock_token)

        # Assert
        assert result["success"] is True
        assert result["message"] == "No lock to release"

        # Verify delete was not called
        mock_lock_table.delete_item.assert_not_called()

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.dynamodb")
    def test_raises_unauthorized_error_if_user_doesnt_hold_lock(self, mock_dynamodb):
        """Test raises UnauthorizedError if user doesn't hold lock."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        other_user_id = "user-456"
        lock_token = "some-token"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Lock held by different user
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": other_user_id,
                "lock_token": lock_token,
                "lock_timestamp": 1704067200,
            }
        }

        # Act & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            release_lock(threat_model_id, user_id, lock_token)

        assert "do not hold this lock" in str(exc_info.value)

        # Verify lock was not deleted
        mock_lock_table.delete_item.assert_not_called()

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.dynamodb")
    def test_raises_unauthorized_error_if_lock_token_invalid(self, mock_dynamodb):
        """Test raises UnauthorizedError if lock token invalid."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        lock_token = "invalid-token"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Lock exists with different token
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": user_id,
                "lock_token": "correct-token",
                "lock_timestamp": 1704067200,
            }
        }

        # Act & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            release_lock(threat_model_id, user_id, lock_token)

        assert "Invalid lock token" in str(exc_info.value)

        # Verify lock was not deleted
        mock_lock_table.delete_item.assert_not_called()


# ============================================================================
# Tests for get_lock_status
# ============================================================================


class TestGetLockStatus:
    """Tests for get_lock_status function."""

    @patch.dict(
        os.environ,
        {
            "LOCKS_TABLE": "test-locks-table",
            "COGNITO_USER_POOL_ID": "us-east-1_TestPool",
        },
    )
    @patch("services.lock_service.time.time")
    @patch("services.lock_service.get_username_from_cognito")
    @patch("services.lock_service.dynamodb")
    def test_returns_lock_details_when_locked(
        self, mock_dynamodb, mock_get_username, mock_time
    ):
        """Test returns lock details when locked."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        current_time = 1704067200
        lock_timestamp = current_time - 60  # 1 minute ago (fresh)
        mock_time.return_value = current_time
        mock_get_username.return_value = "testuser"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Active lock exists
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": user_id,
                "lock_token": "token-123",
                "lock_timestamp": Decimal(str(lock_timestamp)),
                "acquired_at": "2024-01-01T00:00:00Z",
                "ttl": Decimal(str(current_time + LOCK_EXPIRATION_SECONDS)),
            }
        }

        # Act
        result = get_lock_status(threat_model_id)

        # Assert
        assert result["locked"] is True
        assert result["user_id"] == user_id
        assert result["username"] == "testuser"
        assert result["lock_token"] == "token-123"
        assert result["since"] == "2024-01-01T00:00:00Z"
        assert result["lock_timestamp"] == lock_timestamp
        assert isinstance(result["expires_at"], int)
        assert "Locked by testuser" in result["message"]

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.dynamodb")
    def test_returns_locked_false_when_no_lock(self, mock_dynamodb):
        """Test returns locked=False when no lock."""
        # Arrange
        threat_model_id = "test-job-123"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # No lock exists
        mock_lock_table.get_item.return_value = {}

        # Act
        result = get_lock_status(threat_model_id)

        # Assert
        assert result["locked"] is False
        assert result["message"] == "No active lock"

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.time.time")
    @patch("services.lock_service.dynamodb")
    def test_detects_stale_locks(self, mock_dynamodb, mock_time):
        """Test detects stale locks."""
        # Arrange
        threat_model_id = "test-job-123"
        current_time = 1704067200
        stale_timestamp = current_time - STALE_LOCK_THRESHOLD - 10  # Stale
        mock_time.return_value = current_time

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Stale lock exists
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": "user-123",
                "lock_token": "token-123",
                "lock_timestamp": stale_timestamp,
                "acquired_at": "2024-01-01T00:00:00Z",
            }
        }

        # Act
        result = get_lock_status(threat_model_id)

        # Assert
        assert result["locked"] is False
        assert result["message"] == "Lock is stale"
        assert result["stale"] is True

    @patch.dict(
        os.environ,
        {
            "LOCKS_TABLE": "test-locks-table",
            "COGNITO_USER_POOL_ID": "us-east-1_TestPool",
        },
    )
    @patch("services.lock_service.time.time")
    @patch("services.lock_service.get_username_from_cognito")
    @patch("services.lock_service.dynamodb")
    def test_includes_username_from_cognito(
        self, mock_dynamodb, mock_get_username, mock_time
    ):
        """Test includes username from Cognito."""
        # Arrange
        threat_model_id = "test-job-123"
        user_id = "user-123"
        current_time = 1704067200
        mock_time.return_value = current_time
        mock_get_username.return_value = "johndoe"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Active lock
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": user_id,
                "lock_token": "token-123",
                "lock_timestamp": current_time - 30,
                "acquired_at": "2024-01-01T00:00:00Z",
                "ttl": current_time + LOCK_EXPIRATION_SECONDS,
            }
        }

        # Act
        result = get_lock_status(threat_model_id)

        # Assert
        assert result["username"] == "johndoe"
        mock_get_username.assert_called_once_with(user_id)

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.lock_service.time.time")
    @patch("services.lock_service.get_username_from_cognito")
    @patch("services.lock_service.dynamodb")
    def test_converts_decimal_types_to_int(
        self, mock_dynamodb, mock_get_username, mock_time
    ):
        """Test converts Decimal types to int."""
        # Arrange
        threat_model_id = "test-job-123"
        current_time = 1704067200
        mock_time.return_value = current_time
        mock_get_username.return_value = "testuser"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # Lock with Decimal types (as returned by DynamoDB)
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": "user-123",
                "lock_token": "token-123",
                "lock_timestamp": Decimal("1704067140"),
                "acquired_at": "2024-01-01T00:00:00Z",
                "ttl": Decimal("1704067320"),
            }
        }

        # Act
        result = get_lock_status(threat_model_id)

        # Assert
        assert isinstance(result["lock_timestamp"], int)
        assert isinstance(result["expires_at"], int)
        assert result["lock_timestamp"] == 1704067140
        assert result["expires_at"] == 1704067320


# ============================================================================
# Tests for force_release_lock
# ============================================================================


class TestForceReleaseLock:
    """Tests for force_release_lock function."""

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.collaboration_service.check_access")
    @patch("services.lock_service.dynamodb")
    def test_owner_can_force_release_lock(self, mock_dynamodb, mock_check_access):
        """Test owner can force release lock."""
        # Arrange
        threat_model_id = "test-job-123"
        owner = "user-123"
        lock_holder = "user-456"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # User is owner
        mock_check_access.return_value = {
            "is_owner": True,
            "has_access": True,
            "access_level": "OWNER",
        }

        # Lock held by another user
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": lock_holder,
                "lock_token": "token-456",
                "lock_timestamp": 1704067200,
            }
        }

        # Act
        result = force_release_lock(threat_model_id, owner)

        # Assert
        assert result["success"] is True
        assert result["message"] == "Lock force released successfully"
        assert result["previous_holder"] == lock_holder

        # Verify lock was deleted
        mock_lock_table.delete_item.assert_called_once_with(
            Key={"threat_model_id": threat_model_id}
        )

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.collaboration_service.check_access")
    @patch("services.lock_service.dynamodb")
    def test_non_owner_raises_unauthorized_error(
        self, mock_dynamodb, mock_check_access
    ):
        """Test non-owner raises UnauthorizedError."""
        # Arrange
        threat_model_id = "test-job-123"
        non_owner = "user-456"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # User is not owner
        mock_check_access.return_value = {
            "is_owner": False,
            "has_access": True,
            "access_level": "EDIT",
        }

        # Act & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            force_release_lock(threat_model_id, non_owner)

        assert "Only the owner" in str(exc_info.value)

        # Verify lock was not deleted
        mock_lock_table.delete_item.assert_not_called()

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.collaboration_service.check_access")
    @patch("services.lock_service.dynamodb")
    def test_returns_success_if_no_lock_exists(self, mock_dynamodb, mock_check_access):
        """Test returns success if no lock exists."""
        # Arrange
        threat_model_id = "test-job-123"
        owner = "user-123"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # User is owner
        mock_check_access.return_value = {
            "is_owner": True,
            "has_access": True,
            "access_level": "OWNER",
        }

        # No lock exists
        mock_lock_table.get_item.return_value = {}

        # Act
        result = force_release_lock(threat_model_id, owner)

        # Assert
        assert result["success"] is True
        assert result["message"] == "No lock to release"

        # Verify delete was not called
        mock_lock_table.delete_item.assert_not_called()

    @patch.dict(os.environ, {"LOCKS_TABLE": "test-locks-table"})
    @patch("services.collaboration_service.check_access")
    @patch("services.lock_service.dynamodb")
    @patch("services.lock_service.LOG")
    def test_logs_previous_lock_holder(
        self, mock_log, mock_dynamodb, mock_check_access
    ):
        """Test logs previous lock holder."""
        # Arrange
        threat_model_id = "test-job-123"
        owner = "user-123"
        lock_holder = "user-789"

        mock_lock_table = Mock()
        mock_dynamodb.Table.return_value = mock_lock_table

        # User is owner
        mock_check_access.return_value = {
            "is_owner": True,
            "has_access": True,
            "access_level": "OWNER",
        }

        # Lock held by another user
        mock_lock_table.get_item.return_value = {
            "Item": {
                "threat_model_id": threat_model_id,
                "user_id": lock_holder,
                "lock_token": "token-789",
                "lock_timestamp": 1704067200,
            }
        }

        # Act
        result = force_release_lock(threat_model_id, owner)

        # Assert
        assert result["success"] is True
        assert result["previous_holder"] == lock_holder

        # Verify logging
        mock_log.info.assert_called()
        log_message = mock_log.info.call_args[0][0]
        assert "force released" in log_message.lower()
        assert lock_holder in log_message
