"""
Unit tests for authorization.py

Tests cover:
- require_owner: Verify user is the owner of a threat model
- require_access: Verify user has required access level
- require_edit_lock: Verify user holds a valid edit lock
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

# Add backend/app to path for imports
backend_path = str(Path(__file__).parent.parent.parent.parent / 'backend' / 'app')
sys.path.insert(0, backend_path)

# Mock AWS X-Ray before importing services
sys.modules['aws_xray_sdk'] = MagicMock()
sys.modules['aws_xray_sdk.core'] = MagicMock()

from utils import authorization
from utils.authorization import (
    require_owner,
    require_access,
    require_edit_lock
)
from exceptions.exceptions import UnauthorizedError


# ============================================================================
# Tests for require_owner function
# ============================================================================

class TestRequireOwner:
    """Tests for require_owner function."""

    @patch.object(authorization, 'check_access')
    def test_require_owner_passes_for_owner(self, mock_check_access):
        """Test that require_owner passes when user is the owner."""
        # Setup
        mock_check_access.return_value = {
            'has_access': True,
            'is_owner': True,
            'access_level': 'OWNER'
        }

        # Execute - should not raise
        require_owner('test-job-123', 'user-123')

        # Assert
        mock_check_access.assert_called_once_with('test-job-123', 'user-123')

    @patch.object(authorization, 'check_access')
    def test_require_owner_raises_unauthorized_for_non_owner(self, mock_check_access):
        """Test that require_owner raises UnauthorizedError for non-owner."""
        # Setup
        mock_check_access.return_value = {
            'has_access': True,
            'is_owner': False,
            'access_level': 'EDIT'
        }

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            require_owner('test-job-123', 'user-456')

        assert 'Only the owner can perform this operation' in str(exc_info.value)
        mock_check_access.assert_called_once_with('test-job-123', 'user-456')

    @patch.object(authorization, 'check_access')
    def test_require_owner_raises_unauthorized_for_collaborator(self, mock_check_access):
        """Test that require_owner raises UnauthorizedError for collaborator."""
        # Setup - collaborator with READ_ONLY access
        mock_check_access.return_value = {
            'has_access': True,
            'is_owner': False,
            'access_level': 'READ_ONLY'
        }

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            require_owner('test-job-123', 'user-789')

        assert 'Only the owner can perform this operation' in str(exc_info.value)
        mock_check_access.assert_called_once_with('test-job-123', 'user-789')


# ============================================================================
# Tests for require_access function
# ============================================================================

class TestRequireAccess:
    """Tests for require_access function."""

    @patch.object(authorization, 'check_access')
    def test_require_access_passes_for_owner_with_any_required_level(self, mock_check_access):
        """Test that owner passes access check with any required level."""
        # Setup
        mock_check_access.return_value = {
            'has_access': True,
            'is_owner': True,
            'access_level': 'OWNER'
        }

        # Execute - owner should pass for READ_ONLY
        result = require_access('test-job-123', 'user-123', required_level='READ_ONLY')

        # Assert
        assert result['is_owner'] is True
        assert result['access_level'] == 'OWNER'
        mock_check_access.assert_called_once_with('test-job-123', 'user-123')

        # Reset mock
        mock_check_access.reset_mock()

        # Execute - owner should pass for EDIT
        result = require_access('test-job-123', 'user-123', required_level='EDIT')

        # Assert
        assert result['is_owner'] is True
        assert result['access_level'] == 'OWNER'
        mock_check_access.assert_called_once_with('test-job-123', 'user-123')

    @patch.object(authorization, 'check_access')
    def test_require_access_passes_for_collaborator_with_matching_access_level(self, mock_check_access):
        """Test that collaborator with matching access level passes."""
        # Setup - collaborator with EDIT access
        mock_check_access.return_value = {
            'has_access': True,
            'is_owner': False,
            'access_level': 'EDIT'
        }

        # Execute - should pass for EDIT requirement
        result = require_access('test-job-123', 'user-456', required_level='EDIT')

        # Assert
        assert result['is_owner'] is False
        assert result['access_level'] == 'EDIT'
        mock_check_access.assert_called_once_with('test-job-123', 'user-456')

    @patch.object(authorization, 'check_access')
    def test_require_access_raises_unauthorized_for_no_access(self, mock_check_access):
        """Test that require_access raises UnauthorizedError when user has no access."""
        # Setup
        mock_check_access.return_value = {
            'has_access': False,
            'is_owner': False,
            'access_level': None
        }

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            require_access('test-job-123', 'user-789')

        assert 'You do not have access to this threat model' in str(exc_info.value)
        mock_check_access.assert_called_once_with('test-job-123', 'user-789')

    @patch.object(authorization, 'check_access')
    def test_require_access_raises_unauthorized_for_read_only_when_edit_required(self, mock_check_access):
        """Test that READ_ONLY access fails when EDIT is required."""
        # Setup - collaborator with READ_ONLY access
        mock_check_access.return_value = {
            'has_access': True,
            'is_owner': False,
            'access_level': 'READ_ONLY'
        }

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            require_access('test-job-123', 'user-456', required_level='EDIT')

        assert 'You do not have permission to edit this threat model' in str(exc_info.value)
        mock_check_access.assert_called_once_with('test-job-123', 'user-456')

    @patch.object(authorization, 'check_access')
    def test_require_access_returns_access_info_dict(self, mock_check_access):
        """Test that require_access returns the access info dictionary."""
        # Setup
        expected_access_info = {
            'has_access': True,
            'is_owner': False,
            'access_level': 'READ_ONLY'
        }
        mock_check_access.return_value = expected_access_info

        # Execute
        result = require_access('test-job-123', 'user-456', required_level='READ_ONLY')

        # Assert
        assert result == expected_access_info
        assert result['has_access'] is True
        assert result['is_owner'] is False
        assert result['access_level'] == 'READ_ONLY'


# ============================================================================
# Tests for require_edit_lock function
# ============================================================================

class TestRequireEditLock:
    """Tests for require_edit_lock function."""

    @patch('services.lock_service.get_lock_status')
    @patch.object(authorization, 'require_access')
    def test_require_edit_lock_passes_when_user_holds_valid_lock(
        self, mock_require_access, mock_get_lock_status
    ):
        """Test that require_edit_lock passes when user holds a valid lock."""
        # Setup
        mock_require_access.return_value = {
            'has_access': True,
            'is_owner': False,
            'access_level': 'EDIT'
        }
        mock_get_lock_status.return_value = {
            'locked': True,
            'user_id': 'user-123',
            'lock_token': 'token-123',
            'username': 'testuser'
        }

        # Execute - should not raise
        require_edit_lock('test-job-123', 'user-123', 'token-123')

        # Assert
        mock_require_access.assert_called_once_with('test-job-123', 'user-123', required_level='EDIT')
        mock_get_lock_status.assert_called_once_with('test-job-123')

    @patch('services.lock_service.get_lock_status')
    @patch.object(authorization, 'require_access')
    def test_require_edit_lock_raises_unauthorized_without_lock(
        self, mock_require_access, mock_get_lock_status
    ):
        """Test that require_edit_lock raises UnauthorizedError when no lock exists."""
        # Setup
        mock_require_access.return_value = {
            'has_access': True,
            'is_owner': True,
            'access_level': 'OWNER'
        }
        mock_get_lock_status.return_value = {
            'locked': False
        }

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            require_edit_lock('test-job-123', 'user-123', 'token-123')

        assert 'You must acquire a lock before editing' in str(exc_info.value)
        mock_require_access.assert_called_once_with('test-job-123', 'user-123', required_level='EDIT')
        mock_get_lock_status.assert_called_once_with('test-job-123')

    @patch('services.lock_service.get_lock_status')
    @patch.object(authorization, 'require_access')
    def test_require_edit_lock_raises_unauthorized_when_lock_held_by_another_user(
        self, mock_require_access, mock_get_lock_status
    ):
        """Test that require_edit_lock raises UnauthorizedError when lock held by another user."""
        # Setup
        mock_require_access.return_value = {
            'has_access': True,
            'is_owner': False,
            'access_level': 'EDIT'
        }
        mock_get_lock_status.return_value = {
            'locked': True,
            'user_id': 'user-456',  # Different user holds the lock
            'lock_token': 'token-456',
            'username': 'otheruser'
        }

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            require_edit_lock('test-job-123', 'user-123', 'token-123')

        assert 'Lock is held by another user' in str(exc_info.value)
        mock_require_access.assert_called_once_with('test-job-123', 'user-123', required_level='EDIT')
        mock_get_lock_status.assert_called_once_with('test-job-123')

    @patch('services.lock_service.get_lock_status')
    @patch.object(authorization, 'require_access')
    def test_require_edit_lock_checks_edit_access_first(
        self, mock_require_access, mock_get_lock_status
    ):
        """Test that require_edit_lock checks EDIT access before checking lock."""
        # Setup - user doesn't have EDIT access
        mock_require_access.side_effect = UnauthorizedError('You do not have permission to edit this threat model')

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            require_edit_lock('test-job-123', 'user-789', 'token-789')

        assert 'You do not have permission to edit this threat model' in str(exc_info.value)
        mock_require_access.assert_called_once_with('test-job-123', 'user-789', required_level='EDIT')
        # get_lock_status should not be called if access check fails
        mock_get_lock_status.assert_not_called()
