"""
Unit tests for custom exception classes in backend/app/exceptions/exceptions.py
"""

import pytest
import sys
from pathlib import Path
from http import HTTPStatus

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))

from app.exceptions.exceptions import (
    ServiceError,
    ViewError,
    BadRequestError,
    UnauthorizedError,
    NotFoundError,
    ConflictError,
    InternalError,
    ValidationError,
    ForbiddenError,
)


class TestServiceError:
    """Tests for ServiceError class"""

    def test_service_error_stores_status_code_and_message(self):
        """Test ServiceError stores status code and message"""
        status_code = 500
        message = "Internal server error"

        error = ServiceError(status_code, message)

        assert error.status_code == status_code
        assert error.msg == message

    def test_service_error_with_different_status_codes(self):
        """Test ServiceError with various status codes"""
        test_cases = [
            (400, "Bad request"),
            (403, "Forbidden"),
            (404, "Not found"),
            (409, "Conflict"),
            (500, "Internal error"),
        ]

        for status_code, message in test_cases:
            error = ServiceError(status_code, message)
            assert error.status_code == status_code
            assert error.msg == message


class TestViewError:
    """Tests for ViewError base class"""

    def test_view_error_to_dict_includes_code_and_message(self):
        """Test ViewError.to_dict includes code and message"""
        message = "Test error message"
        error = ViewError(message)

        result = error.to_dict()

        assert "code" in result
        assert "message" in result
        assert result["code"] == "ViewError"
        assert result["message"] == message

    def test_view_error_to_dict_includes_request_id(self):
        """Test ViewError.to_dict includes request_id when provided"""
        message = "Test error"
        request_id = "req-123-456"
        error = ViewError(message)

        result = error.to_dict(request_id=request_id)

        assert "requestId" in result
        assert result["requestId"] == request_id

    def test_view_error_default_status(self):
        """Test ViewError has default INTERNAL_SERVER_ERROR status"""
        assert ViewError.STATUS == HTTPStatus.INTERNAL_SERVER_ERROR


class TestBadRequestError:
    """Tests for BadRequestError class"""

    def test_bad_request_error_has_400_status(self):
        """Test BadRequestError has 400 status code"""
        assert BadRequestError.STATUS == HTTPStatus.BAD_REQUEST
        assert BadRequestError.STATUS == 400

    def test_bad_request_error_to_dict(self):
        """Test BadRequestError.to_dict returns correct structure"""
        message = "Invalid input"
        error = BadRequestError(message)

        result = error.to_dict()

        assert result["code"] == "BadRequestError"
        assert result["message"] == message


class TestUnauthorizedError:
    """Tests for UnauthorizedError class"""

    def test_unauthorized_error_has_403_status(self):
        """Test UnauthorizedError has 403 status code"""
        assert UnauthorizedError.STATUS == HTTPStatus.FORBIDDEN
        assert UnauthorizedError.STATUS == 403

    def test_unauthorized_error_with_message(self):
        """Test UnauthorizedError stores message correctly"""
        message = "User not authorized"
        error = UnauthorizedError(message)

        result = error.to_dict()

        assert result["code"] == "UnauthorizedError"
        assert result["message"] == message


class TestNotFoundError:
    """Tests for NotFoundError class"""

    def test_not_found_error_has_404_status(self):
        """Test NotFoundError has 404 status code"""
        assert NotFoundError.STATUS == HTTPStatus.NOT_FOUND
        assert NotFoundError.STATUS == 404

    def test_not_found_error_to_dict(self):
        """Test NotFoundError.to_dict returns correct structure"""
        message = "Resource not found"
        error = NotFoundError(message)

        result = error.to_dict()

        assert result["code"] == "NotFoundError"
        assert result["message"] == message


class TestConflictError:
    """Tests for ConflictError class"""

    def test_conflict_error_has_409_status(self):
        """Test ConflictError has 409 status code"""
        assert ConflictError.STATUS == HTTPStatus.CONFLICT
        assert ConflictError.STATUS == 409

    def test_conflict_error_with_string_message(self):
        """Test ConflictError with string message"""
        message = "Version conflict detected"
        error = ConflictError(message)

        result = error.to_dict()

        assert result["code"] == "ConflictError"
        assert result["message"] == message

    def test_conflict_error_includes_details(self):
        """Test ConflictError includes details in to_dict"""
        message = "Lock conflict"
        details = {"locked_by": "user-456", "lock_timestamp": 1234567890}
        error = ConflictError(message, details=details)

        result = error.to_dict()

        assert result["code"] == "ConflictError"
        assert result["message"] == message
        assert result["locked_by"] == "user-456"
        assert result["lock_timestamp"] == 1234567890

    def test_conflict_error_with_dict_message(self):
        """Test ConflictError with dict message extracts message and details"""
        message_dict = {
            "message": "Version conflict",
            "server_version": "v2",
            "client_version": "v1",
        }
        error = ConflictError(message_dict)

        result = error.to_dict()

        assert result["code"] == "ConflictError"
        assert result["message"] == "Version conflict"
        assert result["server_version"] == "v2"
        assert result["client_version"] == "v1"

    def test_conflict_error_with_dict_message_no_message_key(self):
        """Test ConflictError with dict message without 'message' key uses default"""
        message_dict = {"detail": "Some detail"}
        error = ConflictError(message_dict)

        result = error.to_dict()

        assert result["code"] == "ConflictError"
        assert result["message"] == "Conflict detected"
        assert result["detail"] == "Some detail"


class TestInternalError:
    """Tests for InternalError class"""

    def test_internal_error_has_500_status(self):
        """Test InternalError has 500 status code"""
        assert InternalError.STATUS == HTTPStatus.INTERNAL_SERVER_ERROR
        assert InternalError.STATUS == 500

    def test_internal_error_to_dict(self):
        """Test InternalError.to_dict returns correct structure"""
        message = "Database connection failed"
        error = InternalError(message)

        result = error.to_dict()

        assert result["code"] == "InternalError"
        assert result["message"] == message


class TestValidationError:
    """Tests for ValidationError class"""

    def test_validation_error_inherits_from_bad_request(self):
        """Test ValidationError inherits from BadRequestError"""
        assert issubclass(ValidationError, BadRequestError)
        assert ValidationError.STATUS == HTTPStatus.BAD_REQUEST

    def test_validation_error_with_message(self):
        """Test ValidationError stores message correctly"""
        message = "Invalid field value"
        error = ValidationError(message)

        result = error.to_dict()

        assert result["code"] == "ValidationError"
        assert result["message"] == message


class TestForbiddenError:
    """Tests for ForbiddenError class"""

    def test_forbidden_error_has_403_status(self):
        """Test ForbiddenError has 403 status code"""
        assert ForbiddenError.STATUS == HTTPStatus.FORBIDDEN
        assert ForbiddenError.STATUS == 403

    def test_forbidden_error_to_dict(self):
        """Test ForbiddenError.to_dict returns correct structure"""
        message = "Access forbidden"
        error = ForbiddenError(message)

        result = error.to_dict()

        assert result["code"] == "ForbiddenError"
        assert result["message"] == message
