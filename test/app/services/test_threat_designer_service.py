"""
Unit tests for threat_designer_service.py

Tests cover:
- invoke_lambda: Invoke Bedrock Agent Core for threat modeling
- check_status: Check status of threat modeling job
- fetch_results: Fetch threat model results with access control
- update_results: Update threat model with lock and version control
- delete_tm: Delete threat model with proper authorization
- Helper functions: convert_decimals, calculate_content_hash, delete_s3_object, update_dynamodb_item
"""

import sys
import os
from pathlib import Path
from unittest.mock import Mock, patch, call, MagicMock
from decimal import Decimal
import pytest
import json
import copy
from botocore.exceptions import ClientError

# Add backend/app to path for imports
backend_path = str(Path(__file__).parent.parent.parent.parent / "backend" / "app")
sys.path.insert(0, backend_path)

# Mock AWS X-Ray before importing services
sys.modules["aws_xray_sdk"] = MagicMock()
sys.modules["aws_xray_sdk.core"] = MagicMock()

# Mock environment variables before importing service
os.environ["JOB_STATUS_TABLE"] = "test-status-table"
os.environ["AGENT_STATE_TABLE"] = "test-agent-table"
os.environ["AGENT_TRAIL_TABLE"] = "test-trail-table"
os.environ["THREAT_MODELING_AGENT"] = (
    "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent"
)
os.environ["THREAT_MODELING_LAMBDA"] = (
    "arn:aws:lambda:us-east-1:123456789012:function:test-function"
)
os.environ["ARCHITECTURE_BUCKET"] = "test-bucket"
os.environ["REGION"] = "us-east-1"
os.environ["SHARING_TABLE"] = "test-sharing-table"
os.environ["LOCKS_TABLE"] = "test-locks-table"

from services import threat_designer_service
from services.threat_designer_service import (
    invoke_lambda,
    check_status,
    fetch_results,
    update_results,
    delete_tm,
    convert_decimals,
    calculate_content_hash,
    delete_s3_object,
    update_dynamodb_item,
)
from exceptions.exceptions import (
    NotFoundError,
    UnauthorizedError,
    InternalError,
    ConflictError,
)


# ============================================================================
# Tests for invoke_lambda function
# ============================================================================


class TestInvokeLambda:
    """Tests for invoke_lambda function."""

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "REGION": "us-east-1",
        },
    )
    @patch("services.threat_designer_service.uuid.uuid4")
    @patch.object(threat_designer_service, "agent_core_client")
    @patch.object(threat_designer_service, "table")
    @patch("services.threat_designer_service.create_dynamodb_item")
    def test_invoke_lambda_creates_agent_state_and_job_status(
        self, mock_create_item, mock_status_table, mock_agent_client, mock_uuid
    ):
        """Test invoke_lambda creates agent state and job status in DynamoDB."""
        # Setup
        mock_uuid.return_value = Mock(hex="test-uuid-123")
        mock_uuid.return_value.__str__ = Mock(return_value="test-uuid-123")

        payload = {
            "s3_location": "test-key.json",
            "iteration": 1,
            "reasoning": 0,
            "description": "Test description",
            "assumptions": ["assumption1"],
            "title": "Test Title",
            "replay": False,
        }

        # Execute
        result = invoke_lambda("user-123", payload)

        # Assert
        assert result == {"id": "test-uuid-123"}

        # Verify agent_core_client.invoke_agent_runtime was called
        mock_agent_client.invoke_agent_runtime.assert_called_once()
        call_args = mock_agent_client.invoke_agent_runtime.call_args
        assert (
            call_args[1]["agentRuntimeArn"]
            == "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent"
        )

        # Verify payload structure
        payload_arg = json.loads(call_args[1]["payload"])
        assert payload_arg["input"]["s3_location"] == "test-key.json"
        assert payload_arg["input"]["owner"] == "user-123"
        assert payload_arg["input"]["replay"] is False

        # Verify create_dynamodb_item was called for agent state
        mock_create_item.assert_called_once()
        agent_state = mock_create_item.call_args[0][0]
        assert agent_state["job_id"] == "test-uuid-123"
        assert agent_state["owner"] == "user-123"
        assert agent_state["title"] == "Test Title"

        # Verify job status was created
        mock_status_table.put_item.assert_called_once()
        status_item = mock_status_table.put_item.call_args[1]["Item"]
        assert status_item["id"] == "test-uuid-123"
        assert status_item["state"] == "START"
        assert status_item["owner"] == "user-123"
        assert status_item["execution_owner"] == "user-123"

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "REGION": "us-east-1",
        },
    )
    @patch("services.threat_designer_service.uuid.uuid4")
    @patch.object(threat_designer_service, "agent_core_client")
    @patch.object(threat_designer_service, "table")
    @patch.object(threat_designer_service, "dynamodb")
    def test_invoke_lambda_creates_backup_before_replay(
        self, mock_dynamodb, mock_status_table, mock_agent_client, mock_uuid
    ):
        """Test invoke_lambda creates backup before replay."""
        # Setup
        mock_uuid.return_value = Mock(hex="test-uuid-123")
        mock_uuid.return_value.__str__ = Mock(return_value="session-id-123")

        mock_agent_table = Mock()

        existing_item = {
            "job_id": "existing-job-123",
            "owner": "user-123",
            "title": "Existing Title",
            "s3_location": "existing-key.json",
            "description": "Original description",
        }

        mock_agent_table.get_item.return_value = {"Item": existing_item}
        mock_dynamodb.Table.return_value = mock_agent_table

        payload = {
            "id": "existing-job-123",
            "s3_location": "test-key.json",
            "iteration": 2,
            "reasoning": 1,
            "description": "Updated description",
            "assumptions": ["assumption1"],
            "title": "Updated Title",
            "replay": True,
        }

        # Execute
        result = invoke_lambda("user-123", payload)

        # Assert
        assert result == {"id": "existing-job-123"}

        # Verify backup was created
        mock_agent_table.get_item.assert_called_once_with(
            Key={"job_id": "existing-job-123"}
        )
        mock_agent_table.put_item.assert_called_once()

        # Verify backup contains original data
        put_item_call = mock_agent_table.put_item.call_args[1]["Item"]
        assert "backup" in put_item_call
        assert put_item_call["backup"]["description"] == "Original description"
        assert "backup" not in put_item_call["backup"]  # No nested backups

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "REGION": "us-east-1",
        },
    )
    @patch("services.threat_designer_service.uuid.uuid4")
    @patch.object(threat_designer_service, "agent_core_client")
    @patch.object(threat_designer_service, "table")
    @patch("services.threat_designer_service.create_dynamodb_item")
    def test_invoke_lambda_handles_invocation_errors(
        self, mock_create_item, mock_status_table, mock_agent_client, mock_uuid
    ):
        """Test invoke_lambda handles Lambda invocation errors."""
        # Setup
        mock_uuid.return_value = Mock(hex="test-uuid-123")
        mock_uuid.return_value.__str__ = Mock(return_value="test-uuid-123")

        # Simulate invocation error
        mock_agent_client.invoke_agent_runtime.side_effect = Exception(
            "Invocation failed"
        )

        payload = {
            "s3_location": "test-key.json",
            "iteration": 1,
            "reasoning": 0,
            "description": "Test description",
            "assumptions": [],
            "title": "Test Title",
            "replay": False,
        }

        # Execute and Assert
        with pytest.raises(InternalError):
            invoke_lambda("user-123", payload)


# ============================================================================
# Tests for check_status function
# ============================================================================


class TestCheckStatus:
    """Tests for check_status function."""

    @patch.dict("os.environ", {"JOB_STATUS_TABLE": "test-status-table"})
    @patch.object(threat_designer_service, "table")
    def test_check_status_returns_status_for_existing_job(self, mock_table):
        """Test check_status returns status for existing job."""
        # Setup
        mock_table.get_item.return_value = {
            "Item": {
                "id": "test-job-123",
                "state": "COMPLETE",
                "retry": Decimal("2"),
                "detail": "Processing complete",
                "session_id": "session-123",
                "execution_owner": "user-123",
            }
        }

        # Execute
        result = check_status("test-job-123")

        # Assert
        assert result["id"] == "test-job-123"
        assert result["state"] == "COMPLETE"
        assert result["retry"] == 2
        assert result["detail"] == "Processing complete"
        assert result["session_id"] == "session-123"
        assert result["execution_owner"] == "user-123"
        mock_table.get_item.assert_called_once_with(Key={"id": "test-job-123"})

    @patch.dict("os.environ", {"JOB_STATUS_TABLE": "test-status-table"})
    @patch.object(threat_designer_service, "table")
    def test_check_status_returns_not_found_for_nonexistent_job(self, mock_table):
        """Test check_status returns 'Not Found' for non-existent job."""
        # Setup
        mock_table.get_item.return_value = {}

        # Execute
        result = check_status("nonexistent-job")

        # Assert
        assert result["id"] == "nonexistent-job"
        assert result["state"] == "Not Found"
        assert "retry" not in result
        assert "detail" not in result

    @patch.dict("os.environ", {"JOB_STATUS_TABLE": "test-status-table"})
    @patch.object(threat_designer_service, "table")
    def test_check_status_includes_retry_count_and_detail(self, mock_table):
        """Test check_status includes retry count and detail when present."""
        # Setup
        mock_table.get_item.return_value = {
            "Item": {
                "id": "test-job-123",
                "state": "FAILED",
                "retry": Decimal("3"),
                "detail": "Error: Connection timeout",
                "session_id": "session-123",
            }
        }

        # Execute
        result = check_status("test-job-123")

        # Assert
        assert result["retry"] == 3
        assert result["detail"] == "Error: Connection timeout"

    @patch.dict("os.environ", {"JOB_STATUS_TABLE": "test-status-table"})
    @patch.object(threat_designer_service, "table")
    def test_check_status_includes_execution_owner(self, mock_table):
        """Test check_status includes execution_owner when present."""
        # Setup
        mock_table.get_item.return_value = {
            "Item": {
                "id": "test-job-123",
                "state": "RUNNING",
                "retry": Decimal("0"),
                "session_id": "session-123",
                "execution_owner": "user-456",
            }
        }

        # Execute
        result = check_status("test-job-123")

        # Assert
        assert result["execution_owner"] == "user-456"


# ============================================================================
# Tests for fetch_results function
# ============================================================================


class TestFetchResults:
    """Tests for fetch_results function."""

    @patch.dict("os.environ", {"AGENT_STATE_TABLE": "test-agent-table"})
    @patch("services.collaboration_service.check_access")
    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_results_returns_threat_model_for_owner(
        self, mock_dynamodb, mock_check_access, sample_threat_model
    ):
        """Test fetch_results returns threat model for owner."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": sample_threat_model}
        mock_dynamodb.Table.return_value = mock_table

        mock_check_access.return_value = {
            "has_access": True,
            "is_owner": True,
            "access_level": "OWNER",
        }

        # Execute
        result = fetch_results("test-job-123", "user-123")

        # Assert
        assert result["job_id"] == "test-job-123"
        assert result["state"] == "Found"
        assert result["item"]["job_id"] == "test-job-123"
        assert result["item"]["is_owner"] is True
        assert result["item"]["access_level"] == "OWNER"

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.check_access")
    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_results_returns_threat_model_for_collaborator(
        self, mock_dynamodb, mock_check_access, sample_threat_model
    ):
        """Test fetch_results returns threat model for collaborator with access."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": sample_threat_model}
        mock_dynamodb.Table.return_value = mock_table

        mock_check_access.return_value = {
            "has_access": True,
            "is_owner": False,
            "access_level": "EDIT",
        }

        # Execute
        result = fetch_results("test-job-123", "user-456")

        # Assert
        assert result["state"] == "Found"
        assert result["item"]["is_owner"] is False
        assert result["item"]["access_level"] == "EDIT"
        mock_check_access.assert_called_once_with("test-job-123", "user-456")

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.check_access")
    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_results_raises_unauthorized_for_no_access(
        self, mock_dynamodb, mock_check_access, sample_threat_model
    ):
        """Test fetch_results raises UnauthorizedError for unauthorized user."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": sample_threat_model}
        mock_dynamodb.Table.return_value = mock_table

        mock_check_access.return_value = {
            "has_access": False,
            "is_owner": False,
            "access_level": None,
        }

        # Execute and Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            fetch_results("test-job-123", "user-789")

        assert "do not have access" in str(exc_info.value)

    @patch.dict("os.environ", {"AGENT_STATE_TABLE": "test-agent-table"})
    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_results_mcp_user_bypasses_authorization(
        self, mock_dynamodb, sample_threat_model
    ):
        """Test fetch_results allows MCP user to bypass authorization."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": sample_threat_model}
        mock_dynamodb.Table.return_value = mock_table

        # Execute
        result = fetch_results("test-job-123", "MCP")

        # Assert
        assert result["state"] == "Found"
        assert result["item"]["job_id"] == "test-job-123"
        # MCP user should not have access_level added
        assert "is_owner" not in result["item"]
        assert "access_level" not in result["item"]

    @patch.dict("os.environ", {"AGENT_STATE_TABLE": "test-agent-table"})
    @patch("services.collaboration_service.check_access")
    @patch.object(threat_designer_service, "dynamodb")
    @patch("services.threat_designer_service.datetime")
    def test_fetch_results_sets_last_modified_at_if_missing(
        self, mock_datetime, mock_dynamodb, mock_check_access, sample_threat_model
    ):
        """Test fetch_results sets last_modified_at if missing."""
        # Setup
        threat_model_without_timestamp = sample_threat_model.copy()
        del threat_model_without_timestamp["last_modified_at"]

        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": threat_model_without_timestamp}
        mock_dynamodb.Table.return_value = mock_table

        mock_check_access.return_value = {
            "has_access": True,
            "is_owner": True,
            "access_level": "OWNER",
        }

        mock_now = Mock()
        mock_now.isoformat.return_value = "2024-01-01T12:00:00Z"
        mock_datetime.datetime.now.return_value = mock_now

        # Execute
        result = fetch_results("test-job-123", "user-123")

        # Assert
        assert "last_modified_at" in result["item"]
        assert result["item"]["last_modified_at"] == "2024-01-01T12:00:00Z"


# ============================================================================
# Tests for update_results function
# ============================================================================


class TestUpdateResults:
    """Tests for update_results function."""

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "LOCKS_TABLE": "test-locks-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("utils.authorization.require_access")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.calculate_content_hash")
    @patch("services.threat_designer_service.update_dynamodb_item")
    @patch.object(threat_designer_service, "dynamodb")
    @patch("services.threat_designer_service.datetime")
    def test_update_results_owner_can_update_with_valid_lock(
        self,
        mock_datetime,
        mock_dynamodb,
        mock_update_item,
        mock_hash,
        mock_lock_status,
        mock_require_access,
        sample_threat_model,
    ):
        """Test owner can update threat model with valid lock."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": sample_threat_model}
        mock_dynamodb.Table.return_value = mock_table

        mock_require_access.return_value = None  # No exception means authorized
        mock_lock_status.return_value = {
            "locked": True,
            "user_id": "user-123",
            "lock_token": "token-123",
        }
        mock_hash.side_effect = ["new-hash", "old-hash"]  # Different hashes

        mock_now = Mock()
        mock_now.isoformat.return_value = "2024-01-02T00:00:00Z"
        mock_datetime.datetime.now.return_value = mock_now

        mock_update_item.return_value = {
            "job_id": "test-job-123",
            "description": "Updated",
        }

        payload = {
            "description": "Updated description",
            "client_last_modified_at": "2024-01-01T00:00:00Z",
        }

        # Execute
        result = update_results("test-job-123", payload, "user-123", "token-123")

        # Assert
        mock_require_access.assert_called_once_with(
            "test-job-123", "user-123", required_level="EDIT"
        )
        mock_lock_status.assert_called_once_with("test-job-123")
        assert result["job_id"] == "test-job-123"

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "LOCKS_TABLE": "test-locks-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("utils.authorization.require_access")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.calculate_content_hash")
    @patch("services.threat_designer_service.update_dynamodb_item")
    @patch.object(threat_designer_service, "dynamodb")
    @patch("services.threat_designer_service.datetime")
    def test_update_results_collaborator_with_edit_access_can_update(
        self,
        mock_datetime,
        mock_dynamodb,
        mock_update_item,
        mock_hash,
        mock_lock_status,
        mock_require_access,
        sample_threat_model,
    ):
        """Test collaborator with EDIT access can update threat model."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": sample_threat_model}
        mock_dynamodb.Table.return_value = mock_table

        mock_require_access.return_value = None
        mock_lock_status.return_value = {
            "locked": True,
            "user_id": "user-456",
            "lock_token": "token-456",
        }
        mock_hash.side_effect = ["new-hash", "old-hash"]

        mock_now = Mock()
        mock_now.isoformat.return_value = "2024-01-02T00:00:00Z"
        mock_datetime.datetime.now.return_value = mock_now

        mock_update_item.return_value = {"job_id": "test-job-123"}

        payload = {
            "description": "Updated by collaborator",
            "client_last_modified_at": "2024-01-01T00:00:00Z",
        }

        # Execute
        result = update_results("test-job-123", payload, "user-456", "token-456")

        # Assert
        mock_require_access.assert_called_once_with(
            "test-job-123", "user-456", required_level="EDIT"
        )
        assert result is not None

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "LOCKS_TABLE": "test-locks-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("utils.authorization.require_access")
    @patch("services.lock_service.get_lock_status")
    def test_update_results_raises_unauthorized_without_lock(
        self, mock_lock_status, mock_require_access
    ):
        """Test update_results raises UnauthorizedError without lock."""
        # Setup
        mock_require_access.return_value = None
        mock_lock_status.return_value = {"locked": False}

        payload = {"description": "Updated"}

        # Execute and Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            update_results("test-job-123", payload, "user-123")

        assert "must acquire a lock" in str(exc_info.value)

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "LOCKS_TABLE": "test-locks-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("utils.authorization.require_access")
    @patch("services.lock_service.get_lock_status")
    def test_update_results_raises_unauthorized_with_invalid_lock_token(
        self, mock_lock_status, mock_require_access
    ):
        """Test update_results raises UnauthorizedError with invalid lock token."""
        # Setup
        mock_require_access.return_value = None
        mock_lock_status.return_value = {
            "locked": True,
            "user_id": "user-123",
            "lock_token": "token-123",
        }

        payload = {"description": "Updated"}

        # Execute and Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            update_results("test-job-123", payload, "user-123", "wrong-token")

        assert "Invalid lock token" in str(exc_info.value)

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "LOCKS_TABLE": "test-locks-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("utils.authorization.require_access")
    @patch("services.lock_service.get_lock_status")
    @patch.object(threat_designer_service, "dynamodb")
    def test_update_results_detects_version_conflicts(
        self, mock_dynamodb, mock_lock_status, mock_require_access, sample_threat_model
    ):
        """Test update_results detects version conflicts."""
        # Setup
        server_item = sample_threat_model.copy()
        server_item["last_modified_at"] = "2024-01-02T00:00:00Z"

        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": server_item}
        mock_dynamodb.Table.return_value = mock_table

        mock_require_access.return_value = None
        mock_lock_status.return_value = {
            "locked": True,
            "user_id": "user-123",
            "lock_token": "token-123",
        }

        payload = {
            "description": "Updated",
            "client_last_modified_at": "2024-01-01T00:00:00Z",  # Older than server
        }

        # Execute and Assert
        with pytest.raises(ConflictError) as exc_info:
            update_results("test-job-123", payload, "user-123", "token-123")

        # ConflictError stores the dict in the details attribute
        error_details = exc_info.value.details
        assert "modified by another user" in error_details["message"]
        assert error_details["server_timestamp"] == "2024-01-02T00:00:00Z"
        assert error_details["client_timestamp"] == "2024-01-01T00:00:00Z"

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "LOCKS_TABLE": "test-locks-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("utils.authorization.require_access")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.calculate_content_hash")
    @patch("services.threat_designer_service.update_dynamodb_item")
    @patch.object(threat_designer_service, "dynamodb")
    def test_update_results_preserves_timestamp_when_no_content_change(
        self,
        mock_dynamodb,
        mock_update_item,
        mock_hash,
        mock_lock_status,
        mock_require_access,
        sample_threat_model,
    ):
        """Test update_results preserves timestamp when content hasn't changed."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": sample_threat_model}
        mock_dynamodb.Table.return_value = mock_table

        mock_require_access.return_value = None
        mock_lock_status.return_value = {
            "locked": True,
            "user_id": "user-123",
            "lock_token": "token-123",
        }
        # Same hash means no content change
        mock_hash.return_value = "abc123def456"

        mock_update_item.return_value = {"job_id": "test-job-123"}

        payload = {
            "description": "Test description for threat model",
            "client_last_modified_at": "2024-01-01T00:00:00Z",
        }

        # Execute
        update_results("test-job-123", payload, "user-123", "token-123")

        # Assert - timestamp should be preserved
        update_call = mock_update_item.call_args[0][2]
        assert update_call["last_modified_at"] == "2024-01-01T00:00:00Z"
        assert update_call["last_modified_by"] == "user-123"

    @patch.dict("os.environ", {"AGENT_STATE_TABLE": "test-agent-table"})
    @patch("services.threat_designer_service.update_dynamodb_item")
    @patch.object(threat_designer_service, "dynamodb")
    def test_update_results_mcp_user_bypasses_lock_checks(
        self, mock_dynamodb, mock_update_item, sample_threat_model
    ):
        """Test MCP user bypasses lock checks."""
        # Setup
        mock_table = Mock()
        mock_dynamodb.Table.return_value = mock_table

        mock_update_item.return_value = {
            "job_id": "test-job-123",
            "description": "Updated",
        }

        payload = {"description": "Updated by MCP"}

        # Execute
        result = update_results("test-job-123", payload, "MCP")

        # Assert - should succeed without lock checks
        assert result["job_id"] == "test-job-123"
        mock_update_item.assert_called_once()

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "LOCKS_TABLE": "test-locks-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("utils.authorization.require_access")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.calculate_content_hash")
    @patch("services.threat_designer_service.update_dynamodb_item")
    @patch.object(threat_designer_service, "dynamodb")
    @patch("services.threat_designer_service.datetime")
    def test_update_results_calculates_and_stores_content_hash(
        self,
        mock_datetime,
        mock_dynamodb,
        mock_update_item,
        mock_hash,
        mock_lock_status,
        mock_require_access,
        sample_threat_model,
    ):
        """Test update_results calculates and stores content hash."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {"Item": sample_threat_model}
        mock_dynamodb.Table.return_value = mock_table

        mock_require_access.return_value = None
        mock_lock_status.return_value = {
            "locked": True,
            "user_id": "user-123",
            "lock_token": "token-123",
        }
        mock_hash.side_effect = ["new-hash-xyz", "old-hash-abc"]

        mock_now = Mock()
        mock_now.isoformat.return_value = "2024-01-02T00:00:00Z"
        mock_datetime.datetime.now.return_value = mock_now

        mock_update_item.return_value = {"job_id": "test-job-123"}

        payload = {
            "description": "New description",
            "client_last_modified_at": "2024-01-01T00:00:00Z",
        }

        # Execute
        update_results("test-job-123", payload, "user-123", "token-123")

        # Assert - content_hash should be in payload
        update_call = mock_update_item.call_args[0][2]
        assert update_call["content_hash"] == "new-hash-xyz"


# ============================================================================
# Tests for delete_tm function
# ============================================================================


class TestDeleteThreatModel:
    """Tests for delete_tm function."""

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
        },
    )
    @patch("utils.authorization.require_owner")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.check_status")
    @patch("services.threat_designer_service.fetch_results")
    @patch("services.threat_designer_service.delete_dynamodb_item")
    @patch("services.threat_designer_service.delete_s3_object")
    @patch.object(threat_designer_service, "dynamodb")
    def test_delete_tm_owner_can_delete(
        self,
        mock_dynamodb,
        mock_delete_s3,
        mock_delete_db,
        mock_fetch,
        mock_check_status,
        mock_lock_status,
        mock_require_owner,
    ):
        """Test owner can delete threat model."""
        # Setup
        mock_require_owner.return_value = None
        mock_lock_status.return_value = {"locked": False}
        mock_check_status.return_value = {"state": "COMPLETE"}
        mock_fetch.return_value = {"item": {"s3_location": "test-key.json"}}

        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {"Items": []}
        mock_dynamodb.Table.return_value = mock_sharing_table

        # Execute
        result = delete_tm("test-job-123", "user-123")

        # Assert
        assert result["job_id"] == "test-job-123"
        assert result["state"] == "Deleted"
        mock_require_owner.assert_called_once_with("test-job-123", "user-123")
        mock_delete_s3.assert_called_once_with("test-key.json")

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
        },
    )
    @patch("utils.authorization.require_owner")
    def test_delete_tm_non_owner_raises_unauthorized(self, mock_require_owner):
        """Test non-owner cannot delete threat model."""
        # Setup
        mock_require_owner.side_effect = UnauthorizedError("Not owner")

        # Execute and Assert
        with pytest.raises(UnauthorizedError):
            delete_tm("test-job-123", "user-456")

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
        },
    )
    @patch("utils.authorization.require_owner")
    @patch("services.lock_service.get_lock_status")
    @patch("services.lock_service.force_release_lock")
    @patch("services.threat_designer_service.check_status")
    @patch("services.threat_designer_service.fetch_results")
    @patch("services.threat_designer_service.delete_dynamodb_item")
    @patch("services.threat_designer_service.delete_s3_object")
    @patch.object(threat_designer_service, "dynamodb")
    def test_delete_tm_force_releases_lock_if_requested(
        self,
        mock_dynamodb,
        mock_delete_s3,
        mock_delete_db,
        mock_fetch,
        mock_check_status,
        mock_force_release,
        mock_lock_status,
        mock_require_owner,
    ):
        """Test delete_tm force releases lock if requested."""
        # Setup
        mock_require_owner.return_value = None
        mock_lock_status.return_value = {
            "locked": True,
            "user_id": "user-456",  # Different user holds lock
        }
        mock_check_status.return_value = {"state": "COMPLETE"}
        mock_fetch.return_value = {"item": {"s3_location": "test-key.json"}}

        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {"Items": []}
        mock_dynamodb.Table.return_value = mock_sharing_table

        # Execute
        result = delete_tm("test-job-123", "user-123", force_release=True)

        # Assert
        assert result["state"] == "Deleted"
        mock_force_release.assert_called_once_with("test-job-123", "user-123")

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
        },
    )
    @patch("utils.authorization.require_owner")
    @patch("services.lock_service.get_lock_status")
    def test_delete_tm_raises_conflict_if_locked_without_force_release(
        self, mock_lock_status, mock_require_owner
    ):
        """Test delete_tm raises ConflictError if locked without force_release."""
        # Setup
        mock_require_owner.return_value = None
        mock_lock_status.return_value = {"locked": True, "user_id": "user-456"}

        # Execute and Assert
        with pytest.raises(ConflictError) as exc_info:
            delete_tm("test-job-123", "user-123", force_release=False)

        assert "locked by user-456" in str(exc_info.value)
        assert "force_release=true" in str(exc_info.value)

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
        },
    )
    @patch("utils.authorization.require_owner")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.check_status")
    @patch("services.threat_designer_service.delete_session")
    @patch("services.threat_designer_service.fetch_results")
    @patch("services.threat_designer_service.delete_dynamodb_item")
    @patch("services.threat_designer_service.delete_s3_object")
    @patch.object(threat_designer_service, "dynamodb")
    def test_delete_tm_stops_active_execution_before_deletion(
        self,
        mock_dynamodb,
        mock_delete_s3,
        mock_delete_db,
        mock_fetch,
        mock_delete_session,
        mock_check_status,
        mock_lock_status,
        mock_require_owner,
    ):
        """Test delete_tm stops active execution before deletion."""
        # Setup
        mock_require_owner.return_value = None
        mock_lock_status.return_value = {"locked": False}
        mock_check_status.return_value = {
            "state": "RUNNING",
            "session_id": "session-123",
        }
        mock_fetch.return_value = {"item": {"s3_location": "test-key.json"}}

        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {"Items": []}
        mock_dynamodb.Table.return_value = mock_sharing_table

        # Execute
        result = delete_tm("test-job-123", "user-123")

        # Assert
        mock_delete_session.assert_called_once_with(
            "test-job-123", "session-123", "user-123", override_execution_owner=True
        )
        assert result["state"] == "Deleted"

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
        },
    )
    @patch("utils.authorization.require_owner")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.check_status")
    @patch("services.threat_designer_service.fetch_results")
    @patch("services.threat_designer_service.delete_dynamodb_item")
    @patch("services.threat_designer_service.delete_s3_object")
    @patch.object(threat_designer_service, "dynamodb")
    def test_delete_tm_deletes_s3_object(
        self,
        mock_dynamodb,
        mock_delete_s3,
        mock_delete_db,
        mock_fetch,
        mock_check_status,
        mock_lock_status,
        mock_require_owner,
    ):
        """Test delete_tm deletes S3 object."""
        # Setup
        mock_require_owner.return_value = None
        mock_lock_status.return_value = {"locked": False}
        mock_check_status.return_value = {"state": "COMPLETE"}
        mock_fetch.return_value = {
            "item": {"s3_location": "architecture/test-key.json"}
        }

        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {"Items": []}
        mock_dynamodb.Table.return_value = mock_sharing_table

        # Execute
        delete_tm("test-job-123", "user-123")

        # Assert
        mock_delete_s3.assert_called_once_with("architecture/test-key.json")

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
        },
    )
    @patch("utils.authorization.require_owner")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.check_status")
    @patch("services.threat_designer_service.fetch_results")
    @patch("services.threat_designer_service.delete_dynamodb_item")
    @patch("services.threat_designer_service.delete_s3_object")
    @patch.object(threat_designer_service, "dynamodb")
    def test_delete_tm_cleans_up_sharing_records(
        self,
        mock_dynamodb,
        mock_delete_s3,
        mock_delete_db,
        mock_fetch,
        mock_check_status,
        mock_lock_status,
        mock_require_owner,
    ):
        """Test delete_tm cleans up sharing records."""
        # Setup
        mock_require_owner.return_value = None
        mock_lock_status.return_value = {"locked": False}
        mock_check_status.return_value = {"state": "COMPLETE"}
        mock_fetch.return_value = {"item": {"s3_location": "test-key.json"}}

        mock_sharing_table = Mock()
        mock_batch_writer = Mock()
        mock_sharing_table.batch_writer.return_value.__enter__ = Mock(
            return_value=mock_batch_writer
        )
        mock_sharing_table.batch_writer.return_value.__exit__ = Mock(return_value=False)
        mock_sharing_table.query.return_value = {
            "Items": [
                {"threat_model_id": "test-job-123", "user_id": "user-456"},
                {"threat_model_id": "test-job-123", "user_id": "user-789"},
            ]
        }
        mock_dynamodb.Table.return_value = mock_sharing_table

        # Execute
        delete_tm("test-job-123", "user-123")

        # Assert
        assert mock_batch_writer.delete_item.call_count == 2


# ============================================================================
# Tests for helper functions
# ============================================================================


class TestHelperFunctions:
    """Tests for helper functions."""

    def test_convert_decimals_handles_nested_structures(self):
        """Test convert_decimals handles nested structures."""
        # Setup
        data = {
            "count": Decimal("42"),
            "nested": {
                "value": Decimal("3.14"),
                "list": [Decimal("1"), Decimal("2.5")],
            },
            "list": [{"id": Decimal("100")}, {"id": Decimal("200")}],
        }

        # Execute
        result = convert_decimals(data)

        # Assert
        assert result["count"] == 42
        assert result["nested"]["value"] == 3.14
        assert result["nested"]["list"] == [1, 2.5]
        assert result["list"][0]["id"] == 100
        assert result["list"][1]["id"] == 200

    def test_calculate_content_hash_excludes_metadata(self):
        """Test calculate_content_hash excludes metadata fields."""
        # Setup
        data1 = {
            "description": "Test description",
            "assumptions": ["assumption1"],
            "threat_list": [{"id": 1, "name": "Threat 1"}],
            "assets": ["asset1"],
            "system_architecture": {"type": "web"},
            "last_modified_at": "2024-01-01T00:00:00Z",
            "last_modified_by": "user-123",
            "lock_token": "token-123",
        }

        data2 = {
            "description": "Test description",
            "assumptions": ["assumption1"],
            "threat_list": [{"id": 1, "name": "Threat 1"}],
            "assets": ["asset1"],
            "system_architecture": {"type": "web"},
            "last_modified_at": "2024-01-02T00:00:00Z",  # Different timestamp
            "last_modified_by": "user-456",  # Different user
            "lock_token": "token-456",  # Different token
        }

        # Execute
        hash1 = calculate_content_hash(data1)
        hash2 = calculate_content_hash(data2)

        # Assert - hashes should be equal (metadata excluded)
        assert hash1 == hash2

    def test_calculate_content_hash_is_consistent(self):
        """Test calculate_content_hash produces consistent results."""
        # Setup
        data = {
            "description": "Test",
            "assumptions": ["a", "b"],
            "threat_list": [],
            "assets": [],
            "system_architecture": {},
        }

        # Execute
        hash1 = calculate_content_hash(data)
        hash2 = calculate_content_hash(data)

        # Assert
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 produces 64 character hex string

    @patch("boto3.client")
    def test_delete_s3_object_calls_s3_correctly(self, mock_boto_client):
        """Test delete_s3_object calls S3 correctly."""
        # Setup
        mock_s3 = Mock()
        mock_s3.delete_object.return_value = {
            "ResponseMetadata": {"HTTPStatusCode": 204}
        }
        mock_boto_client.return_value = mock_s3

        # Execute
        result = delete_s3_object("test-key.json", "test-bucket")

        # Assert
        mock_s3.delete_object.assert_called_once_with(
            Bucket="test-bucket", Key="test-key.json"
        )
        assert result["ResponseMetadata"]["HTTPStatusCode"] == 204

    @patch("boto3.client")
    def test_delete_s3_object_handles_errors(self, mock_boto_client):
        """Test delete_s3_object handles S3 errors."""
        # Setup
        mock_s3 = Mock()
        mock_s3.delete_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "Key not found"}}, "DeleteObject"
        )
        mock_boto_client.return_value = mock_s3

        # Execute and Assert
        with pytest.raises(ClientError):
            delete_s3_object("nonexistent-key.json")

    def test_update_dynamodb_item_validates_owner(self):
        """Test update_dynamodb_item validates owner."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {
            "Item": {
                "job_id": "test-job-123",
                "owner": "user-123",
                "s3_location": "test-key.json",
            }
        }
        mock_table.update_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException"}}, "UpdateItem"
        )

        key = {"job_id": "test-job-123"}
        update_attrs = {"description": "Updated"}

        # Execute and Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            update_dynamodb_item(mock_table, key, update_attrs, "user-456")

        assert "Owner validation failed" in str(exc_info.value)

    def test_update_dynamodb_item_removes_locked_attributes(self):
        """Test update_dynamodb_item removes locked attributes from updates."""
        # Setup
        mock_table = Mock()
        mock_table.get_item.return_value = {
            "Item": {
                "job_id": "test-job-123",
                "owner": "user-123",
                "s3_location": "test-key.json",
            }
        }
        mock_table.update_item.return_value = {
            "Attributes": {
                "job_id": "test-job-123",
                "owner": "user-123",
                "description": "Updated",
            }
        }

        key = {"job_id": "test-job-123"}
        update_attrs = {
            "description": "Updated",
            "owner": "user-456",  # Should be removed
            "s3_location": "new-key.json",  # Should be removed
            "job_id": "new-job-id",  # Should be removed
        }

        # Execute
        result = update_dynamodb_item(mock_table, key, update_attrs, "user-123")

        # Assert
        update_call = mock_table.update_item.call_args
        # Verify locked attributes are not in the update expression
        update_expression = update_call[1]["UpdateExpression"]
        assert "owner" not in update_expression
        assert "s3_location" not in update_expression
        assert "job_id" not in update_expression
        assert "description" in update_expression


# ============================================================================
# Tests for extract_threat_model_id_from_s3_location function
# ============================================================================


class TestExtractThreatModelIdFromS3Location:
    """Tests for extract_threat_model_id_from_s3_location function."""

    def test_extract_valid_uuid(self):
        """Test extraction of valid UUID from S3 location."""
        # Setup
        valid_uuid = "550e8400-e29b-41d4-a716-446655440000"

        # Execute
        from services.threat_designer_service import (
            extract_threat_model_id_from_s3_location,
        )

        result = extract_threat_model_id_from_s3_location(valid_uuid)

        # Assert
        assert result == valid_uuid

    def test_extract_valid_uuid_with_whitespace(self):
        """Test extraction handles leading/trailing whitespace."""
        # Setup
        valid_uuid = "550e8400-e29b-41d4-a716-446655440000"
        s3_location_with_spaces = f"  {valid_uuid}  "

        # Execute
        from services.threat_designer_service import (
            extract_threat_model_id_from_s3_location,
        )

        result = extract_threat_model_id_from_s3_location(s3_location_with_spaces)

        # Assert
        assert result == valid_uuid

    def test_extract_raises_value_error_for_empty_string(self):
        """Test extraction raises ValueError for empty string."""
        # Execute and Assert
        from services.threat_designer_service import (
            extract_threat_model_id_from_s3_location,
        )

        with pytest.raises(ValueError) as exc_info:
            extract_threat_model_id_from_s3_location("")

        assert "cannot be empty" in str(exc_info.value)

    def test_extract_raises_value_error_for_whitespace_only(self):
        """Test extraction raises ValueError for whitespace-only string."""
        # Execute and Assert
        from services.threat_designer_service import (
            extract_threat_model_id_from_s3_location,
        )

        with pytest.raises(ValueError) as exc_info:
            extract_threat_model_id_from_s3_location("   ")

        assert "cannot be empty" in str(exc_info.value)

    def test_extract_raises_not_found_error_for_invalid_uuid_format(self):
        """Test extraction raises NotFoundError for invalid UUID format."""
        # Setup
        invalid_formats = [
            "not-a-uuid",
            "12345",
            "550e8400-e29b-41d4-a716",  # Incomplete UUID
            "550e8400-e29b-41d4-a716-446655440000-extra",  # Extra characters
            "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  # Invalid characters
        ]

        # Execute and Assert
        from services.threat_designer_service import (
            extract_threat_model_id_from_s3_location,
        )

        for invalid_format in invalid_formats:
            with pytest.raises(NotFoundError) as exc_info:
                extract_threat_model_id_from_s3_location(invalid_format)

            assert "Invalid threat model ID format" in str(exc_info.value)

    def test_extract_handles_uppercase_uuid(self):
        """Test extraction handles uppercase UUID."""
        # Setup
        uppercase_uuid = "550E8400-E29B-41D4-A716-446655440000"

        # Execute
        from services.threat_designer_service import (
            extract_threat_model_id_from_s3_location,
        )

        result = extract_threat_model_id_from_s3_location(uppercase_uuid)

        # Assert - UUID validation should accept uppercase
        assert result.lower() == uppercase_uuid.lower()

    def test_extract_handles_mixed_case_uuid(self):
        """Test extraction handles mixed case UUID."""
        # Setup
        mixed_case_uuid = "550e8400-E29B-41d4-A716-446655440000"

        # Execute
        from services.threat_designer_service import (
            extract_threat_model_id_from_s3_location,
        )

        result = extract_threat_model_id_from_s3_location(mixed_case_uuid)

        # Assert
        assert result.lower() == mixed_case_uuid.lower()


# ============================================================================
# Property-Based Tests for Authorization
# ============================================================================

from hypothesis import given, strategies as st, settings


class TestSingleDownloadAuthorizationProperty:
    """
    Property-based tests for single download authorization.

    Feature: batch-presigned-url-authorization, Property 4: Authorization enforcement
    Validates: Requirements 2.1
    """

    @given(
        threat_model_id=st.uuids().map(str),
        user_id=st.uuids().map(str),
        access_level=st.sampled_from(["OWNER", "READ_ONLY", "EDIT", "NONE"]),
    )
    @settings(max_examples=100)
    def test_authorization_always_checked_before_presigned_url_generation(
        self, threat_model_id, user_id, access_level
    ):
        """
        Property: For any presigned URL request (single or batch), the system should
        verify the requesting user has at least READ_ONLY access to the threat model
        associated with each S3 location before generating the presigned URL.

        Feature: batch-presigned-url-authorization, Property 4: Authorization enforcement
        Validates: Requirements 2.1
        """
        from services.threat_designer_service import generate_presigned_download_url
        from unittest.mock import patch, MagicMock

        # Mock the authorization check - patch where it's imported
        with (
            patch("utils.authorization.require_access") as mock_require_access,
            patch(
                "services.threat_designer_service.extract_threat_model_id_from_s3_location"
            ) as mock_extract,
            patch("services.threat_designer_service.s3_pre") as mock_s3,
        ):
            # Setup mocks
            mock_extract.return_value = threat_model_id
            mock_s3.generate_presigned_url.return_value = (
                f"https://s3.example.com/{threat_model_id}"
            )

            # Configure authorization based on access level
            if access_level == "NONE":
                mock_require_access.side_effect = UnauthorizedError("No access")
            else:
                mock_require_access.return_value = {
                    "has_access": True,
                    "is_owner": access_level == "OWNER",
                    "access_level": access_level,
                }

            # Execute
            if access_level == "NONE":
                # Should raise UnauthorizedError
                with pytest.raises(UnauthorizedError):
                    generate_presigned_download_url(threat_model_id, user_id)

                # Verify authorization was checked
                mock_require_access.assert_called_once_with(
                    threat_model_id, user_id, required_level="READ_ONLY"
                )

                # Verify presigned URL was NOT generated
                mock_s3.generate_presigned_url.assert_not_called()
            else:
                # Should succeed
                result = generate_presigned_download_url(threat_model_id, user_id)

                # Verify authorization was checked BEFORE generating URL
                mock_require_access.assert_called_once_with(
                    threat_model_id, user_id, required_level="READ_ONLY"
                )

                # Verify presigned URL was generated
                mock_s3.generate_presigned_url.assert_called_once()
                assert result == f"https://s3.example.com/{threat_model_id}"

    @given(
        threat_model_id=st.uuids().map(str),
        owner_id=st.uuids().map(str),
        collaborator_id=st.uuids().map(str),
        unauthorized_user_id=st.uuids().map(str),
    )
    @settings(max_examples=100)
    def test_authorization_enforces_access_control(
        self, threat_model_id, owner_id, collaborator_id, unauthorized_user_id
    ):
        """
        Property: Authorization should grant access to owners and collaborators,
        but deny access to unauthorized users.

        Feature: batch-presigned-url-authorization, Property 4: Authorization enforcement
        Validates: Requirements 2.1
        """
        from services.threat_designer_service import generate_presigned_download_url
        from unittest.mock import patch

        # Test cases: (user_id, should_have_access)
        test_cases = [
            (owner_id, True),
            (collaborator_id, True),
            (unauthorized_user_id, False),
        ]

        for user_id, should_have_access in test_cases:
            with (
                patch("utils.authorization.require_access") as mock_require_access,
                patch(
                    "services.threat_designer_service.extract_threat_model_id_from_s3_location"
                ) as mock_extract,
                patch("services.threat_designer_service.s3_pre") as mock_s3,
            ):
                # Setup mocks
                mock_extract.return_value = threat_model_id
                mock_s3.generate_presigned_url.return_value = (
                    f"https://s3.example.com/{threat_model_id}"
                )

                if should_have_access:
                    mock_require_access.return_value = {
                        "has_access": True,
                        "is_owner": user_id == owner_id,
                        "access_level": "OWNER" if user_id == owner_id else "READ_ONLY",
                    }

                    # Should succeed
                    result = generate_presigned_download_url(threat_model_id, user_id)
                    assert result == f"https://s3.example.com/{threat_model_id}"

                    # Verify authorization was checked
                    mock_require_access.assert_called_once_with(
                        threat_model_id, user_id, required_level="READ_ONLY"
                    )
                else:
                    mock_require_access.side_effect = UnauthorizedError("No access")

                    # Should raise UnauthorizedError
                    with pytest.raises(UnauthorizedError):
                        generate_presigned_download_url(threat_model_id, user_id)

                    # Verify authorization was checked
                    mock_require_access.assert_called_once_with(
                        threat_model_id, user_id, required_level="READ_ONLY"
                    )

                    # Verify presigned URL was NOT generated
                    mock_s3.generate_presigned_url.assert_not_called()


class TestSufficientAccessGrantsPresignedURLsProperty:
    """
    Property-based tests for sufficient access granting presigned URLs.

    Feature: batch-presigned-url-authorization, Property 6: Sufficient access grants presigned URLs
    Validates: Requirements 2.5, 3.1, 3.2
    """

    @given(
        threat_model_id=st.uuids().map(str),
        user_id=st.uuids().map(str),
        access_level=st.sampled_from(["OWNER", "READ_ONLY", "EDIT"]),
    )
    @settings(max_examples=100)
    def test_sufficient_access_levels_generate_presigned_urls(
        self, threat_model_id, user_id, access_level
    ):
        """
        Property: For any user who is either the owner of a threat model OR a collaborator
        with READ_ONLY or EDIT access, requesting a presigned URL for that threat model's
        architecture diagram should succeed and return a valid presigned URL.

        Feature: batch-presigned-url-authorization, Property 6: Sufficient access grants presigned URLs
        Validates: Requirements 2.5, 3.1, 3.2
        """
        from services.threat_designer_service import (
            generate_presigned_download_url_with_auth,
        )
        from unittest.mock import patch

        with (
            patch("utils.authorization.require_access") as mock_require_access,
            patch(
                "services.threat_designer_service.extract_threat_model_id_from_s3_location"
            ) as mock_extract,
            patch("services.threat_designer_service.s3_pre") as mock_s3,
        ):
            # Setup mocks
            mock_extract.return_value = threat_model_id
            expected_url = f"https://s3.example.com/{threat_model_id}"
            mock_s3.generate_presigned_url.return_value = expected_url

            # Configure authorization - all these access levels should succeed
            mock_require_access.return_value = {
                "has_access": True,
                "is_owner": access_level == "OWNER",
                "access_level": access_level,
            }

            # Execute - should succeed for all sufficient access levels
            result = generate_presigned_download_url_with_auth(
                threat_model_id, user_id, expiration=300
            )

            # Verify authorization was checked with READ_ONLY requirement
            mock_require_access.assert_called_once_with(
                threat_model_id, user_id, required_level="READ_ONLY"
            )

            # Verify presigned URL was generated
            mock_s3.generate_presigned_url.assert_called_once()

            # Verify correct URL was returned
            assert result == expected_url

            # Verify the presigned URL call had correct parameters
            call_kwargs = mock_s3.generate_presigned_url.call_args[1]
            assert call_kwargs["Params"]["Bucket"] == os.environ.get(
                "ARCHITECTURE_BUCKET"
            )
            assert call_kwargs["Params"]["Key"] == threat_model_id
            assert call_kwargs["ExpiresIn"] == 300
            assert call_kwargs["HttpMethod"] == "GET"

    @given(
        threat_model_id=st.uuids().map(str),
        owner_id=st.uuids().map(str),
        read_only_user_id=st.uuids().map(str),
        edit_user_id=st.uuids().map(str),
    )
    @settings(max_examples=100)
    def test_all_access_levels_can_generate_presigned_urls(
        self, threat_model_id, owner_id, read_only_user_id, edit_user_id
    ):
        """
        Property: All sufficient access levels (OWNER, READ_ONLY, EDIT) should be able
        to generate presigned URLs for the same threat model.

        Feature: batch-presigned-url-authorization, Property 6: Sufficient access grants presigned URLs
        Validates: Requirements 2.5, 3.1, 3.2
        """
        from services.threat_designer_service import (
            generate_presigned_download_url_with_auth,
        )
        from unittest.mock import patch

        # Test cases: (user_id, access_level)
        test_cases = [
            (owner_id, "OWNER"),
            (read_only_user_id, "READ_ONLY"),
            (edit_user_id, "EDIT"),
        ]

        for user_id, access_level in test_cases:
            with (
                patch("utils.authorization.require_access") as mock_require_access,
                patch(
                    "services.threat_designer_service.extract_threat_model_id_from_s3_location"
                ) as mock_extract,
                patch("services.threat_designer_service.s3_pre") as mock_s3,
            ):
                # Setup mocks
                mock_extract.return_value = threat_model_id
                expected_url = (
                    f"https://s3.example.com/{threat_model_id}?user={user_id}"
                )
                mock_s3.generate_presigned_url.return_value = expected_url

                # Configure authorization - should succeed
                mock_require_access.return_value = {
                    "has_access": True,
                    "is_owner": access_level == "OWNER",
                    "access_level": access_level,
                }

                # Execute - should succeed
                result = generate_presigned_download_url_with_auth(
                    threat_model_id, user_id
                )

                # Verify authorization was checked
                mock_require_access.assert_called_once_with(
                    threat_model_id, user_id, required_level="READ_ONLY"
                )

                # Verify presigned URL was generated
                mock_s3.generate_presigned_url.assert_called_once()

                # Verify correct URL was returned
                assert result == expected_url

    @given(
        threat_model_id=st.uuids().map(str),
        user_id=st.uuids().map(str),
        expiration=st.integers(min_value=60, max_value=3600),
    )
    @settings(max_examples=100)
    def test_presigned_url_respects_expiration_parameter(
        self, threat_model_id, user_id, expiration
    ):
        """
        Property: For any valid expiration time, the presigned URL generation should
        respect the expiration parameter.

        Feature: batch-presigned-url-authorization, Property 6: Sufficient access grants presigned URLs
        Validates: Requirements 2.5, 3.1, 3.2
        """
        from services.threat_designer_service import (
            generate_presigned_download_url_with_auth,
        )
        from unittest.mock import patch

        with (
            patch("utils.authorization.require_access") as mock_require_access,
            patch(
                "services.threat_designer_service.extract_threat_model_id_from_s3_location"
            ) as mock_extract,
            patch("services.threat_designer_service.s3_pre") as mock_s3,
        ):
            # Setup mocks
            mock_extract.return_value = threat_model_id
            expected_url = f"https://s3.example.com/{threat_model_id}"
            mock_s3.generate_presigned_url.return_value = expected_url

            # Configure authorization - OWNER access
            mock_require_access.return_value = {
                "has_access": True,
                "is_owner": True,
                "access_level": "OWNER",
            }

            # Execute with custom expiration
            result = generate_presigned_download_url_with_auth(
                threat_model_id, user_id, expiration=expiration
            )

            # Verify presigned URL was generated with correct expiration
            mock_s3.generate_presigned_url.assert_called_once()
            call_kwargs = mock_s3.generate_presigned_url.call_args[1]
            assert call_kwargs["ExpiresIn"] == expiration

            # Verify result
            assert result == expected_url


# ============================================================================
# Property-Based Tests for Batch Presigned URL Generation
# ============================================================================


class TestBatchPresignedURLGeneration:
    """Property-based tests for batch presigned URL generation."""

    @given(
        batch_size=st.integers(min_value=1, max_value=50),
        user_id=st.text(min_size=1, max_size=50),
    )
    @settings(max_examples=100)
    def test_batch_completeness(self, batch_size, user_id):
        """
        Property 1: Batch completeness
        For any batch request containing 1 to 50 S3 locations, the response should
        contain exactly one result entry for each input S3 location.

        Feature: batch-presigned-url-authorization, Property 1: Batch completeness
        Validates: Requirements 1.1, 1.2
        """
        from services.threat_designer_service import (
            generate_presigned_download_urls_batch,
        )
        from unittest.mock import patch
        import uuid

        # Generate batch_size valid UUIDs
        s3_locations = [str(uuid.uuid4()) for _ in range(batch_size)]

        with patch(
            "services.threat_designer_service.generate_presigned_download_url_with_auth"
        ) as mock_gen:
            # Mock successful URL generation for all locations
            mock_gen.return_value = "https://s3.example.com/presigned-url"

            # Execute
            results = generate_presigned_download_urls_batch(s3_locations, user_id)

            # Verify: response contains exactly one result per input location
            assert len(results) == batch_size
            assert len(results) == len(s3_locations)

            # Verify each input location has a corresponding result
            result_locations = [r["s3_location"] for r in results]
            assert result_locations == s3_locations

    @given(
        valid_count=st.integers(min_value=1, max_value=25),
        invalid_count=st.integers(min_value=1, max_value=25),
        user_id=st.text(min_size=1, max_size=50),
    )
    @settings(max_examples=100)
    def test_invalid_item_handling(self, valid_count, invalid_count, user_id):
        """
        Property 2: Invalid item handling
        For any batch request containing a mix of valid and invalid S3 locations,
        the response should include success results for valid locations and error
        indicators for invalid locations, with all items processed.

        Feature: batch-presigned-url-authorization, Property 2: Invalid item handling
        Validates: Requirements 1.4
        """
        from services.threat_designer_service import (
            generate_presigned_download_urls_batch,
        )
        from unittest.mock import patch
        import uuid

        # Generate valid UUIDs
        valid_locations = [str(uuid.uuid4()) for _ in range(valid_count)]

        # Generate invalid locations (not UUIDs)
        invalid_locations = [f"invalid-{i}" for i in range(invalid_count)]

        # Mix them together
        all_locations = valid_locations + invalid_locations

        with patch(
            "services.threat_designer_service.generate_presigned_download_url_with_auth"
        ) as mock_gen:
            # Mock to succeed for valid UUIDs, fail for invalid
            def side_effect(s3_location, uid, exp=300):
                try:
                    uuid.UUID(s3_location)
                    return f"https://s3.example.com/{s3_location}"
                except ValueError:
                    from exceptions.exceptions import NotFoundError

                    raise NotFoundError(
                        f"Invalid threat model ID format: {s3_location}"
                    )

            mock_gen.side_effect = side_effect

            # Execute
            results = generate_presigned_download_urls_batch(all_locations, user_id)

            # Verify: all items processed
            assert len(results) == len(all_locations)

            # Verify: valid locations have success=True
            valid_results = [r for r in results if r["s3_location"] in valid_locations]
            assert all(r["success"] for r in valid_results)
            assert all("presigned_url" in r for r in valid_results)

            # Verify: invalid locations have success=False and error message
            invalid_results = [
                r for r in results if r["s3_location"] in invalid_locations
            ]
            assert all(not r["success"] for r in invalid_results)
            assert all("error" in r for r in invalid_results)

    @given(
        batch_size=st.integers(min_value=2, max_value=50),
        user_id=st.text(min_size=1, max_size=50),
    )
    @settings(max_examples=100)
    def test_order_preservation(self, batch_size, user_id):
        """
        Property 3: Order preservation
        For any batch request with S3 locations in a specific order, the response
        results should be in the same order as the input locations.

        Feature: batch-presigned-url-authorization, Property 3: Order preservation
        Validates: Requirements 1.5
        """
        from services.threat_designer_service import (
            generate_presigned_download_urls_batch,
        )
        from unittest.mock import patch
        import uuid

        # Generate random ordered list of UUIDs
        s3_locations = [str(uuid.uuid4()) for _ in range(batch_size)]

        with patch(
            "services.threat_designer_service.generate_presigned_download_url_with_auth"
        ) as mock_gen:
            # Mock to return unique URLs based on location
            def side_effect(s3_location, uid, exp=300):
                return f"https://s3.example.com/{s3_location}"

            mock_gen.side_effect = side_effect

            # Execute
            results = generate_presigned_download_urls_batch(s3_locations, user_id)

            # Verify: output order matches input order
            result_locations = [r["s3_location"] for r in results]
            assert result_locations == s3_locations

            # Verify: each result corresponds to the correct input at the same index
            for i, (input_loc, result) in enumerate(zip(s3_locations, results)):
                assert result["s3_location"] == input_loc
                assert result["presigned_url"] == f"https://s3.example.com/{input_loc}"

    @given(
        authorized_count=st.integers(min_value=1, max_value=25),
        unauthorized_count=st.integers(min_value=1, max_value=25),
        user_id=st.text(min_size=1, max_size=50),
    )
    @settings(max_examples=100)
    def test_partial_failure_handling(
        self, authorized_count, unauthorized_count, user_id
    ):
        """
        Property 5: Partial failure handling
        For any batch request where the user has access to some but not all threat
        models, the response should contain presigned URLs for authorized items and
        error indicators (with "Unauthorized" message) for unauthorized items.

        Feature: batch-presigned-url-authorization, Property 5: Partial failure handling
        Validates: Requirements 2.3, 4.2
        """
        from services.threat_designer_service import (
            generate_presigned_download_urls_batch,
        )
        from unittest.mock import patch
        import uuid

        # Generate UUIDs for authorized and unauthorized locations
        authorized_locations = [str(uuid.uuid4()) for _ in range(authorized_count)]
        unauthorized_locations = [str(uuid.uuid4()) for _ in range(unauthorized_count)]

        # Mix them together
        all_locations = authorized_locations + unauthorized_locations

        with patch(
            "services.threat_designer_service.generate_presigned_download_url_with_auth"
        ) as mock_gen:
            # Mock to succeed for authorized, fail with UnauthorizedError for unauthorized
            def side_effect(s3_location, uid, exp=300):
                if s3_location in authorized_locations:
                    return f"https://s3.example.com/{s3_location}"
                else:
                    from exceptions.exceptions import UnauthorizedError

                    raise UnauthorizedError(
                        "You do not have access to this threat model"
                    )

            mock_gen.side_effect = side_effect

            # Execute
            results = generate_presigned_download_urls_batch(all_locations, user_id)

            # Verify: all items processed
            assert len(results) == len(all_locations)

            # Verify: authorized locations have presigned URLs
            authorized_results = [
                r for r in results if r["s3_location"] in authorized_locations
            ]
            assert len(authorized_results) == authorized_count
            assert all(r["success"] for r in authorized_results)
            assert all("presigned_url" in r for r in authorized_results)
            assert all("error" not in r for r in authorized_results)

            # Verify: unauthorized locations have error indicators with "Unauthorized"
            unauthorized_results = [
                r for r in results if r["s3_location"] in unauthorized_locations
            ]
            assert len(unauthorized_results) == unauthorized_count
            assert all(not r["success"] for r in unauthorized_results)
            assert all("error" in r for r in unauthorized_results)
            assert all("Unauthorized" in r["error"] for r in unauthorized_results)
            assert all("presigned_url" not in r for r in unauthorized_results)
