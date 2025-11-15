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
