"""
Unit tests for pagination infrastructure in threat_designer_service.py

Tests cover:
- decode_cursor: Decode and validate pagination cursors
- encode_cursor: Encode pagination state into cursors
- query_owned_paginated: Query owned threat models with pagination
- query_shared_paginated: Query shared threat models with pagination
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

from services.threat_designer_service import (
    validate_pagination_params,
    decode_cursor,
    encode_cursor,
    query_owned_paginated,
    query_shared_paginated,
)
from exceptions.exceptions import InternalError


class TestValidatePaginationParams:
    """Tests for validate_pagination_params function."""

    def test_valid_page_sizes(self):
        """Test validation passes for valid page sizes."""
        for size in [10, 20, 50, 100]:
            validate_pagination_params(size, "all")  # Should not raise

    def test_valid_filter_modes(self):
        """Test validation passes for valid filter modes."""
        for mode in ["owned", "shared", "all"]:
            validate_pagination_params(20, mode)  # Should not raise

    def test_invalid_page_size(self):
        """Test validation fails for invalid page size."""
        with pytest.raises(ValueError, match="Page size must be one of"):
            validate_pagination_params(15, "all")

        with pytest.raises(ValueError, match="Page size must be one of"):
            validate_pagination_params(200, "all")

    def test_invalid_filter_mode(self):
        """Test validation fails for invalid filter mode."""
        with pytest.raises(ValueError, match="Filter mode must be one of"):
            validate_pagination_params(20, "invalid")

        with pytest.raises(ValueError, match="Filter mode must be one of"):
            validate_pagination_params(20, "public")


class TestDecodeCursor:
    """Tests for decode_cursor function."""

    def test_decode_valid_cursor(self):
        """Test decoding a valid cursor."""
        cursor_data = {
            "owned": {"job_id": "test-123"},
            "shared": {"threat_model_id": "test-456", "user_id": "user-1"},
            "filter": "all",
        }
        cursor_json = json.dumps(cursor_data)
        cursor_b64 = base64.b64encode(cursor_json.encode("utf-8")).decode("utf-8")

        result = decode_cursor(cursor_b64)

        assert result["owned"] == {"job_id": "test-123"}
        assert result["shared"] == {"threat_model_id": "test-456", "user_id": "user-1"}
        assert result["filter"] == "all"

    def test_decode_cursor_with_none_values(self):
        """Test decoding cursor with None values for exhausted queries."""
        cursor_data = {
            "owned": None,
            "shared": {"threat_model_id": "test-456", "user_id": "user-1"},
            "filter": "shared",
        }
        cursor_json = json.dumps(cursor_data)
        cursor_b64 = base64.b64encode(cursor_json.encode("utf-8")).decode("utf-8")

        result = decode_cursor(cursor_b64)

        assert result["owned"] is None
        assert result["shared"] == {"threat_model_id": "test-456", "user_id": "user-1"}
        assert result["filter"] == "shared"

    def test_decode_empty_cursor(self):
        """Test decoding empty cursor returns None."""
        result = decode_cursor(None)
        assert result is None

        result = decode_cursor("")
        assert result is None

    def test_decode_invalid_base64(self):
        """Test decoding invalid base64 raises ValueError."""
        with pytest.raises(ValueError, match="Invalid pagination cursor"):
            decode_cursor("not-valid-base64!!!")

    def test_decode_invalid_json(self):
        """Test decoding invalid JSON raises ValueError."""
        invalid_json = base64.b64encode(b"not json").decode("utf-8")
        with pytest.raises(ValueError, match="Invalid pagination cursor"):
            decode_cursor(invalid_json)

    def test_decode_non_dict_cursor(self):
        """Test decoding non-dict cursor raises ValueError."""
        cursor_list = json.dumps(["not", "a", "dict"])
        cursor_b64 = base64.b64encode(cursor_list.encode("utf-8")).decode("utf-8")

        with pytest.raises(ValueError, match="Cursor must be a JSON object"):
            decode_cursor(cursor_b64)


class TestEncodeCursor:
    """Tests for encode_cursor function."""

    def test_encode_cursor_with_both_keys(self):
        """Test encoding cursor with both owned and shared keys."""
        owned_key = {"job_id": "test-123"}
        shared_key = {"threat_model_id": "test-456", "user_id": "user-1"}
        filter_mode = "all"

        result = encode_cursor(owned_key, shared_key, filter_mode)

        assert result is not None
        # Decode to verify
        decoded = decode_cursor(result)
        assert decoded["owned"] == owned_key
        assert decoded["shared"] == shared_key
        assert decoded["filter"] == filter_mode

    def test_encode_cursor_with_only_owned_key(self):
        """Test encoding cursor with only owned key."""
        owned_key = {"job_id": "test-123"}
        shared_key = None
        filter_mode = "owned"

        result = encode_cursor(owned_key, shared_key, filter_mode)

        assert result is not None
        decoded = decode_cursor(result)
        assert decoded["owned"] == owned_key
        assert decoded["shared"] is None
        assert decoded["filter"] == filter_mode

    def test_encode_cursor_with_only_shared_key(self):
        """Test encoding cursor with only shared key."""
        owned_key = None
        shared_key = {"threat_model_id": "test-456", "user_id": "user-1"}
        filter_mode = "shared"

        result = encode_cursor(owned_key, shared_key, filter_mode)

        assert result is not None
        decoded = decode_cursor(result)
        assert decoded["owned"] is None
        assert decoded["shared"] == shared_key
        assert decoded["filter"] == filter_mode

    def test_encode_cursor_with_no_keys(self):
        """Test encoding cursor with no keys returns None."""
        result = encode_cursor(None, None, "all")
        assert result is None


class TestQueryOwnedPaginated:
    """Tests for query_owned_paginated function."""

    @patch("services.threat_designer_service.LOG")
    def test_query_owned_without_cursor(self, mock_log):
        """Test querying owned threat models without cursor."""
        mock_table = Mock()
        mock_table.query.return_value = {
            "Items": [
                {"job_id": "test-1", "owner": "user-1"},
                {"job_id": "test-2", "owner": "user-1"},
            ],
            "LastEvaluatedKey": {"job_id": "test-2"},
        }

        result = query_owned_paginated(mock_table, "user-1", 20)

        assert len(result["items"]) == 2
        assert result["last_evaluated_key"] == {"job_id": "test-2"}
        mock_table.query.assert_called_once()
        call_args = mock_table.query.call_args[1]
        assert call_args["Limit"] == 20
        assert "ExclusiveStartKey" not in call_args

    @patch("services.threat_designer_service.LOG")
    def test_query_owned_with_cursor(self, mock_log):
        """Test querying owned threat models with cursor."""
        mock_table = Mock()
        mock_table.query.return_value = {
            "Items": [{"job_id": "test-3", "owner": "user-1"}],
            "LastEvaluatedKey": None,
        }

        start_key = {"job_id": "test-2"}
        result = query_owned_paginated(mock_table, "user-1", 20, start_key)

        assert len(result["items"]) == 1
        assert result["last_evaluated_key"] is None
        call_args = mock_table.query.call_args[1]
        assert call_args["ExclusiveStartKey"] == start_key

    @patch("services.threat_designer_service.LOG")
    def test_query_owned_handles_error(self, mock_log):
        """Test query_owned_paginated handles DynamoDB errors."""
        mock_table = Mock()
        mock_table.query.side_effect = Exception("DynamoDB error")

        with pytest.raises(InternalError):
            query_owned_paginated(mock_table, "user-1", 20)


class TestQuerySharedPaginated:
    """Tests for query_shared_paginated function."""

    @patch("services.threat_designer_service.LOG")
    def test_query_shared_without_cursor(self, mock_log):
        """Test querying shared threat models without cursor."""
        mock_sharing_table = Mock()
        mock_table = Mock()

        mock_sharing_table.query.return_value = {
            "Items": [
                {
                    "threat_model_id": "test-1",
                    "user_id": "user-2",
                    "access_level": "READ_ONLY",
                    "shared_by": "user-1",
                }
            ],
            "LastEvaluatedKey": {"threat_model_id": "test-1", "user_id": "user-2"},
        }

        mock_table.get_item.return_value = {
            "Item": {"job_id": "test-1", "owner": "user-1", "title": "Test Model"}
        }

        result = query_shared_paginated(mock_sharing_table, mock_table, "user-2", 20)

        assert len(result["items"]) == 1
        assert result["items"][0]["job_id"] == "test-1"
        assert result["items"][0]["is_owner"] is False
        assert result["items"][0]["access_level"] == "READ_ONLY"
        assert result["items"][0]["shared_by"] == "user-1"
        assert result["last_evaluated_key"] == {
            "threat_model_id": "test-1",
            "user_id": "user-2",
        }

    @patch("services.threat_designer_service.LOG")
    def test_query_shared_with_cursor(self, mock_log):
        """Test querying shared threat models with cursor."""
        mock_sharing_table = Mock()
        mock_table = Mock()

        mock_sharing_table.query.return_value = {"Items": [], "LastEvaluatedKey": None}

        start_key = {"threat_model_id": "test-1", "user_id": "user-2"}
        result = query_shared_paginated(
            mock_sharing_table, mock_table, "user-2", 20, start_key
        )

        assert len(result["items"]) == 0
        assert result["last_evaluated_key"] is None
        call_args = mock_sharing_table.query.call_args[1]
        assert call_args["ExclusiveStartKey"] == start_key

    @patch("services.threat_designer_service.LOG")
    def test_query_shared_skips_missing_threat_models(self, mock_log):
        """Test query_shared_paginated skips threat models that don't exist."""
        mock_sharing_table = Mock()
        mock_table = Mock()

        mock_sharing_table.query.return_value = {
            "Items": [
                {
                    "threat_model_id": "test-1",
                    "user_id": "user-2",
                    "access_level": "READ_ONLY",
                },
                {
                    "threat_model_id": "test-2",
                    "user_id": "user-2",
                    "access_level": "EDIT",
                },
            ]
        }

        # First call returns item, second call returns no item
        mock_table.get_item.side_effect = [
            {"Item": {"job_id": "test-1", "owner": "user-1"}},
            {},  # No item found
        ]

        result = query_shared_paginated(mock_sharing_table, mock_table, "user-2", 20)

        # Should only have one item (test-1), test-2 was skipped
        assert len(result["items"]) == 1
        assert result["items"][0]["job_id"] == "test-1"

    @patch("services.threat_designer_service.LOG")
    def test_query_shared_handles_error(self, mock_log):
        """Test query_shared_paginated handles DynamoDB errors."""
        mock_sharing_table = Mock()
        mock_table = Mock()
        mock_sharing_table.query.side_effect = Exception("DynamoDB error")

        with pytest.raises(InternalError):
            query_shared_paginated(mock_sharing_table, mock_table, "user-2", 20)
