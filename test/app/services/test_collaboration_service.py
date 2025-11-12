"""
Unit tests for collaboration_service.py

Tests cover:
- check_access: Verify user access levels to threat models
- share_threat_model: Share threat models with collaborators
- get_collaborators: Retrieve list of collaborators
- remove_collaborator: Remove collaborator access
- update_collaborator_access: Update collaborator permissions
- list_cognito_users: List users from Cognito
"""

import sys
from pathlib import Path
from unittest.mock import Mock, patch, call, MagicMock
from decimal import Decimal
import pytest

# Add backend/app to path for imports
backend_path = str(Path(__file__).parent.parent.parent.parent / 'backend' / 'app')
sys.path.insert(0, backend_path)

# Mock AWS X-Ray before importing services
sys.modules['aws_xray_sdk'] = MagicMock()
sys.modules['aws_xray_sdk.core'] = MagicMock()

from services import collaboration_service
from services.collaboration_service import (
    check_access,
    share_threat_model,
    get_collaborators,
    remove_collaborator,
    update_collaborator_access,
    list_cognito_users
)
from exceptions.exceptions import (
    NotFoundError,
    UnauthorizedError,
    InternalError
)


# ============================================================================
# Tests for check_access function
# ============================================================================

class TestCheckAccess:
    """Tests for check_access function."""

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    def test_check_access_owner_returns_owner_access(self, mock_dynamodb, sample_threat_model):
        """Test that owner access returns correct access level."""
        # Setup
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {'Item': sample_threat_model}
        mock_dynamodb.Table.return_value = mock_agent_table

        # Execute
        result = check_access('test-job-123', 'user-123')

        # Assert
        assert result['has_access'] is True
        assert result['is_owner'] is True
        assert result['access_level'] == 'OWNER'
        mock_agent_table.get_item.assert_called_once_with(Key={'job_id': 'test-job-123'})

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    def test_check_access_collaborator_with_edit_access(self, mock_dynamodb, sample_threat_model, sample_sharing_record):
        """Test collaborator with EDIT access returns correct level."""
        # Setup
        mock_agent_table = Mock()
        mock_sharing_table = Mock()
        mock_agent_table.get_item.return_value = {'Item': sample_threat_model}
        mock_sharing_table.get_item.return_value = {'Item': sample_sharing_record}

        def table_selector(table_name):
            if table_name == 'test-agent-table':
                return mock_agent_table
            return mock_sharing_table

        mock_dynamodb.Table.side_effect = table_selector

        # Execute
        result = check_access('test-job-123', 'user-456')

        # Assert
        assert result['has_access'] is True
        assert result['is_owner'] is False
        assert result['access_level'] == 'EDIT'

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    def test_check_access_collaborator_with_read_only_access(self, mock_dynamodb, sample_threat_model):
        """Test collaborator with READ_ONLY access returns correct level."""
        # Setup
        mock_agent_table = Mock()
        mock_sharing_table = Mock()
        mock_agent_table.get_item.return_value = {'Item': sample_threat_model}
        read_only_record = {
            'threat_model_id': 'test-job-123',
            'user_id': 'user-456',
            'access_level': 'READ_ONLY',
            'shared_by': 'user-123',
            'owner': 'user-123'
        }
        mock_sharing_table.get_item.return_value = {'Item': read_only_record}

        def table_selector(table_name):
            if table_name == 'test-agent-table':
                return mock_agent_table
            return mock_sharing_table

        mock_dynamodb.Table.side_effect = table_selector

        # Execute
        result = check_access('test-job-123', 'user-456')

        # Assert
        assert result['has_access'] is True
        assert result['is_owner'] is False
        assert result['access_level'] == 'READ_ONLY'

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    def test_check_access_no_access_returns_false(self, mock_dynamodb, sample_threat_model):
        """Test user with no access returns has_access=False."""
        # Setup
        mock_agent_table = Mock()
        mock_sharing_table = Mock()
        mock_agent_table.get_item.return_value = {'Item': sample_threat_model}
        mock_sharing_table.get_item.return_value = {}  # No sharing record

        call_count = [0]
        def table_selector(table_name):
            call_count[0] += 1
            if call_count[0] == 1:  # First call is for agent table
                return mock_agent_table
            return mock_sharing_table  # Second call is for sharing table

        mock_dynamodb.Table.side_effect = table_selector

        # Execute
        result = check_access('test-job-123', 'user-789')

        # Assert
        assert result['has_access'] is False
        assert result['is_owner'] is False
        assert result['access_level'] is None

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    def test_check_access_threat_model_not_found_raises_error(self, mock_dynamodb):
        """Test threat model not found raises InternalError (wrapping NotFoundError)."""
        # Setup
        mock_agent_table = Mock()
        mock_agent_table.get_item.return_value = {}  # No Item key
        mock_dynamodb.Table.return_value = mock_agent_table

        # Execute & Assert - check_access wraps NotFoundError in InternalError
        with pytest.raises(InternalError) as exc_info:
            check_access('nonexistent-job', 'user-123')

        assert 'not found' in str(exc_info.value).lower()


# ============================================================================
# Tests for share_threat_model function
# ============================================================================

class TestShareThreatModel:
    """Tests for share_threat_model function."""

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_share_threat_model_owner_can_share(self, mock_check_access, mock_dynamodb):
        """Test owner can share with valid collaborators."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_sharing_table = Mock()
        mock_agent_table = Mock()

        # The function calls Table() twice: once for sharing_table, once for agent_table
        # First call returns sharing_table (used for all put_item calls)
        # Second call returns agent_table (used for update_item)
        tables = [mock_sharing_table, mock_agent_table]
        call_index = [0]
        
        def table_selector(table_name):
            idx = call_index[0]
            call_index[0] += 1
            if idx < len(tables):
                return tables[idx]
            return mock_agent_table

        mock_dynamodb.Table.side_effect = table_selector

        collaborators = [
            {'user_id': 'user-456', 'access_level': 'EDIT'},
            {'user_id': 'user-789', 'access_level': 'READ_ONLY'}
        ]

        # Execute
        result = share_threat_model('test-job-123', 'user-123', collaborators)

        # Assert
        assert result['success'] is True
        assert result['shared_count'] == 2
        assert mock_sharing_table.put_item.call_count == 2
        mock_agent_table.update_item.assert_called_once()

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'check_access')
    def test_share_threat_model_non_owner_raises_unauthorized(self, mock_check_access):
        """Test non-owner raises UnauthorizedError."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': False, 'access_level': 'EDIT'}

        collaborators = [{'user_id': 'user-789', 'access_level': 'READ_ONLY'}]

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            share_threat_model('test-job-123', 'user-456', collaborators)

        assert 'owner' in str(exc_info.value).lower()

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_share_threat_model_updates_is_shared_flag(self, mock_check_access, mock_dynamodb):
        """Test sharing updates is_shared flag in agent table."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_sharing_table = Mock()
        mock_agent_table = Mock()

        def table_selector(table_name):
            if table_name == 'test-sharing-table':
                return mock_sharing_table
            return mock_agent_table

        mock_dynamodb.Table.side_effect = table_selector

        collaborators = [{'user_id': 'user-456', 'access_level': 'EDIT'}]

        # Execute
        share_threat_model('test-job-123', 'user-123', collaborators)

        # Assert
        mock_agent_table.update_item.assert_called_once()
        call_args = mock_agent_table.update_item.call_args
        assert call_args[1]['UpdateExpression'] == 'SET is_shared = :true'
        assert call_args[1]['ExpressionAttributeValues'][':true'] is True

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_share_threat_model_invalid_access_level_defaults_to_read_only(self, mock_check_access, mock_dynamodb):
        """Test invalid access level defaults to READ_ONLY."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_sharing_table = Mock()
        mock_agent_table = Mock()

        # The function calls Table() twice: once for sharing_table, once for agent_table
        tables = [mock_sharing_table, mock_agent_table]
        call_index = [0]
        
        def table_selector(table_name):
            idx = call_index[0]
            call_index[0] += 1
            if idx < len(tables):
                return tables[idx]
            return mock_agent_table

        mock_dynamodb.Table.side_effect = table_selector

        collaborators = [{'user_id': 'user-456', 'access_level': 'INVALID'}]

        # Execute
        share_threat_model('test-job-123', 'user-123', collaborators)

        # Assert
        put_call = mock_sharing_table.put_item.call_args
        assert put_call[1]['Item']['access_level'] == 'READ_ONLY'

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_share_threat_model_with_multiple_collaborators(self, mock_check_access, mock_dynamodb):
        """Test sharing with multiple collaborators."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_sharing_table = Mock()
        mock_agent_table = Mock()

        # The function calls Table() twice: once for sharing_table, once for agent_table
        tables = [mock_sharing_table, mock_agent_table]
        call_index = [0]
        
        def table_selector(table_name):
            idx = call_index[0]
            call_index[0] += 1
            if idx < len(tables):
                return tables[idx]
            return mock_agent_table

        mock_dynamodb.Table.side_effect = table_selector

        collaborators = [
            {'user_id': 'user-456', 'access_level': 'EDIT'},
            {'user_id': 'user-789', 'access_level': 'READ_ONLY'},
            {'user_id': 'user-999', 'access_level': 'EDIT'}
        ]

        # Execute
        result = share_threat_model('test-job-123', 'user-123', collaborators)

        # Assert
        assert result['shared_count'] == 3
        assert mock_sharing_table.put_item.call_count == 3


# ============================================================================
# Tests for get_collaborators function
# ============================================================================

class TestGetCollaborators:
    """Tests for get_collaborators function."""

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool'
    })
    @patch.object(collaboration_service, 'cognito_client')
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_get_collaborators_returns_list_with_user_details(self, mock_check_access, mock_dynamodb, mock_cognito):
        """Test returns list of collaborators with user details."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {
            'Items': [
                {
                    'threat_model_id': 'test-job-123',
                    'user_id': 'user-456',
                    'access_level': 'EDIT',
                    'shared_at': '2024-01-01T00:00:00Z',
                    'shared_by': 'user-123'
                }
            ]
        }
        mock_dynamodb.Table.return_value = mock_sharing_table

        mock_cognito.list_users.return_value = {
            'Users': [{
                'Username': 'collaborator',
                'Attributes': [
                    {'Name': 'sub', 'Value': 'user-456'},
                    {'Name': 'email', 'Value': 'collab@example.com'},
                    {'Name': 'name', 'Value': 'Collaborator User'}
                ]
            }]
        }

        # Execute
        result = get_collaborators('test-job-123', 'user-123')

        # Assert
        assert 'collaborators' in result
        assert len(result['collaborators']) == 1
        collab = result['collaborators'][0]
        assert collab['user_id'] == 'user-456'
        assert collab['username'] == 'collaborator'
        assert collab['email'] == 'collab@example.com'
        assert collab['name'] == 'Collaborator User'
        assert collab['access_level'] == 'EDIT'

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool'
    })
    @patch.object(collaboration_service, 'cognito_client')
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_get_collaborators_excludes_requester(self, mock_check_access, mock_dynamodb, mock_cognito):
        """Test excludes requester from collaborators list."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {
            'Items': [
                {
                    'threat_model_id': 'test-job-123',
                    'user_id': 'user-123',  # This is the requester
                    'access_level': 'EDIT',
                    'shared_at': '2024-01-01T00:00:00Z',
                    'shared_by': 'user-123'
                },
                {
                    'threat_model_id': 'test-job-123',
                    'user_id': 'user-456',
                    'access_level': 'EDIT',
                    'shared_at': '2024-01-01T00:00:00Z',
                    'shared_by': 'user-123'
                }
            ]
        }
        mock_dynamodb.Table.return_value = mock_sharing_table

        mock_cognito.list_users.return_value = {
            'Users': [{
                'Username': 'collaborator',
                'Attributes': [
                    {'Name': 'sub', 'Value': 'user-456'},
                    {'Name': 'email', 'Value': 'collab@example.com'}
                ]
            }]
        }

        # Execute
        result = get_collaborators('test-job-123', 'user-123')

        # Assert
        assert len(result['collaborators']) == 1
        assert result['collaborators'][0]['user_id'] == 'user-456'

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool'
    })
    @patch.object(collaboration_service, 'cognito_client')
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_get_collaborators_cognito_lookup(self, mock_check_access, mock_dynamodb, mock_cognito):
        """Test Cognito lookup for usernames."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {
            'Items': [{
                'threat_model_id': 'test-job-123',
                'user_id': 'user-456',
                'access_level': 'EDIT',
                'shared_at': '2024-01-01T00:00:00Z',
                'shared_by': 'user-123'
            }]
        }
        mock_dynamodb.Table.return_value = mock_sharing_table

        mock_cognito.list_users.return_value = {
            'Users': [{
                'Username': 'testuser',
                'Attributes': [
                    {'Name': 'sub', 'Value': 'user-456'},
                    {'Name': 'email', 'Value': 'test@example.com'}
                ]
            }]
        }

        # Execute
        get_collaborators('test-job-123', 'user-123')

        # Assert
        mock_cognito.list_users.assert_called_once()
        call_args = mock_cognito.list_users.call_args
        # Check keyword arguments
        assert 'UserPoolId' in call_args.kwargs or (len(call_args.args) == 0 and 'UserPoolId' in call_args[1])
        # The Filter should contain the user_id
        filter_arg = call_args.kwargs.get('Filter') or call_args[1].get('Filter')
        assert 'user-456' in filter_arg

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool'
    })
    @patch.object(collaboration_service, 'cognito_client')
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_get_collaborators_handles_cognito_failures_gracefully(self, mock_check_access, mock_dynamodb, mock_cognito):
        """Test handles Cognito lookup failures gracefully."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_sharing_table = Mock()
        mock_sharing_table.query.return_value = {
            'Items': [{
                'threat_model_id': 'test-job-123',
                'user_id': 'user-456',
                'access_level': 'EDIT',
                'shared_at': '2024-01-01T00:00:00Z',
                'shared_by': 'user-123'
            }]
        }
        mock_dynamodb.Table.return_value = mock_sharing_table

        # Cognito fails
        mock_cognito.list_users.side_effect = Exception('Cognito error')

        # Execute
        result = get_collaborators('test-job-123', 'user-123')

        # Assert - should still return collaborator with user_id as fallback
        assert len(result['collaborators']) == 1
        assert result['collaborators'][0]['username'] == 'user-456'

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'check_access')
    def test_get_collaborators_unauthorized_user_raises_error(self, mock_check_access):
        """Test unauthorized user raises UnauthorizedError."""
        # Setup
        mock_check_access.return_value = {'has_access': False, 'is_owner': False, 'access_level': None}

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            get_collaborators('test-job-123', 'user-789')

        assert 'access' in str(exc_info.value).lower()


# ============================================================================
# Tests for remove_collaborator function
# ============================================================================

class TestRemoveCollaborator:
    """Tests for remove_collaborator function."""

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table',
        'LOCKS_TABLE': 'test-locks-table'
    })
    @patch('services.lock_service.get_lock_status')
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_remove_collaborator_owner_can_remove(self, mock_check_access, mock_dynamodb, mock_get_lock):
        """Test owner can remove collaborator."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_get_lock.return_value = {'locked': False}

        mock_sharing_table = Mock()
        mock_agent_table = Mock()
        mock_sharing_table.query.return_value = {'Count': 1}  # Still has collaborators

        # First call: delete_item, Second call: query
        tables = [mock_sharing_table, mock_sharing_table]
        call_index = [0]
        
        def table_selector(table_name):
            idx = call_index[0]
            call_index[0] += 1
            return tables[idx] if idx < len(tables) else mock_sharing_table

        mock_dynamodb.Table.side_effect = table_selector

        # Execute
        result = remove_collaborator('test-job-123', 'user-123', 'user-456')

        # Assert
        assert result['success'] is True
        assert result['removed_user'] == 'user-456'
        mock_sharing_table.delete_item.assert_called_once_with(
            Key={'threat_model_id': 'test-job-123', 'user_id': 'user-456'}
        )

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'check_access')
    def test_remove_collaborator_non_owner_raises_unauthorized(self, mock_check_access):
        """Test non-owner raises UnauthorizedError."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': False, 'access_level': 'EDIT'}

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            remove_collaborator('test-job-123', 'user-456', 'user-789')

        assert 'owner' in str(exc_info.value).lower()

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table',
        'LOCKS_TABLE': 'test-locks-table'
    })
    @patch('services.lock_service.get_lock_status')
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_remove_collaborator_releases_lock_if_held(self, mock_check_access, mock_dynamodb, mock_get_lock):
        """Test releases lock if collaborator holds it."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_get_lock.return_value = {'locked': True, 'user_id': 'user-456'}

        mock_sharing_table = Mock()
        mock_agent_table = Mock()
        mock_locks_table = Mock()
        mock_sharing_table.query.return_value = {'Count': 1}

        # Calls: delete_item (sharing), delete_item (locks), query (sharing)
        tables = [mock_sharing_table, mock_locks_table, mock_sharing_table]
        call_index = [0]
        
        def table_selector(table_name):
            idx = call_index[0]
            call_index[0] += 1
            return tables[idx] if idx < len(tables) else mock_sharing_table

        mock_dynamodb.Table.side_effect = table_selector

        # Execute
        remove_collaborator('test-job-123', 'user-123', 'user-456')

        # Assert
        mock_locks_table.delete_item.assert_called_once_with(
            Key={'threat_model_id': 'test-job-123'}
        )

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table',
        'LOCKS_TABLE': 'test-locks-table'
    })
    @patch('services.lock_service.get_lock_status')
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    def test_remove_collaborator_updates_is_shared_when_last_removed(self, mock_check_access, mock_dynamodb, mock_get_lock):
        """Test updates is_shared flag when last collaborator removed."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_get_lock.return_value = {'locked': False}

        mock_sharing_table = Mock()
        mock_agent_table = Mock()
        mock_sharing_table.query.return_value = {'Count': 0}  # No more collaborators

        # The function calls Table() twice:
        # 1. sharing_table (used for both delete_item and query)
        # 2. agent_table (used for update_item when count is 0)
        tables = [mock_sharing_table, mock_agent_table]
        call_index = [0]
        
        def table_selector(table_name):
            idx = call_index[0]
            call_index[0] += 1
            if idx < len(tables):
                return tables[idx]
            return mock_agent_table

        mock_dynamodb.Table.side_effect = table_selector

        # Execute
        remove_collaborator('test-job-123', 'user-123', 'user-456')

        # Assert
        mock_agent_table.update_item.assert_called_once()
        call_args = mock_agent_table.update_item.call_args
        assert call_args[1]['UpdateExpression'] == 'SET is_shared = :false'
        assert call_args[1]['ExpressionAttributeValues'][':false'] is False


# ============================================================================
# Tests for update_collaborator_access function
# ============================================================================

class TestUpdateCollaboratorAccess:
    """Tests for update_collaborator_access function."""

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table',
        'LOCKS_TABLE': 'test-locks-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    @patch('services.lock_service.get_lock_status')
    def test_update_collaborator_access_owner_can_update(self, mock_get_lock, mock_check_access, mock_dynamodb):
        """Test owner can update access level."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_get_lock.return_value = {'locked': False}

        mock_sharing_table = Mock()
        mock_dynamodb.Table.return_value = mock_sharing_table

        # Execute
        result = update_collaborator_access('test-job-123', 'user-123', 'user-456', 'EDIT')

        # Assert
        assert result['success'] is True
        assert result['new_access_level'] == 'EDIT'
        mock_sharing_table.update_item.assert_called_once()

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'check_access')
    def test_update_collaborator_access_non_owner_raises_unauthorized(self, mock_check_access):
        """Test non-owner raises UnauthorizedError."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': False, 'access_level': 'EDIT'}

        # Execute & Assert
        with pytest.raises(UnauthorizedError) as exc_info:
            update_collaborator_access('test-job-123', 'user-456', 'user-789', 'READ_ONLY')

        assert 'owner' in str(exc_info.value).lower()

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table',
        'LOCKS_TABLE': 'test-locks-table'
    })
    @patch.object(collaboration_service, 'dynamodb')
    @patch.object(collaboration_service, 'check_access')
    @patch('services.lock_service.get_lock_status')
    def test_update_collaborator_access_downgrade_releases_lock(self, mock_get_lock, mock_check_access, mock_dynamodb):
        """Test downgrade to READ_ONLY releases lock."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}
        mock_get_lock.return_value = {'locked': True, 'user_id': 'user-456'}

        mock_sharing_table = Mock()
        mock_locks_table = Mock()

        def table_selector(table_name):
            if table_name == 'test-sharing-table':
                return mock_sharing_table
            return mock_locks_table

        mock_dynamodb.Table.side_effect = table_selector

        # Execute
        update_collaborator_access('test-job-123', 'user-123', 'user-456', 'READ_ONLY')

        # Assert
        mock_locks_table.delete_item.assert_called_once_with(
            Key={'threat_model_id': 'test-job-123'}
        )

    @patch.dict('os.environ', {
        'AGENT_STATE_TABLE': 'test-agent-table',
        'SHARING_TABLE': 'test-sharing-table'
    })
    @patch.object(collaboration_service, 'check_access')
    def test_update_collaborator_access_invalid_level_raises_error(self, mock_check_access):
        """Test invalid access level raises InternalError (wrapping ValueError)."""
        # Setup
        mock_check_access.return_value = {'has_access': True, 'is_owner': True, 'access_level': 'OWNER'}

        # Execute & Assert - ValueError is wrapped in InternalError
        with pytest.raises(InternalError) as exc_info:
            update_collaborator_access('test-job-123', 'user-123', 'user-456', 'INVALID')

        assert 'invalid' in str(exc_info.value).lower()


# ============================================================================
# Tests for list_cognito_users function
# ============================================================================

class TestListCognitoUsers:
    """Tests for list_cognito_users function."""

    @patch.dict('os.environ', {'COGNITO_USER_POOL_ID': 'us-east-1_TestPool'})
    @patch.object(collaboration_service, 'cognito_client')
    def test_list_cognito_users_returns_list(self, mock_cognito):
        """Test returns list of users from Cognito."""
        # Setup
        mock_cognito.list_users.return_value = {
            'Users': [
                {
                    'Username': 'user1',
                    'Enabled': True,
                    'UserStatus': 'CONFIRMED',
                    'Attributes': [
                        {'Name': 'sub', 'Value': 'user-123'},
                        {'Name': 'email', 'Value': 'user1@example.com'},
                        {'Name': 'name', 'Value': 'User One'}
                    ]
                },
                {
                    'Username': 'user2',
                    'Enabled': True,
                    'UserStatus': 'CONFIRMED',
                    'Attributes': [
                        {'Name': 'sub', 'Value': 'user-456'},
                        {'Name': 'email', 'Value': 'user2@example.com'}
                    ]
                }
            ]
        }

        # Execute
        result = list_cognito_users()

        # Assert
        assert 'users' in result
        assert len(result['users']) == 2
        assert result['users'][0]['username'] == 'user1'
        assert result['users'][0]['email'] == 'user1@example.com'

    @patch.dict('os.environ', {'COGNITO_USER_POOL_ID': 'us-east-1_TestPool'})
    @patch.object(collaboration_service, 'cognito_client')
    def test_list_cognito_users_excludes_specified_user(self, mock_cognito):
        """Test excludes specified user."""
        # Setup
        mock_cognito.list_users.return_value = {
            'Users': [
                {
                    'Username': 'user1',
                    'Enabled': True,
                    'UserStatus': 'CONFIRMED',
                    'Attributes': [
                        {'Name': 'sub', 'Value': 'user-123'},
                        {'Name': 'email', 'Value': 'user1@example.com'}
                    ]
                },
                {
                    'Username': 'user2',
                    'Enabled': True,
                    'UserStatus': 'CONFIRMED',
                    'Attributes': [
                        {'Name': 'sub', 'Value': 'user-456'},
                        {'Name': 'email', 'Value': 'user2@example.com'}
                    ]
                }
            ]
        }

        # Execute
        result = list_cognito_users(exclude_user='user-123')

        # Assert
        assert len(result['users']) == 1
        assert result['users'][0]['user_id'] == 'user-456'

    @patch.dict('os.environ', {'COGNITO_USER_POOL_ID': 'us-east-1_TestPool'})
    @patch.object(collaboration_service, 'cognito_client')
    def test_list_cognito_users_handles_pagination(self, mock_cognito):
        """Test handles pagination."""
        # Setup - simulate pagination
        mock_cognito.list_users.side_effect = [
            {
                'Users': [
                    {
                        'Username': 'user1',
                        'Enabled': True,
                        'UserStatus': 'CONFIRMED',
                        'Attributes': [
                            {'Name': 'sub', 'Value': 'user-123'},
                            {'Name': 'email', 'Value': 'user1@example.com'}
                        ]
                    }
                ],
                'PaginationToken': 'token123'
            },
            {
                'Users': [
                    {
                        'Username': 'user2',
                        'Enabled': True,
                        'UserStatus': 'CONFIRMED',
                        'Attributes': [
                            {'Name': 'sub', 'Value': 'user-456'},
                            {'Name': 'email', 'Value': 'user2@example.com'}
                        ]
                    }
                ]
            }
        ]

        # Execute
        result = list_cognito_users()

        # Assert
        assert len(result['users']) == 2
        assert mock_cognito.list_users.call_count == 2

    @patch.dict('os.environ', {'COGNITO_USER_POOL_ID': 'us-east-1_TestPool'})
    @patch.object(collaboration_service, 'cognito_client')
    def test_list_cognito_users_search_filter(self, mock_cognito):
        """Test search filter functionality."""
        # Setup
        mock_cognito.list_users.return_value = {
            'Users': [
                {
                    'Username': 'testuser',
                    'Enabled': True,
                    'UserStatus': 'CONFIRMED',
                    'Attributes': [
                        {'Name': 'sub', 'Value': 'user-123'},
                        {'Name': 'email', 'Value': 'test@example.com'}
                    ]
                }
            ]
        }

        # Execute
        result = list_cognito_users(search_filter='test')

        # Assert
        mock_cognito.list_users.assert_called_once()
        call_args = mock_cognito.list_users.call_args
        assert 'Filter' in call_args[1]
        assert 'test' in call_args[1]['Filter']

    @patch.dict('os.environ', {'COGNITO_USER_POOL_ID': 'us-east-1_TestPool'})
    @patch.object(collaboration_service, 'cognito_client')
    def test_list_cognito_users_handles_errors(self, mock_cognito):
        """Test handles Cognito errors."""
        # Setup
        mock_cognito.list_users.side_effect = Exception('Cognito service error')

        # Execute & Assert
        with pytest.raises(InternalError):
            list_cognito_users()
