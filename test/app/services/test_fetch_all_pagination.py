"""
Unit tests for fetch_all pagination functionality in threat_designer_service.py

Tests cover:
- fetch_all with pagination parameters
- fetch_all with different filter modes
- fetch_all with cursors
"""

import sys
import os
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import pytest
import json
import base64

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
from services.threat_designer_service import fetch_all, encode_cursor


class TestFetchAllPagination:
    """Tests for fetch_all function with pagination."""

    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_all_first_page_all_filter(self, mock_dynamodb):
        """Test fetching first page with 'all' filter."""
        mock_table = Mock()
        mock_sharing_table = Mock()
        mock_dynamodb.Table.side_effect = [mock_table, mock_sharing_table]

        # Mock owned items query
        mock_table.query.return_value = {
            "Items": [
                {"job_id": "owned-1", "owner": "user-1", "timestamp": "2024-01-02"},
                {"job_id": "owned-2", "owner": "user-1", "timestamp": "2024-01-01"},
            ],
            "LastEvaluatedKey": {"job_id": "owned-2"},
        }

        # Mock shared items query
        mock_sharing_table.query.return_value = {
            "Items": [
                {
                    "threat_model_id": "shared-1",
                    "user_id": "user-1",
                    "access_level": "READ_ONLY",
                    "shared_by": "user-2",
                }
            ],
            "LastEvaluatedKey": {"threat_model_id": "shared-1", "user_id": "user-1"},
        }

        mock_table.get_item.return_value = {
            "Item": {"job_id": "shared-1", "owner": "user-2", "timestamp": "2024-01-03"}
        }

        result = fetch_all("user-1", limit=20, cursor=None, filter_mode="all")

        assert "catalogs" in result
        assert "pagination" in result
        assert len(result["catalogs"]) == 3
        assert result["pagination"]["hasNextPage"] is True
        assert result["pagination"]["cursor"] is not None
        assert result["pagination"]["totalReturned"] == 3

        # Verify sorting (newest first)
        assert result["catalogs"][0]["job_id"] == "shared-1"
        assert result["catalogs"][1]["job_id"] == "owned-1"
        assert result["catalogs"][2]["job_id"] == "owned-2"

    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_all_owned_filter_only(self, mock_dynamodb):
        """Test fetching with 'owned' filter."""
        mock_table = Mock()
        mock_sharing_table = Mock()
        mock_dynamodb.Table.side_effect = [mock_table, mock_sharing_table]

        mock_table.query.return_value = {
            "Items": [
                {"job_id": "owned-1", "owner": "user-1", "timestamp": "2024-01-01"}
            ],
            "LastEvaluatedKey": None,
        }

        result = fetch_all("user-1", limit=20, cursor=None, filter_mode="owned")

        assert len(result["catalogs"]) == 1
        assert result["catalogs"][0]["is_owner"] is True
        assert result["catalogs"][0]["access_level"] == "OWNER"
        assert result["pagination"]["hasNextPage"] is False
        assert result["pagination"]["cursor"] is None

    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_all_shared_filter_only(self, mock_dynamodb):
        """Test fetching with 'shared' filter."""
        mock_table = Mock()
        mock_sharing_table = Mock()
        mock_dynamodb.Table.side_effect = [mock_table, mock_sharing_table]

        mock_sharing_table.query.return_value = {
            "Items": [
                {
                    "threat_model_id": "shared-1",
                    "user_id": "user-1",
                    "access_level": "EDIT",
                    "shared_by": "user-2",
                }
            ],
            "LastEvaluatedKey": None,
        }

        mock_table.get_item.return_value = {
            "Item": {"job_id": "shared-1", "owner": "user-2", "timestamp": "2024-01-01"}
        }

        result = fetch_all("user-1", limit=20, cursor=None, filter_mode="shared")

        assert len(result["catalogs"]) == 1
        assert result["catalogs"][0]["is_owner"] is False
        assert result["catalogs"][0]["access_level"] == "EDIT"
        assert result["pagination"]["hasNextPage"] is False

    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_all_with_cursor(self, mock_dynamodb):
        """Test fetching with a cursor."""
        mock_table = Mock()
        mock_sharing_table = Mock()
        mock_dynamodb.Table.side_effect = [mock_table, mock_sharing_table]

        # Create a cursor
        cursor = encode_cursor(
            {"job_id": "owned-2"},
            {"threat_model_id": "shared-1", "user_id": "user-1"},
            "all",
        )

        mock_table.query.return_value = {
            "Items": [
                {"job_id": "owned-3", "owner": "user-1", "timestamp": "2024-01-01"}
            ],
            "LastEvaluatedKey": None,
        }

        mock_sharing_table.query.return_value = {"Items": [], "LastEvaluatedKey": None}

        result = fetch_all("user-1", limit=20, cursor=cursor, filter_mode="all")

        assert len(result["catalogs"]) == 1
        assert result["pagination"]["hasNextPage"] is False
        assert result["pagination"]["cursor"] is None

    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_all_invalid_page_size(self, mock_dynamodb):
        """Test fetch_all with invalid page size raises ValueError."""
        with pytest.raises(ValueError, match="Page size must be one of"):
            fetch_all("user-1", limit=15, cursor=None, filter_mode="all")

    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_all_invalid_filter_mode(self, mock_dynamodb):
        """Test fetch_all with invalid filter mode raises ValueError."""
        with pytest.raises(ValueError, match="Filter mode must be one of"):
            fetch_all("user-1", limit=20, cursor=None, filter_mode="invalid")

    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_all_mcp_user_skips_sharing(self, mock_dynamodb):
        """Test fetch_all for MCP user skips sharing queries."""
        mock_table = Mock()
        mock_sharing_table = Mock()
        mock_dynamodb.Table.side_effect = [mock_table, mock_sharing_table]

        mock_table.query.return_value = {
            "Items": [{"job_id": "owned-1", "owner": "MCP", "timestamp": "2024-01-01"}],
            "LastEvaluatedKey": None,
        }

        result = fetch_all("MCP", limit=20, cursor=None, filter_mode="all")

        assert len(result["catalogs"]) == 1
        # Verify sharing table was not queried
        mock_sharing_table.query.assert_not_called()

    @patch.object(threat_designer_service, "dynamodb")
    def test_fetch_all_limits_results_to_page_size(self, mock_dynamodb):
        """Test fetch_all limits results to requested page size after merging."""
        mock_table = Mock()
        mock_sharing_table = Mock()
        mock_dynamodb.Table.side_effect = [mock_table, mock_sharing_table]

        # Return more items than limit
        mock_table.query.return_value = {
            "Items": [
                {
                    "job_id": f"owned-{i}",
                    "owner": "user-1",
                    "timestamp": f"2024-01-{i:02d}",
                }
                for i in range(1, 16)  # 15 items
            ],
            "LastEvaluatedKey": {"job_id": "owned-15"},
        }

        mock_sharing_table.query.return_value = {
            "Items": [
                {
                    "threat_model_id": f"shared-{i}",
                    "user_id": "user-1",
                    "access_level": "READ_ONLY",
                    "shared_by": "user-2",
                }
                for i in range(1, 11)  # 10 items
            ],
            "LastEvaluatedKey": {"threat_model_id": "shared-10", "user_id": "user-1"},
        }

        # Mock get_item for shared items
        def get_item_side_effect(Key):
            job_id = Key["job_id"]
            return {
                "Item": {"job_id": job_id, "owner": "user-2", "timestamp": "2024-01-20"}
            }

        mock_table.get_item.side_effect = get_item_side_effect

        result = fetch_all("user-1", limit=10, cursor=None, filter_mode="all")

        # Should be limited to 10 items
        assert len(result["catalogs"]) == 10
        assert result["pagination"]["totalReturned"] == 10
