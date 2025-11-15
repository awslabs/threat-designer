"""
Unit tests for backend/app/utils/utils.py

Tests cover:
- CustomEncoder class for JSON serialization
- mask_sensitive_attributes function for data redaction
- create_dynamodb_item function for DynamoDB operations
"""

import sys
import json
from pathlib import Path
from datetime import datetime, date, timezone
from enum import Enum
from unittest.mock import Mock, patch, call, MagicMock
from decimal import Decimal
import pytest

# Add backend/app to path for imports
backend_path = str(Path(__file__).parent.parent.parent.parent / "backend" / "app")
sys.path.insert(0, backend_path)

# Mock AWS X-Ray before importing services
sys.modules["aws_xray_sdk"] = MagicMock()
sys.modules["aws_xray_sdk.core"] = MagicMock()

from utils.utils import CustomEncoder, mask_sensitive_attributes, create_dynamodb_item


# ============================================================================
# Test CustomEncoder Class
# ============================================================================


class TestCustomEncoder:
    """Tests for CustomEncoder JSON serialization class."""

    def test_encode_enum_values(self):
        """Test that Enum values are encoded to their value."""

        class Color(Enum):
            RED = "red"
            BLUE = "blue"
            GREEN = "green"

        data = {"color": Color.RED, "status": Color.BLUE}
        result = json.dumps(data, cls=CustomEncoder)
        parsed = json.loads(result)

        assert parsed["color"] == "red"
        assert parsed["status"] == "blue"

    def test_encode_datetime_objects(self):
        """Test that datetime objects are encoded to ISO format."""
        dt = datetime(2024, 1, 15, 10, 30, 45, tzinfo=timezone.utc)
        data = {"timestamp": dt}
        result = json.dumps(data, cls=CustomEncoder)
        parsed = json.loads(result)

        assert parsed["timestamp"] == "2024-01-15T10:30:45+00:00"

    def test_encode_date_objects(self):
        """Test that date objects are encoded to ISO format."""
        d = date(2024, 1, 15)
        data = {"date": d}
        result = json.dumps(data, cls=CustomEncoder)
        parsed = json.loads(result)

        assert parsed["date"] == "2024-01-15"

    def test_encode_none_as_null(self):
        """Test that None values are encoded as null (standard JSON behavior)."""
        data = {"value": None, "other": "test"}
        result = json.dumps(data, cls=CustomEncoder)
        parsed = json.loads(result)

        # None is handled by standard JSON encoder, not CustomEncoder.default()
        assert parsed["value"] is None
        assert parsed["other"] == "test"

    def test_encode_iterables_as_sorted_lists(self):
        """Test that iterables are encoded as sorted lists."""
        data = {"items": {3, 1, 2}, "tags": {"z", "a", "m"}}
        result = json.dumps(data, cls=CustomEncoder)
        parsed = json.loads(result)

        assert parsed["items"] == [1, 2, 3]
        assert parsed["tags"] == ["a", "m", "z"]

    def test_encode_mixed_types(self):
        """Test encoding multiple custom types together."""

        class Status(Enum):
            ACTIVE = "active"

        data = {
            "status": Status.ACTIVE,
            "created_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
            "tags": {"beta", "alpha"},
            "optional": None,
        }
        result = json.dumps(data, cls=CustomEncoder)
        parsed = json.loads(result)

        assert parsed["status"] == "active"
        assert parsed["created_at"] == "2024-01-01T00:00:00+00:00"
        assert parsed["tags"] == ["alpha", "beta"]
        # None is handled by standard JSON encoder
        assert parsed["optional"] is None


# ============================================================================
# Test mask_sensitive_attributes Function
# ============================================================================


class TestMaskSensitiveAttributes:
    """Tests for mask_sensitive_attributes data redaction function."""

    def test_masks_email_field(self):
        """Test that email fields are masked."""
        payload = {"email": "user@example.com", "name": "Test User"}
        mask_sensitive_attributes(payload)

        assert payload["email"] == "[REDACTED]"
        assert payload["name"] == "Test User"

    def test_masks_username_field(self):
        """Test that username fields are masked."""
        payload = {"username": "testuser", "id": "123"}
        mask_sensitive_attributes(payload)

        assert payload["username"] == "[REDACTED]"
        assert payload["id"] == "123"

    def test_masks_address_fields(self):
        """Test that address-related fields are masked."""
        payload = {
            "address": "123 Main St",
            "businessAddress": "456 Office Blvd",
            "city": "New York",
        }
        mask_sensitive_attributes(payload)

        assert payload["address"] == "[REDACTED]"
        assert payload["businessAddress"] == "[REDACTED]"
        assert payload["city"] == "New York"

    def test_masks_name_fields(self):
        """Test that firstName and lastName fields are masked."""
        payload = {"firstName": "John", "lastName": "Doe", "middleName": "Q"}
        mask_sensitive_attributes(payload)

        assert payload["firstName"] == "[REDACTED]"
        assert payload["lastName"] == "[REDACTED]"
        assert payload["middleName"] == "Q"

    def test_handles_nested_dictionaries(self):
        """Test that nested dictionaries are recursively masked."""
        payload = {
            "user": {
                "email": "user@example.com",
                "username": "testuser",
                "profile": {"firstName": "John", "lastName": "Doe"},
            },
            "id": "123",
        }
        mask_sensitive_attributes(payload)

        assert payload["user"]["email"] == "[REDACTED]"
        assert payload["user"]["username"] == "[REDACTED]"
        assert payload["user"]["profile"]["firstName"] == "[REDACTED]"
        assert payload["user"]["profile"]["lastName"] == "[REDACTED]"
        assert payload["id"] == "123"

    def test_preserves_non_sensitive_fields(self):
        """Test that non-sensitive fields are not modified."""
        payload = {
            "id": "user-123",
            "role": "admin",
            "status": "active",
            "created_at": "2024-01-01",
            "email": "user@example.com",
        }
        mask_sensitive_attributes(payload)

        assert payload["id"] == "user-123"
        assert payload["role"] == "admin"
        assert payload["status"] == "active"
        assert payload["created_at"] == "2024-01-01"
        assert payload["email"] == "[REDACTED]"

    def test_handles_empty_dictionary(self):
        """Test that empty dictionaries are handled correctly."""
        payload = {}
        mask_sensitive_attributes(payload)

        assert payload == {}

    def test_masks_all_sensitive_attributes(self):
        """Test that all configured sensitive attributes are masked."""
        payload = {
            "email": "test@example.com",
            "username": "testuser",
            "firstName": "John",
            "lastName": "Doe",
            "businessAddress": "123 Office St",
            "address": "456 Home Ave",
            "other": "not sensitive",
        }
        mask_sensitive_attributes(payload)

        assert payload["email"] == "[REDACTED]"
        assert payload["username"] == "[REDACTED]"
        assert payload["firstName"] == "[REDACTED]"
        assert payload["lastName"] == "[REDACTED]"
        assert payload["businessAddress"] == "[REDACTED]"
        assert payload["address"] == "[REDACTED]"
        assert payload["other"] == "not sensitive"


# ============================================================================
# Test create_dynamodb_item Function
# ============================================================================


class TestCreateDynamoDBItem:
    """Tests for create_dynamodb_item DynamoDB operation function."""

    @patch("utils.utils.boto3.resource")
    @patch("utils.utils.datetime")
    def test_creates_item_with_correct_structure(
        self, mock_datetime, mock_boto3_resource
    ):
        """Test that item is created with correct structure."""
        # Mock datetime
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        mock_datetime.now.return_value = mock_now

        # Mock DynamoDB
        mock_table = Mock()
        mock_table.put_item.return_value = {"ResponseMetadata": {"HTTPStatusCode": 200}}
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_boto3_resource.return_value = mock_dynamodb

        # Test data
        agent_state = {
            "job_id": "test-job-123",
            "s3_location": "test-bucket/test-key.json",
            "title": "Test Threat Model",
            "owner": "user-123",
            "retry": 0,
        }

        # Call function
        create_dynamodb_item(agent_state, "test-table")

        # Verify DynamoDB calls
        mock_boto3_resource.assert_called_once_with("dynamodb")
        mock_dynamodb.Table.assert_called_once_with("test-table")

        # Verify put_item was called with correct structure
        mock_table.put_item.assert_called_once()
        call_args = mock_table.put_item.call_args
        item = call_args[1]["Item"]

        assert item["job_id"] == "test-job-123"
        assert item["s3_location"] == "test-bucket/test-key.json"
        assert item["title"] == "Test Threat Model"
        assert item["owner"] == "user-123"
        assert item["retry"] == 0
        assert "timestamp" in item

    @patch("utils.utils.boto3.resource")
    @patch("utils.utils.datetime")
    def test_adds_timestamp(self, mock_datetime, mock_boto3_resource):
        """Test that timestamp is added to the item."""
        # Mock datetime
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        mock_datetime.now.return_value = mock_now

        # Mock DynamoDB
        mock_table = Mock()
        mock_table.put_item.return_value = {"ResponseMetadata": {"HTTPStatusCode": 200}}
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_boto3_resource.return_value = mock_dynamodb

        # Test data
        agent_state = {"job_id": "test-job-123", "s3_location": "test-key.json"}

        # Call function
        create_dynamodb_item(agent_state, "test-table")

        # Verify timestamp was added
        call_args = mock_table.put_item.call_args
        item = call_args[1]["Item"]

        assert item["timestamp"] == "2024-01-15T10:30:00+00:00"
        mock_datetime.now.assert_called_once_with(timezone.utc)

    @patch("utils.utils.boto3.resource")
    @patch("utils.utils.datetime")
    def test_handles_optional_fields(self, mock_datetime, mock_boto3_resource):
        """Test that optional fields are handled correctly."""
        # Mock datetime
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        mock_datetime.now.return_value = mock_now

        # Mock DynamoDB
        mock_table = Mock()
        mock_table.put_item.return_value = {"ResponseMetadata": {"HTTPStatusCode": 200}}
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_boto3_resource.return_value = mock_dynamodb

        # Test data with only required fields
        agent_state = {"job_id": "test-job-123", "s3_location": "test-key.json"}

        # Call function
        create_dynamodb_item(agent_state, "test-table")

        # Verify optional fields are None
        call_args = mock_table.put_item.call_args
        item = call_args[1]["Item"]

        assert item["job_id"] == "test-job-123"
        assert item["s3_location"] == "test-key.json"
        assert item["title"] is None
        assert item["owner"] is None
        assert item["retry"] is None

    @patch("utils.utils.boto3.resource")
    @patch("utils.utils.datetime")
    def test_calls_dynamodb_put_item(self, mock_datetime, mock_boto3_resource):
        """Test that DynamoDB put_item is called correctly."""
        # Mock datetime
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        mock_datetime.now.return_value = mock_now

        # Mock DynamoDB
        mock_table = Mock()
        mock_table.put_item.return_value = {"ResponseMetadata": {"HTTPStatusCode": 200}}
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_boto3_resource.return_value = mock_dynamodb

        # Test data
        agent_state = {
            "job_id": "test-job-456",
            "s3_location": "bucket/key.json",
            "title": "Another Model",
            "owner": "user-456",
            "retry": 2,
        }

        # Call function
        create_dynamodb_item(agent_state, "my-table")

        # Verify boto3 resource was called
        mock_boto3_resource.assert_called_once_with("dynamodb")

        # Verify Table was called with correct table name
        mock_dynamodb.Table.assert_called_once_with("my-table")

        # Verify put_item was called
        assert mock_table.put_item.call_count == 1

    @patch("utils.utils.boto3.resource")
    @patch("utils.utils.datetime")
    def test_raises_exception_on_dynamodb_error(
        self, mock_datetime, mock_boto3_resource
    ):
        """Test that exceptions from DynamoDB are raised."""
        # Mock datetime
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        mock_datetime.now.return_value = mock_now

        # Mock DynamoDB to raise exception
        mock_table = Mock()
        error_response = {"Error": {"Message": "DynamoDB error"}}
        exception = Exception()
        exception.response = error_response
        mock_table.put_item.side_effect = exception

        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_boto3_resource.return_value = mock_dynamodb

        # Test data
        agent_state = {"job_id": "test-job-123", "s3_location": "test-key.json"}

        # Verify exception is raised
        with pytest.raises(Exception):
            create_dynamodb_item(agent_state, "test-table")
