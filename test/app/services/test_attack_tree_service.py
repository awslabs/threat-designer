"""
Unit tests for attack_tree_service.py

Tests cover:
- invoke_attack_tree_agent: Invoke agent for attack tree generation
- check_attack_tree_status: Check status of attack tree generation
- fetch_attack_tree: Fetch completed attack tree with React Flow transformation
- delete_attack_tree: Delete attack tree and remove foreign key reference
- delete_attack_trees_for_threat_model: Cascade deletion of attack trees
"""

import sys
import os
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock, call
import pytest
import json

# Add backend/app to path for imports
backend_path = str(Path(__file__).parent.parent.parent.parent / "backend" / "app")
sys.path.insert(0, backend_path)

# Mock AWS X-Ray before importing services
sys.modules["aws_xray_sdk"] = MagicMock()
sys.modules["aws_xray_sdk.core"] = MagicMock()

# Mock environment variables before importing service
os.environ["JOB_STATUS_TABLE"] = "test-status-table"
os.environ["AGENT_STATE_TABLE"] = "test-agent-table"
os.environ["ATTACK_TREE_TABLE"] = "test-attack-tree-table"
os.environ["THREAT_MODELING_AGENT"] = (
    "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent"
)
os.environ["REGION"] = "us-east-1"
os.environ["SHARING_TABLE"] = "test-sharing-table"
os.environ["LOCKS_TABLE"] = "test-locks-table"

from services import attack_tree_service
from services.attack_tree_service import (
    invoke_attack_tree_agent,
    check_attack_tree_status,
    fetch_attack_tree,
    delete_attack_tree,
    delete_attack_trees_for_threat_model,
)
from exceptions.exceptions import (
    NotFoundError,
    UnauthorizedError,
    InternalError,
)


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def sample_attack_tree_data():
    """Sample attack tree data in React Flow format."""
    return {
        "nodes": [
            {
                "id": "1",
                "type": "root",
                "data": {"label": "Exfiltrate Sensitive Data"},
            },
            {
                "id": "2",
                "type": "and-gate",
                "data": {"label": "Gain Access and Extract Data", "gateType": "AND"},
            },
            {
                "id": "3",
                "type": "leaf-attack",
                "data": {
                    "label": "Phishing Attack",
                    "description": "Send targeted phishing emails",
                    "attackChainPhase": "Initial Access",
                    "impactSeverity": "high",
                    "likelihood": "high",
                    "skillLevel": "intermediate",
                    "prerequisites": ["Identify targets"],
                    "techniques": ["Spear phishing"],
                },
            },
        ],
        "edges": [
            {
                "id": "e1-2",
                "source": "1",
                "target": "2",
                "type": "smoothstep",
                "animated": True,
            }
        ],
    }


@pytest.fixture
def sample_threat_model_with_threats():
    """Sample threat model with threats."""
    return {
        "job_id": "test-tm-123",
        "owner": "user-123",
        "title": "Test Threat Model",
        "threat_list": {
            "threats": [
                {
                    "name": "SQL Injection Attack",
                    "description": "Attacker injects malicious SQL",
                    "stride_category": "Tampering",
                },
                {
                    "name": "Cross-Site Scripting",
                    "description": "Attacker injects malicious scripts",
                    "stride_category": "Tampering",
                    "attack_tree_id": "existing-tree-123",
                },
            ]
        },
    }


# ============================================================================
# Tests for invoke_attack_tree_agent function
# ============================================================================


class TestInvokeAttackTreeAgent:
    """Tests for invoke_attack_tree_agent function."""

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch.object(attack_tree_service, "agent_core_client")
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_invoke_attack_tree_agent_creates_status_and_invokes_agent(
        self,
        mock_attack_tree_dynamodb,
        mock_collab_dynamodb,
        mock_agent_client,
    ):
        """Test invoke_attack_tree_agent creates status record and invokes agent with composite key."""
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {}  # No existing attack tree
        mock_agent_table = Mock()
        # Set up threat model data for check_access
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {"name": "SQL Injection Attack", "description": "Test threat"}
                    ]
                },
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = invoke_attack_tree_agent(
            owner="user-123",
            threat_model_id="test-tm-123",
            threat_name="SQL Injection Attack",
            threat_description="Attacker injects malicious SQL",
            reasoning=1,
        )

        # Assert - verify composite key format
        expected_attack_tree_id = "test-tm-123_sql_injection_attack"
        assert result["attack_tree_id"] == expected_attack_tree_id
        assert result["status"] == "in_progress"

        # Verify status record created with composite key
        mock_state_table.put_item.assert_called_once()
        status_item = mock_state_table.put_item.call_args[1]["Item"]
        assert status_item["id"] == expected_attack_tree_id
        assert status_item["state"] == "in_progress"
        assert status_item["owner"] == "user-123"
        assert status_item["threat_model_id"] == "test-tm-123"
        assert status_item["threat_name"] == "SQL Injection Attack"

        # Verify agent invocation with composite key
        mock_agent_client.invoke_agent_runtime.assert_called_once()
        call_args = mock_agent_client.invoke_agent_runtime.call_args
        payload = json.loads(call_args[1]["payload"])
        assert payload["input"]["attack_tree_id"] == expected_attack_tree_id
        assert payload["input"]["threat_model_id"] == "test-tm-123"
        assert payload["input"]["threat_name"] == "SQL Injection Attack"

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_invoke_attack_tree_agent_raises_unauthorized_without_edit_access(
        self, mock_attack_tree_dynamodb, mock_collab_dynamodb
    ):
        """Test invoke_attack_tree_agent raises UnauthorizedError without EDIT access."""
        # Setup
        mock_agent_table = Mock()
        # Set up threat model data with different owner
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "different-user",
                "threat_list": {
                    "threats": [
                        {"name": "SQL Injection Attack", "description": "Test threat"}
                    ]
                },
            }
        }
        mock_attack_tree_dynamodb.Table.return_value = mock_agent_table
        mock_collab_dynamodb.Table.return_value = mock_agent_table

        # Execute and Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            invoke_attack_tree_agent(
                owner="user-456",
                threat_model_id="test-tm-123",
                threat_name="SQL Injection Attack",
                threat_description="Test",
            )

        assert "do not have permission" in str(exc_info.value)

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch.object(attack_tree_service, "agent_core_client")
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_invoke_attack_tree_agent_returns_existing_in_progress_tree(
        self,
        mock_attack_tree_dynamodb,
        mock_collab_dynamodb,
        mock_agent_client,
    ):
        """Test invoke_attack_tree_agent returns existing attack tree when status is in_progress."""
        # Setup
        expected_attack_tree_id = "test-tm-123_sql_injection_attack"
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {
            "Item": {
                "id": expected_attack_tree_id,
                "state": "in_progress",
                "threat_model_id": "test-tm-123",
            }
        }
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {"name": "SQL Injection Attack", "description": "Test threat"}
                    ]
                },
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = invoke_attack_tree_agent(
            owner="user-123",
            threat_model_id="test-tm-123",
            threat_name="SQL Injection Attack",
            threat_description="Test",
        )

        # Assert - should return existing without starting new generation
        assert result["attack_tree_id"] == expected_attack_tree_id
        assert result["status"] == "in_progress"
        assert "message" in result
        assert "already exists" in result["message"]

        # Verify agent was NOT invoked
        mock_agent_client.invoke_agent_runtime.assert_not_called()

        # Verify no new status record was created
        mock_state_table.put_item.assert_not_called()

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch.object(attack_tree_service, "agent_core_client")
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_invoke_attack_tree_agent_returns_existing_completed_tree(
        self,
        mock_attack_tree_dynamodb,
        mock_collab_dynamodb,
        mock_agent_client,
    ):
        """Test invoke_attack_tree_agent returns existing attack tree when status is completed."""
        # Setup
        expected_attack_tree_id = "test-tm-123_sql_injection_attack"
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {
            "Item": {
                "id": expected_attack_tree_id,
                "state": "completed",
                "threat_model_id": "test-tm-123",
            }
        }
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {"name": "SQL Injection Attack", "description": "Test threat"}
                    ]
                },
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = invoke_attack_tree_agent(
            owner="user-123",
            threat_model_id="test-tm-123",
            threat_name="SQL Injection Attack",
            threat_description="Test",
        )

        # Assert - should return existing without starting new generation
        assert result["attack_tree_id"] == expected_attack_tree_id
        assert result["status"] == "completed"
        assert "message" in result
        assert "already exists" in result["message"]

        # Verify agent was NOT invoked
        mock_agent_client.invoke_agent_runtime.assert_not_called()

        # Verify no new status record was created
        mock_state_table.put_item.assert_not_called()

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch.object(attack_tree_service, "agent_core_client")
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_invoke_attack_tree_agent_allows_retry_for_failed_tree(
        self,
        mock_attack_tree_dynamodb,
        mock_collab_dynamodb,
        mock_agent_client,
    ):
        """Test invoke_attack_tree_agent allows retry when status is failed."""
        # Setup
        expected_attack_tree_id = "test-tm-123_sql_injection_attack"
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {
            "Item": {
                "id": expected_attack_tree_id,
                "state": "failed",
                "threat_model_id": "test-tm-123",
                "error": "Previous error",
            }
        }
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {"name": "SQL Injection Attack", "description": "Test threat"}
                    ]
                },
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = invoke_attack_tree_agent(
            owner="user-123",
            threat_model_id="test-tm-123",
            threat_name="SQL Injection Attack",
            threat_description="Test",
        )

        # Assert - should allow retry and start new generation
        assert result["attack_tree_id"] == expected_attack_tree_id
        assert result["status"] == "in_progress"

        # Verify agent WAS invoked (retry allowed)
        mock_agent_client.invoke_agent_runtime.assert_called_once()

        # Verify new status record was created
        mock_state_table.put_item.assert_called_once()


# ============================================================================
# Tests for check_attack_tree_status function
# ============================================================================


class TestCheckAttackTreeStatus:
    """Tests for check_attack_tree_status function."""

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_check_attack_tree_status_returns_in_progress(
        self, mock_attack_tree_dynamodb, mock_collab_dynamodb
    ):
        """Test check_attack_tree_status returns in_progress status."""
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {
            "Item": {
                "id": "attack-tree-123",
                "state": "in_progress",
                "threat_model_id": "test-tm-123",
                "threat_name": "SQL Injection Attack",
            }
        }

        mock_agent_table = Mock()
        # Set up threat model data for check_access
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = check_attack_tree_status("attack-tree-123", "user-123")

        # Assert
        assert result["attack_tree_id"] == "attack-tree-123"
        assert result["status"] == "in_progress"

    @patch.dict("os.environ", {"JOB_STATUS_TABLE": "test-status-table"})
    @patch.object(attack_tree_service, "dynamodb")
    def test_check_attack_tree_status_returns_not_found(self, mock_dynamodb):
        """Test check_attack_tree_status returns not_found for non-existent tree."""
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {}
        mock_dynamodb.Table.return_value = mock_state_table

        # Execute
        result = check_attack_tree_status("nonexistent-tree", "user-123")

        # Assert
        assert result["attack_tree_id"] == "nonexistent-tree"
        assert result["status"] == "not_found"

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_check_attack_tree_status_includes_error_when_failed(
        self, mock_attack_tree_dynamodb, mock_collab_dynamodb
    ):
        """Test check_attack_tree_status includes error message when failed."""
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {
            "Item": {
                "id": "attack-tree-123",
                "state": "failed",
                "threat_model_id": "test-tm-123",
                "error": "Agent execution timeout",
                "detail": "Failed after 5 minutes",
            }
        }

        mock_agent_table = Mock()
        # Set up threat model data for check_access
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = check_attack_tree_status("attack-tree-123", "user-123")

        # Assert
        assert result["status"] == "failed"
        assert result["error"] == "Agent execution timeout"
        assert result["detail"] == "Failed after 5 minutes"


# ============================================================================
# Tests for fetch_attack_tree function
# ============================================================================


class TestFetchAttackTree:
    """Tests for fetch_attack_tree function."""

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_fetch_attack_tree_returns_completed_tree(
        self, mock_attack_tree_dynamodb, mock_collab_dynamodb, sample_attack_tree_data
    ):
        """Test fetch_attack_tree returns completed attack tree."""
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {
            "Item": {
                "id": "attack-tree-123",
                "state": "completed",
                "threat_model_id": "test-tm-123",
                "threat_name": "SQL Injection Attack",
            }
        }

        mock_attack_tree_table = Mock()
        mock_attack_tree_table.get_item.return_value = {
            "Item": {
                "attack_tree_id": "attack-tree-123",
                "threat_model_id": "test-tm-123",
                "threat_name": "SQL Injection Attack",
                "created_at": "2024-01-01T00:00:00Z",
                "attack_tree_data": sample_attack_tree_data,
            }
        }

        mock_agent_table = Mock()
        # Set up threat model data for check_access
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            elif "attack" in table_name.lower():
                return mock_attack_tree_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = fetch_attack_tree("attack-tree-123", "user-123")

        # Assert
        assert result["attack_tree_id"] == "attack-tree-123"
        assert result["threat_model_id"] == "test-tm-123"
        assert result["threat_name"] == "SQL Injection Attack"
        assert "attack_tree" in result
        assert result["attack_tree"]["nodes"][0]["type"] == "root"

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
        },
    )
    @patch.object(attack_tree_service, "dynamodb")
    def test_fetch_attack_tree_raises_not_found_for_nonexistent_tree(
        self, mock_dynamodb
    ):
        """Test fetch_attack_tree raises NotFoundError for non-existent tree."""
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {}
        mock_dynamodb.Table.return_value = mock_state_table

        # Execute and Assert
        with pytest.raises(NotFoundError) as exc_info:
            fetch_attack_tree("nonexistent-tree", "user-123")

        assert "not found" in str(exc_info.value).lower()

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_fetch_attack_tree_raises_error_when_not_completed(
        self, mock_attack_tree_dynamodb, mock_collab_dynamodb
    ):
        """Test fetch_attack_tree raises error when generation not complete."""
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {
            "Item": {
                "id": "attack-tree-123",
                "state": "in_progress",
                "threat_model_id": "test-tm-123",
            }
        }

        mock_agent_table = Mock()
        # Set up threat model data for check_access
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute and Assert
        with pytest.raises(InternalError) as exc_info:
            fetch_attack_tree("attack-tree-123", "user-123")

        assert "not complete" in str(exc_info.value).lower()


# ============================================================================
# Tests for delete_attack_tree function
# ============================================================================


class TestDeleteAttackTree:
    """Tests for delete_attack_tree function."""

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_delete_attack_tree_removes_tree_without_foreign_key_cleanup(
        self,
        mock_attack_tree_dynamodb,
        mock_collab_dynamodb,
    ):
        """Test delete_attack_tree removes tree without FK cleanup."""
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {
            "Item": {
                "id": "existing-tree-123",
                "threat_model_id": "test-tm-123",
                "threat_name": "Cross-Site Scripting",
            }
        }

        mock_attack_tree_table = Mock()
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {"name": "Cross-Site Scripting", "description": "Test threat"}
                    ]
                },
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            elif "attack" in table_name.lower():
                return mock_attack_tree_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = delete_attack_tree("existing-tree-123", "user-123")

        # Assert
        assert result["attack_tree_id"] == "existing-tree-123"
        assert result["status"] == "deleted"

        # Verify attack tree deleted
        mock_attack_tree_table.delete_item.assert_called_once_with(
            Key={"attack_tree_id": "existing-tree-123"}
        )

        # Verify status deleted
        mock_state_table.delete_item.assert_called_once_with(
            Key={"id": "existing-tree-123"}
        )

        # Verify NO foreign key cleanup (update_item should not be called)
        mock_agent_table.update_item.assert_not_called()

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
        },
    )
    @patch.object(attack_tree_service, "dynamodb")
    def test_delete_attack_tree_raises_not_found_for_nonexistent_tree(
        self, mock_dynamodb
    ):
        """Test delete_attack_tree raises NotFoundError for non-existent tree."""
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {}
        mock_dynamodb.Table.return_value = mock_state_table

        # Execute and Assert
        with pytest.raises(NotFoundError):
            delete_attack_tree("nonexistent-tree", "user-123")


# ============================================================================
# Tests for delete_attack_trees_for_threat_model function
# ============================================================================


class TestDeleteAttackTreesForThreatModel:
    """Tests for delete_attack_trees_for_threat_model function."""

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_delete_attack_trees_for_threat_model_deletes_all_trees_using_computed_ids(
        self, mock_attack_tree_dynamodb, mock_collab_dynamodb
    ):
        """Test delete_attack_trees_for_threat_model deletes all trees using computed IDs."""
        # Setup
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {
                            "name": "SQL Injection",
                        },
                        {
                            "name": "Cross-Site Scripting",
                        },
                        {
                            "name": "Threat 3",
                        },
                    ]
                },
            }
        }

        mock_attack_tree_table = Mock()
        mock_state_table = Mock()

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            elif "attack" in table_name.lower():
                return mock_attack_tree_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = delete_attack_trees_for_threat_model("test-tm-123", "user-123")

        # Assert
        assert result["deleted_count"] == 3
        assert result["failed_count"] == 0

        # Verify all attack trees were deleted using computed IDs
        assert mock_attack_tree_table.delete_item.call_count == 3
        assert mock_state_table.delete_item.call_count == 3

        # Verify computed IDs were used
        expected_ids = [
            "test-tm-123_sql_injection",
            "test-tm-123_cross-site_scripting",
            "test-tm-123_threat_3",
        ]
        actual_ids = [
            call[1]["Key"]["attack_tree_id"]
            for call in mock_attack_tree_table.delete_item.call_args_list
        ]
        assert set(actual_ids) == set(expected_ids)

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_delete_attack_trees_handles_failures_gracefully(
        self, mock_attack_tree_dynamodb, mock_collab_dynamodb
    ):
        """Test delete_attack_trees_for_threat_model handles failures gracefully."""
        # Setup
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {"name": "Threat 1"},
                        {"name": "Threat 2"},
                    ]
                },
            }
        }

        mock_attack_tree_table = Mock()
        # First deletion succeeds, second fails
        mock_attack_tree_table.delete_item.side_effect = [
            None,
            Exception("DynamoDB error"),
        ]

        mock_state_table = Mock()

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            elif "attack" in table_name.lower():
                return mock_attack_tree_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = delete_attack_trees_for_threat_model("test-tm-123", "user-123")

        # Assert - should continue despite failure
        assert result["deleted_count"] == 1
        assert result["failed_count"] == 1

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "JOB_STATUS_TABLE": "test-status-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_delete_attack_trees_returns_one_when_one_valid_threat(
        self, mock_attack_tree_dynamodb, mock_collab_dynamodb
    ):
        """Test delete_attack_trees_for_threat_model computes IDs for valid threats."""
        # Setup
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
                "threat_list": {"threats": [{"name": "Threat 1"}]},
            }
        }
        mock_attack_tree_table = Mock()
        mock_state_table = Mock()

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            elif "attack" in table_name.lower():
                return mock_attack_tree_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = delete_attack_trees_for_threat_model("test-tm-123", "user-123")

        # Assert
        assert result["deleted_count"] == 1
        assert result["failed_count"] == 0

    @patch.dict(
        "os.environ",
        {
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "JOB_STATUS_TABLE": "test-status-table",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_delete_attack_trees_handles_invalid_threat_names(
        self, mock_attack_tree_dynamodb, mock_collab_dynamodb
    ):
        """Test delete_attack_trees_for_threat_model handles invalid threat names gracefully."""
        # Setup
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": "test-tm-123",
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {"name": "Valid Threat"},
                        {"name": "!!!"},  # Invalid - only special characters
                        {"name": "Another Valid Threat"},
                    ]
                },
            }
        }

        mock_attack_tree_table = Mock()
        mock_state_table = Mock()

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            elif "attack" in table_name.lower():
                return mock_attack_tree_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        result = delete_attack_trees_for_threat_model("test-tm-123", "user-123")

        # Assert - should skip invalid threat name and continue
        assert result["deleted_count"] == 2
        assert result["failed_count"] == 0

        # Verify only 2 attack trees were deleted (invalid one skipped)
        assert mock_attack_tree_table.delete_item.call_count == 2


# ============================================================================
# Integration Tests for Cascade Deletion
# ============================================================================


class TestCascadeDeletion:
    """Integration tests for cascade deletion of attack trees with threat models."""

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "AGENT_TRAIL_TABLE": "test-trail-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "ARCHITECTURE_BUCKET": "test-bucket",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "REGION": "us-east-1",
        },
    )
    @patch("utils.authorization.require_owner")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.check_status")
    @patch("boto3.client")
    @patch("services.collaboration_service.dynamodb")
    @patch("services.threat_designer_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_delete_threat_model_cascades_to_attack_trees(
        self,
        mock_attack_tree_dynamodb,
        mock_threat_designer_dynamodb,
        mock_collab_dynamodb,
        mock_boto3_client,
        mock_check_status,
        mock_get_lock_status,
        mock_require_owner,
    ):
        """Test deleting threat model also deletes associated attack trees."""
        # Import here to ensure mocks are in place
        from services.threat_designer_service import delete_tm

        # Setup - Create threat model with threats (IDs will be computed)
        threat_model_data = {
            "job_id": "test-tm-456",
            "owner": "user-123",
            "title": "Test Threat Model",
            "s3_location": "test-key.json",
            "threat_list": {
                "threats": [
                    {
                        "name": "SQL Injection",
                        "description": "SQL injection attack",
                    },
                    {
                        "name": "XSS Attack",
                        "description": "Cross-site scripting",
                    },
                    {
                        "name": "CSRF Attack",
                        "description": "Cross-site request forgery",
                    },
                ]
            },
        }

        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {"Item": threat_model_data}

        mock_attack_tree_table = Mock()
        mock_state_table = Mock()
        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {"Items": []}

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            elif "attack" in table_name.lower():
                return mock_attack_tree_table
            elif "sharing" in table_name.lower():
                return mock_sharing_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_threat_designer_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        mock_require_owner.return_value = None  # No exception means authorized
        mock_get_lock_status.return_value = {"locked": False}

        mock_check_status.return_value = {"state": "COMPLETE"}

        # Mock boto3.client to return a mock S3 client
        mock_s3 = Mock()
        mock_s3.delete_object.return_value = {
            "ResponseMetadata": {"HTTPStatusCode": 204}
        }
        mock_boto3_client.return_value = mock_s3

        # Execute - Delete threat model
        result = delete_tm("test-tm-456", "user-123")

        # Assert - Verify threat model was deleted
        assert result["job_id"] == "test-tm-456"
        assert result["state"] == "Deleted"

        # Verify attack trees were deleted (3 trees with computed IDs)
        assert mock_attack_tree_table.delete_item.call_count == 3
        expected_ids = [
            "test-tm-456_sql_injection",
            "test-tm-456_xss_attack",
            "test-tm-456_csrf_attack",
        ]
        actual_ids = [
            call[1]["Key"]["attack_tree_id"]
            for call in mock_attack_tree_table.delete_item.call_args_list
        ]
        assert set(actual_ids) == set(expected_ids)

        # Verify status records were deleted
        assert mock_state_table.delete_item.call_count == 3
        actual_status_ids = [
            call[1]["Key"]["id"] for call in mock_state_table.delete_item.call_args_list
        ]
        assert set(actual_status_ids) == set(expected_ids)

        # Verify threat model was deleted
        mock_agent_table.delete_item.assert_called_once()

        # Verify S3 object was deleted
        mock_s3.delete_object.assert_called_once_with(
            Bucket="test-bucket", Key="test-key.json"
        )

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "AGENT_TRAIL_TABLE": "test-trail-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "ARCHITECTURE_BUCKET": "test-bucket",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "REGION": "us-east-1",
        },
    )
    @patch("utils.authorization.require_owner")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.check_status")
    @patch("boto3.client")
    @patch("services.collaboration_service.dynamodb")
    @patch("services.threat_designer_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_delete_threat_model_continues_despite_attack_tree_failure(
        self,
        mock_attack_tree_dynamodb,
        mock_threat_designer_dynamodb,
        mock_collab_dynamodb,
        mock_boto3_client,
        mock_check_status,
        mock_get_lock_status,
        mock_require_owner,
    ):
        """Test threat model deletion continues even if attack tree deletion fails."""
        # Import here to ensure mocks are in place
        from services.threat_designer_service import delete_tm

        # Setup
        threat_model_data = {
            "job_id": "test-tm-789",
            "owner": "user-123",
            "title": "Test Threat Model",
            "s3_location": "test-key.json",
            "threat_list": {
                "threats": [
                    {
                        "name": "SQL Injection",
                    }
                ]
            },
        }

        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {"Item": threat_model_data}

        mock_attack_tree_table = Mock()
        # Simulate attack tree deletion failure
        mock_attack_tree_table.delete_item.side_effect = Exception("DynamoDB error")

        mock_state_table = Mock()
        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {"Items": []}

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            elif "attack" in table_name.lower():
                return mock_attack_tree_table
            elif "sharing" in table_name.lower():
                return mock_sharing_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_threat_designer_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        mock_require_owner.return_value = None  # No exception means authorized
        mock_get_lock_status.return_value = {"locked": False}

        mock_check_status.return_value = {"state": "COMPLETE"}

        # Mock boto3.client to return a mock S3 client
        mock_s3 = Mock()
        mock_s3.delete_object.return_value = {
            "ResponseMetadata": {"HTTPStatusCode": 204}
        }
        mock_boto3_client.return_value = mock_s3

        # Execute - Delete threat model (should succeed despite attack tree failure)
        result = delete_tm("test-tm-789", "user-123")

        # Assert - Verify threat model was still deleted
        assert result["job_id"] == "test-tm-789"
        assert result["state"] == "Deleted"

        # Verify attack tree deletion was attempted
        mock_attack_tree_table.delete_item.assert_called_once()

        # Verify threat model was still deleted
        mock_agent_table.delete_item.assert_called_once()

        # Verify S3 object was still deleted
        mock_s3.delete_object.assert_called_once()

    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "AGENT_TRAIL_TABLE": "test-trail-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "ARCHITECTURE_BUCKET": "test-bucket",
            "SHARING_TABLE": "test-sharing-table",
            "LOCKS_TABLE": "test-locks-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "REGION": "us-east-1",
        },
    )
    @patch("utils.authorization.require_owner")
    @patch("services.lock_service.get_lock_status")
    @patch("services.threat_designer_service.check_status")
    @patch("boto3.client")
    @patch("services.collaboration_service.dynamodb")
    @patch("services.threat_designer_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_delete_threat_model_with_threats_computes_ids(
        self,
        mock_attack_tree_dynamodb,
        mock_threat_designer_dynamodb,
        mock_collab_dynamodb,
        mock_boto3_client,
        mock_check_status,
        mock_get_lock_status,
        mock_require_owner,
    ):
        """Test deleting threat model computes IDs for all threats."""
        # Import here to ensure mocks are in place
        from services.threat_designer_service import delete_tm

        # Setup - Threat model with threats (IDs will be computed)
        threat_model_data = {
            "job_id": "test-tm-999",
            "owner": "user-123",
            "title": "Test Threat Model",
            "s3_location": "test-key.json",
            "threat_list": {
                "threats": [
                    {
                        "name": "SQL Injection",
                        "description": "SQL injection attack",
                    }
                ]
            },
        }

        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {"Item": threat_model_data}

        mock_attack_tree_table = Mock()
        mock_state_table = Mock()
        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {"Items": []}

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            elif "attack" in table_name.lower():
                return mock_attack_tree_table
            elif "sharing" in table_name.lower():
                return mock_sharing_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_threat_designer_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        mock_require_owner.return_value = None  # No exception means authorized
        mock_get_lock_status.return_value = {"locked": False}

        mock_check_status.return_value = {"state": "COMPLETE"}

        # Mock boto3.client to return a mock S3 client
        mock_s3 = Mock()
        mock_s3.delete_object.return_value = {
            "ResponseMetadata": {"HTTPStatusCode": 204}
        }
        mock_boto3_client.return_value = mock_s3

        # Execute - Delete threat model
        result = delete_tm("test-tm-999", "user-123")

        # Assert - Verify threat model was deleted
        assert result["job_id"] == "test-tm-999"
        assert result["state"] == "Deleted"

        # Verify attack tree deletion was attempted with computed ID
        expected_id = "test-tm-999_sql_injection"
        mock_attack_tree_table.delete_item.assert_called_once_with(
            Key={"attack_tree_id": expected_id}
        )
        mock_state_table.delete_item.assert_called_once_with(Key={"id": expected_id})

        # Verify threat model was deleted
        mock_agent_table.delete_item.assert_called_once()

        # Verify S3 object was deleted
        mock_s3.delete_object.assert_called_once()


# ============================================================================
# Property-Based Tests for generate_attack_tree_id
# ============================================================================

from hypothesis import given, strategies as st
import re


class TestGenerateAttackTreeIdProperties:
    """Property-based tests for generate_attack_tree_id function."""

    @given(
        threat_model_id=st.uuids().map(str),
        threat_name=st.text(min_size=1, max_size=100).filter(
            lambda s: any(c.isascii() and c.isalnum() for c in s)
        ),
    )
    def test_composite_key_format_and_determinism(self, threat_model_id, threat_name):
        """
        Property: For any valid threat_model_id and threat_name, the generated
        attack_tree_id should have the correct format and be deterministic.

        Feature: attack-tree-id-composite-key, Property 1: Composite key format and determinism
        Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
        """
        from services.attack_tree_service import generate_attack_tree_id

        # Generate ID twice
        id1 = generate_attack_tree_id(threat_model_id, threat_name)
        id2 = generate_attack_tree_id(threat_model_id, threat_name)

        # Verify determinism
        assert id1 == id2, "Same inputs should produce same output"

        # Verify format: {threat_model_id}_{normalized_name}
        assert id1.startswith(threat_model_id + "_"), (
            "ID should start with threat_model_id_"
        )

        # Extract normalized part
        normalized_part = id1[len(threat_model_id) + 1 :]

        # Verify normalized part is lowercase
        assert normalized_part == normalized_part.lower(), (
            "Normalized name should be lowercase"
        )

        # Verify no spaces in normalized part
        assert " " not in normalized_part, "Normalized name should not contain spaces"

        # Verify only valid characters (alphanumeric, underscore, hyphen)
        assert re.match(r"^[a-z0-9_-]+$", normalized_part), (
            "Normalized name should only contain alphanumeric, underscore, or hyphen"
        )

        # Verify normalized part is not empty
        assert len(normalized_part) > 0, "Normalized name should not be empty"


class TestGenerateAttackTreeIdInputValidation:
    """Property-based tests for input validation of generate_attack_tree_id."""

    @given(
        threat_model_id=st.one_of(
            st.just(""),  # Empty string
            st.just("   "),  # Only whitespace
        )
    )
    def test_invalid_threat_model_id(self, threat_model_id):
        """
        Property: For any invalid threat_model_id, the function should raise ValueError.

        Feature: attack-tree-id-composite-key, Property 3: Input validation
        Validates: Requirements 4.1, 4.2, 4.3
        """
        from services.attack_tree_service import generate_attack_tree_id

        with pytest.raises(
            ValueError, match="threat_model_id must be a non-empty string"
        ):
            generate_attack_tree_id(threat_model_id, "valid threat name")

    @given(
        threat_name=st.one_of(
            st.just(""),  # Empty string
            st.just("   "),  # Only whitespace
            st.text(min_size=1, max_size=50).filter(
                lambda s: not any(c.isalnum() for c in s) and len(s.strip()) > 0
            ),  # Only special chars
        )
    )
    def test_invalid_threat_name(self, threat_name):
        """
        Property: For any invalid threat_name, the function should raise ValueError.

        Feature: attack-tree-id-composite-key, Property 3: Input validation
        Validates: Requirements 4.1, 4.2, 4.3
        """
        from services.attack_tree_service import generate_attack_tree_id

        with pytest.raises(ValueError):
            generate_attack_tree_id("valid-uuid-123", threat_name)


class TestNoForeignKeyStorageProperty:
    """Property-based test for no foreign key storage."""

    @given(
        threat_model_id=st.uuids().map(str),
        threat_name=st.text(min_size=1, max_size=100).filter(
            lambda s: any(c.isascii() and c.isalnum() for c in s)
        ),
        threat_description=st.text(max_size=200),
    )
    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch.object(attack_tree_service, "agent_core_client")
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_no_foreign_key_storage(
        self,
        mock_attack_tree_dynamodb,
        mock_collab_dynamodb,
        mock_agent_client,
        threat_model_id,
        threat_name,
        threat_description,
    ):
        """
        Property: For any attack tree generation, the threat object should not
        be updated with an attack_tree_id field.

        Feature: attack-tree-id-composite-key, Property 2: No foreign key storage
        Validates: Requirements 2.1
        """
        # Setup
        mock_state_table = Mock()
        mock_state_table.get_item.return_value = {}  # No existing attack tree
        mock_agent_table = Mock()
        # Set up threat model data for check_access
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": threat_model_id,
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {"name": threat_name, "description": threat_description}
                    ]
                },
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Execute
        try:
            result = invoke_attack_tree_agent(
                owner="user-123",
                threat_model_id=threat_model_id,
                threat_name=threat_name,
                threat_description=threat_description,
            )

            # Assert - verify update_item was NOT called (no FK linking)
            # The agent_table.update_item should not be called at all
            assert not mock_agent_table.update_item.called, (
                "Should not update threat object with FK"
            )

            # Verify result contains attack_tree_id
            assert "attack_tree_id" in result
        except ValueError:
            # If generate_attack_tree_id raises ValueError due to invalid input,
            # that's expected and we can skip this test case
            pass


class TestDuplicatePreventionCheckProperty:
    """Property-based test for duplicate prevention check."""

    @given(
        threat_model_id=st.uuids().map(str),
        threat_name=st.text(min_size=1, max_size=100).filter(
            lambda s: any(c.isascii() and c.isalnum() for c in s)
        ),
        threat_description=st.text(max_size=200),
    )
    @patch.dict(
        "os.environ",
        {
            "JOB_STATUS_TABLE": "test-status-table",
            "AGENT_STATE_TABLE": "test-agent-table",
            "ATTACK_TREE_TABLE": "test-attack-tree-table",
            "THREAT_MODELING_AGENT": "arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent",
            "SHARING_TABLE": "test-sharing-table",
        },
    )
    @patch.object(attack_tree_service, "agent_core_client")
    @patch("services.collaboration_service.dynamodb")
    @patch.object(attack_tree_service, "dynamodb")
    def test_duplicate_prevention_check(
        self,
        mock_attack_tree_dynamodb,
        mock_collab_dynamodb,
        mock_agent_client,
        threat_model_id,
        threat_name,
        threat_description,
    ):
        """
        Property: For any attack tree generation request, the system should check
        for an existing attack tree with the computed composite key before starting generation.

        Feature: attack-tree-id-composite-key, Property 4: Duplicate prevention check
        Validates: Requirements 8.1
        """
        # Setup
        mock_state_table = Mock()
        mock_agent_table = Mock()
        # Set up threat model data for check_access
        mock_agent_table.get_item.return_value = {
            "Item": {
                "job_id": threat_model_id,
                "owner": "user-123",
                "threat_list": {
                    "threats": [
                        {"name": threat_name, "description": threat_description}
                    ]
                },
            }
        }

        def table_selector(table_name):
            if "status" in table_name.lower():
                return mock_state_table
            return mock_agent_table

        mock_attack_tree_dynamodb.Table.side_effect = table_selector
        mock_collab_dynamodb.Table.side_effect = table_selector

        # Test with no existing attack tree
        mock_state_table.get_item.return_value = {}  # No existing attack tree

        # Execute
        try:
            result = invoke_attack_tree_agent(
                owner="user-123",
                threat_model_id=threat_model_id,
                threat_name=threat_name,
                threat_description=threat_description,
            )

            # Assert - verify get_item was called to check for existing attack tree
            # This proves the duplicate prevention check happened
            assert mock_state_table.get_item.called, (
                "Should check for existing attack tree before generation"
            )

            # Verify result contains attack_tree_id
            assert "attack_tree_id" in result
        except ValueError:
            # If generate_attack_tree_id raises ValueError due to invalid input,
            # that's expected and we can skip this test case
            pass


# ============================================================================
# Unit Tests for generate_attack_tree_id function
# ============================================================================


class TestGenerateAttackTreeId:
    """Unit tests for generate_attack_tree_id function."""

    def test_valid_inputs_produce_expected_format(self):
        """Test that valid inputs produce the expected composite key format."""
        from services.attack_tree_service import generate_attack_tree_id

        result = generate_attack_tree_id("abc-123", "SQL Injection Attack")
        assert result == "abc-123_sql_injection_attack"

    def test_normalization_lowercase(self):
        """Test that threat names are converted to lowercase."""
        from services.attack_tree_service import generate_attack_tree_id

        result = generate_attack_tree_id("test-id", "UPPERCASE THREAT")
        assert result == "test-id_uppercase_threat"

    def test_normalization_space_replacement(self):
        """Test that spaces are replaced with underscores."""
        from services.attack_tree_service import generate_attack_tree_id

        result = generate_attack_tree_id("test-id", "threat with spaces")
        assert result == "test-id_threat_with_spaces"

    def test_normalization_special_character_removal(self):
        """Test that special characters are removed."""
        from services.attack_tree_service import generate_attack_tree_id

        result = generate_attack_tree_id("test-id", "threat@#$%name")
        assert result == "test-id_threatname"

    def test_empty_threat_name_raises_value_error(self):
        """Test that empty threat_name raises ValueError."""
        from services.attack_tree_service import generate_attack_tree_id

        with pytest.raises(ValueError, match="threat_name must be a non-empty string"):
            generate_attack_tree_id("test-id", "")

    def test_whitespace_only_threat_name_raises_value_error(self):
        """Test that whitespace-only threat_name raises ValueError."""
        from services.attack_tree_service import generate_attack_tree_id

        with pytest.raises(ValueError, match="threat_name must be a non-empty string"):
            generate_attack_tree_id("test-id", "   ")

    def test_empty_threat_model_id_raises_value_error(self):
        """Test that empty threat_model_id raises ValueError."""
        from services.attack_tree_service import generate_attack_tree_id

        with pytest.raises(
            ValueError, match="threat_model_id must be a non-empty string"
        ):
            generate_attack_tree_id("", "valid threat")

    def test_whitespace_only_threat_model_id_raises_value_error(self):
        """Test that whitespace-only threat_model_id raises ValueError."""
        from services.attack_tree_service import generate_attack_tree_id

        with pytest.raises(
            ValueError, match="threat_model_id must be a non-empty string"
        ):
            generate_attack_tree_id("   ", "valid threat")

    def test_threat_name_with_only_special_characters_raises_value_error(self):
        """Test that threat_name with only special characters raises ValueError."""
        from services.attack_tree_service import generate_attack_tree_id

        with pytest.raises(
            ValueError,
            match="threat_name must contain at least one alphanumeric character",
        ):
            generate_attack_tree_id("test-id", "@#$%^&*()")

    def test_threat_name_with_hyphens_only_raises_value_error(self):
        """Test that threat_name with only hyphens raises ValueError."""
        from services.attack_tree_service import generate_attack_tree_id

        with pytest.raises(
            ValueError,
            match="threat_name must contain at least one alphanumeric character",
        ):
            generate_attack_tree_id("test-id", "---")

    def test_threat_name_with_underscores_only_raises_value_error(self):
        """Test that threat_name with only underscores raises ValueError."""
        from services.attack_tree_service import generate_attack_tree_id

        with pytest.raises(
            ValueError,
            match="threat_name must contain at least one alphanumeric character",
        ):
            generate_attack_tree_id("test-id", "___")

    def test_threat_name_with_spaces_hyphens_numbers(self):
        """Test threat name with spaces, hyphens, and numbers."""
        from services.attack_tree_service import generate_attack_tree_id

        result = generate_attack_tree_id("test-id", "Attack-Type 123")
        assert result == "test-id_attack-type_123"

    def test_threat_name_with_mixed_case(self):
        """Test threat name with mixed case."""
        from services.attack_tree_service import generate_attack_tree_id

        result = generate_attack_tree_id("test-id", "CamelCaseAttack")
        assert result == "test-id_camelcaseattack"

    def test_threat_name_with_parentheses(self):
        """Test threat name with parentheses."""
        from services.attack_tree_service import generate_attack_tree_id

        result = generate_attack_tree_id("test-id", "Cross-Site Scripting (XSS)")
        assert result == "test-id_cross-site_scripting_xss"

    def test_threat_name_with_leading_trailing_spaces(self):
        """Test threat name with leading and trailing spaces."""
        from services.attack_tree_service import generate_attack_tree_id

        result = generate_attack_tree_id("test-id", "  threat name  ")
        assert result == "test-id_threat_name"

    def test_determinism(self):
        """Test that same inputs always produce same output."""
        from services.attack_tree_service import generate_attack_tree_id

        result1 = generate_attack_tree_id("test-id", "SQL Injection")
        result2 = generate_attack_tree_id("test-id", "SQL Injection")
        assert result1 == result2
