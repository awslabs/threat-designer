"""
Unit tests for backend/app/routes/threat_designer_route.py

Tests cover all route handlers including:
- GET endpoints (status, fetch results, fetch all, lock status, collaborators)
- POST endpoints (start, acquire lock, share, upload)
- PUT endpoints (update results, restore, refresh lock, update collaborator access)
- DELETE endpoints (delete, delete session, release lock, remove collaborator, force release)
- Error handling across all routes
"""

import sys
import os
from pathlib import Path
from unittest.mock import Mock, patch
import pytest

# Add backend/app to path for imports
backend_path = str(Path(__file__).parent.parent.parent.parent / 'backend' / 'app')
sys.path.insert(0, backend_path)

# Mock environment variables before importing services
os.environ['JOB_STATUS_TABLE'] = 'test-status-table'
os.environ['AGENT_STATE_TABLE'] = 'test-agent-table'
os.environ['AGENT_TRAIL_TABLE'] = 'test-trail-table'
os.environ['THREAT_MODELING_AGENT'] = 'arn:aws:bedrock-agent:us-east-1:123456789012:agent/test-agent'
os.environ['THREAT_MODELING_LAMBDA'] = 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
os.environ['ARCHITECTURE_BUCKET'] = 'test-bucket'
os.environ['REGION'] = 'us-east-1'
os.environ['SHARING_TABLE'] = 'test-sharing-table'
os.environ['LOCKS_TABLE'] = 'test-locks-table'
os.environ['COGNITO_USER_POOL_ID'] = 'us-east-1_TestPool'

from exceptions.exceptions import (
    UnauthorizedError,
    NotFoundError,
    ConflictError,
    InternalError,
    BadRequestError
)


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def mock_router_event():
    """Mock router.current_event for testing route handlers."""
    mock_event = Mock()
    mock_event.path = '/threat-designer/test'
    mock_event.request_context.authorizer = {
        'user_id': 'user-123',
        'username': 'testuser',
        'email': 'test@example.com'
    }
    mock_event.json_body = {}
    mock_event.query_string_parameters = None
    return mock_event


# ============================================================================
# GET Endpoint Tests
# ============================================================================

class TestGetEndpoints:
    """Tests for GET route handlers."""

    @patch('routes.threat_designer_route.check_status')
    @patch('utils.authorization.require_access')
    @patch('routes.threat_designer_route.router')
    def test_tm_status_returns_status_for_authorized_user(
        self, mock_router, mock_require_access, mock_check_status
    ):
        """Test _tm_status returns status for authorized user."""
        mock_router.current_event.path = '/threat-designer/status/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_check_status.return_value = {'job_id': 'test-job-123', 'status': 'COMPLETED'}

        from routes.threat_designer_route import _tm_status
        result = _tm_status('test-job-123')

        assert result['status'] == 'COMPLETED'
        mock_require_access.assert_called_once()
        mock_check_status.assert_called_once_with('test-job-123')

    @patch('routes.threat_designer_route.check_status')
    @patch('routes.threat_designer_route.router')
    def test_tm_status_mcp_bypasses_authorization(
        self, mock_router, mock_check_status
    ):
        """Test MCP endpoint bypasses authorization checks."""
        mock_router.current_event.path = '/threat-designer/mcp/status/test-job-123'
        mock_check_status.return_value = {'job_id': 'test-job-123', 'status': 'COMPLETED'}

        from routes.threat_designer_route import _tm_status
        result = _tm_status('test-job-123')

        assert result['status'] == 'COMPLETED'
        mock_check_status.assert_called_once_with('test-job-123')

    @patch('routes.threat_designer_route.fetch_results')
    @patch('routes.threat_designer_route.router')
    def test_tm_fetch_results_returns_threat_model(
        self, mock_router, mock_fetch_results
    ):
        """Test _tm_fetch_results returns threat model."""
        mock_router.current_event.path = '/threat-designer/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_fetch_results.return_value = {'job_id': 'test-job-123', 'owner': 'user-123'}

        from routes.threat_designer_route import _tm_fetch_results
        result = _tm_fetch_results('test-job-123')

        assert result['owner'] == 'user-123'
        mock_fetch_results.assert_called_once_with('test-job-123', 'user-123')

    @patch('routes.threat_designer_route.fetch_results')
    @patch('routes.threat_designer_route.router')
    def test_tm_fetch_results_mcp_uses_mcp_user(
        self, mock_router, mock_fetch_results
    ):
        """Test MCP endpoint uses 'MCP' as user_id."""
        mock_router.current_event.path = '/threat-designer/mcp/test-job-123'
        mock_fetch_results.return_value = {'job_id': 'test-job-123'}

        from routes.threat_designer_route import _tm_fetch_results
        _tm_fetch_results('test-job-123')

        mock_fetch_results.assert_called_once_with('test-job-123', 'MCP')

    @patch('routes.threat_designer_route.fetch_all')
    @patch('routes.threat_designer_route.router')
    def test_fetch_all_returns_owned_and_shared_threat_models(
        self, mock_router, mock_fetch_all
    ):
        """Test _fetch_all returns owned and shared threat models."""
        mock_router.current_event.path = '/threat-designer/all'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_fetch_all.return_value = {'owned': [{'job_id': 'job-1'}], 'shared': []}

        from routes.threat_designer_route import _fetch_all
        result = _fetch_all()

        assert 'owned' in result
        mock_fetch_all.assert_called_once_with('user-123')

    @patch('routes.threat_designer_route.get_lock_status')
    def test_get_lock_status_returns_lock_status(
        self, mock_get_lock_status
    ):
        """Test _get_lock_status returns lock status."""
        mock_get_lock_status.return_value = {'locked': True, 'user_id': 'user-456'}

        from routes.threat_designer_route import _get_lock_status
        result = _get_lock_status('test-job-123')

        assert result['locked'] is True
        mock_get_lock_status.assert_called_once_with('test-job-123')

    @patch('routes.threat_designer_route.get_collaborators')
    @patch('routes.threat_designer_route.router')
    def test_get_collaborators_returns_collaborator_list(
        self, mock_router, mock_get_collaborators
    ):
        """Test _get_collaborators returns list of collaborators."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_get_collaborators.return_value = {
            'collaborators': [{'user_id': 'user-456', 'access_level': 'EDIT'}]
        }

        from routes.threat_designer_route import _get_collaborators
        result = _get_collaborators('test-job-123')

        assert len(result['collaborators']) == 1
        mock_get_collaborators.assert_called_once_with('test-job-123', 'user-123')


# ============================================================================
# POST Endpoint Tests
# ============================================================================

class TestPostEndpoints:
    """Tests for POST route handlers."""

    @patch('routes.threat_designer_route.invoke_lambda')
    @patch('routes.threat_designer_route.router')
    def test_tm_start_invokes_lambda_with_correct_payload(
        self, mock_router, mock_invoke_lambda
    ):
        """Test tm_start invokes Lambda with correct payload."""
        mock_router.current_event.path = '/threat-designer'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {'description': 'Test', 'assumptions': []}
        mock_invoke_lambda.return_value = {'job_id': 'test-job-123'}

        from routes.threat_designer_route import tm_start
        result = tm_start()

        assert result['job_id'] == 'test-job-123'
        mock_invoke_lambda.assert_called_once()

    @patch('routes.threat_designer_route.invoke_lambda')
    @patch('routes.threat_designer_route.router')
    def test_tm_start_mcp_uses_mcp_owner(
        self, mock_router, mock_invoke_lambda
    ):
        """Test MCP endpoint uses 'MCP' as owner."""
        mock_router.current_event.path = '/threat-designer/mcp'
        mock_router.current_event.json_body = {'description': 'Test'}
        mock_invoke_lambda.return_value = {'job_id': 'test-job-123'}

        from routes.threat_designer_route import tm_start
        tm_start()

        call_args = mock_invoke_lambda.call_args
        assert call_args[0][0] == 'MCP'

    @patch('routes.threat_designer_route.acquire_lock')
    @patch('routes.threat_designer_route.router')
    def test_acquire_lock_returns_lock_token(
        self, mock_router, mock_acquire_lock
    ):
        """Test _acquire_lock returns lock token on success."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_acquire_lock.return_value = {'success': True, 'lock_token': 'token-123'}

        from routes.threat_designer_route import _acquire_lock
        result = _acquire_lock('test-job-123')

        assert result['success'] is True
        assert result['lock_token'] == 'token-123'

    @patch('routes.threat_designer_route.acquire_lock')
    @patch('routes.threat_designer_route.router')
    def test_acquire_lock_returns_409_when_locked(
        self, mock_router, mock_acquire_lock
    ):
        """Test _acquire_lock returns 409 Conflict when locked."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_acquire_lock.return_value = {'success': False, 'locked_by': 'user-456'}

        from routes.threat_designer_route import _acquire_lock
        result = _acquire_lock('test-job-123')

        assert result.status_code == 409

    @patch('routes.threat_designer_route.share_threat_model')
    @patch('routes.threat_designer_route.router')
    def test_share_threat_model_shares_with_collaborators(
        self, mock_router, mock_share_threat_model
    ):
        """Test _share_threat_model shares with collaborators."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {
            'collaborators': [{'user_id': 'user-456', 'access_level': 'EDIT'}]
        }
        mock_share_threat_model.return_value = {'success': True}

        from routes.threat_designer_route import _share_threat_model
        result = _share_threat_model('test-job-123')

        assert result['success'] is True

    @patch('routes.threat_designer_route.generate_presigned_url')
    @patch('routes.threat_designer_route.router')
    def test_upload_generates_presigned_url(
        self, mock_router, mock_generate_presigned_url
    ):
        """Test _upload generates presigned URL."""
        mock_router.current_event.json_body = {'file_type': 'image/png'}
        mock_generate_presigned_url.return_value = {
            'upload_url': 'https://s3.example.com/presigned',
            's3_key': 'test-key'
        }

        from routes.threat_designer_route import _upload
        result = _upload()

        assert 'upload_url' in result or 'presigned' in result


# ============================================================================
# PUT Endpoint Tests
# ============================================================================

class TestPutEndpoints:
    """Tests for PUT route handlers."""

    @patch('routes.threat_designer_route.update_results')
    @patch('routes.threat_designer_route.router')
    def test_update_results_updates_threat_model(
        self, mock_router, mock_update_results
    ):
        """Test _update_results updates threat model."""
        mock_router.current_event.path = '/threat-designer/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {
            'description': 'Updated',
            'lock_token': 'token-123'
        }
        mock_update_results.return_value = {'success': True}

        from routes.threat_designer_route import _update_results
        result = _update_results('test-job-123')

        assert result['success'] is True

    @patch('routes.threat_designer_route.update_results')
    @patch('routes.threat_designer_route.router')
    def test_update_results_mcp_bypasses_lock(
        self, mock_router, mock_update_results
    ):
        """Test MCP endpoint bypasses lock requirement."""
        mock_router.current_event.path = '/threat-designer/mcp/test-job-123'
        mock_router.current_event.json_body = {'description': 'Updated'}
        mock_update_results.return_value = {'success': True}

        from routes.threat_designer_route import _update_results
        _update_results('test-job-123')

        call_args = mock_update_results.call_args
        assert call_args[0][2] == 'MCP'
        assert call_args[0][3] is None  # No lock token

    @patch('routes.threat_designer_route.restore')
    @patch('routes.threat_designer_route.router')
    def test_restore_restores_from_backup(
        self, mock_router, mock_restore
    ):
        """Test _restore restores threat model from backup."""
        mock_router.current_event.path = '/threat-designer/restore/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_restore.return_value = {'success': True}

        from routes.threat_designer_route import _restore
        result = _restore('test-job-123')

        assert result['success'] is True

    @patch('routes.threat_designer_route.refresh_lock')
    @patch('routes.threat_designer_route.router')
    def test_refresh_lock_refreshes_lock_timestamp(
        self, mock_router, mock_refresh_lock
    ):
        """Test _refresh_lock refreshes lock timestamp."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {'lock_token': 'token-123'}
        mock_refresh_lock.return_value = {'success': True}

        from routes.threat_designer_route import _refresh_lock
        result = _refresh_lock('test-job-123')

        assert result['success'] is True

    @patch('routes.threat_designer_route.refresh_lock')
    @patch('routes.threat_designer_route.router')
    def test_refresh_lock_returns_410_when_lock_lost(
        self, mock_router, mock_refresh_lock
    ):
        """Test _refresh_lock returns 410 Gone when lock is lost."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {'lock_token': 'token-123'}
        mock_refresh_lock.return_value = {'success': False, 'status_code': 410}

        from routes.threat_designer_route import _refresh_lock
        result = _refresh_lock('test-job-123')

        assert result.status_code == 410

    @patch('routes.threat_designer_route.update_collaborator_access')
    @patch('routes.threat_designer_route.router')
    def test_update_collaborator_access_updates_access_level(
        self, mock_router, mock_update_collaborator_access
    ):
        """Test _update_collaborator_access updates access level."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {'access_level': 'READ_ONLY'}
        mock_update_collaborator_access.return_value = {'success': True}

        from routes.threat_designer_route import _update_collaborator_access
        result = _update_collaborator_access('test-job-123', 'user-456')

        assert result['success'] is True


# ============================================================================
# DELETE Endpoint Tests
# ============================================================================

class TestDeleteEndpoints:
    """Tests for DELETE route handlers."""

    @patch('routes.threat_designer_route.delete_tm')
    @patch('routes.threat_designer_route.router')
    def test_delete_deletes_threat_model(
        self, mock_router, mock_delete_tm
    ):
        """Test _delete deletes threat model."""
        mock_router.current_event.path = '/threat-designer/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.query_string_parameters = None
        mock_delete_tm.return_value = {'success': True}

        from routes.threat_designer_route import _delete
        result = _delete('test-job-123')

        assert result['success'] is True
        mock_delete_tm.assert_called_once_with('test-job-123', 'user-123', False)

    @patch('routes.threat_designer_route.delete_tm')
    @patch('routes.threat_designer_route.router')
    def test_delete_with_force_release_flag(
        self, mock_router, mock_delete_tm
    ):
        """Test _delete with force_release query parameter."""
        mock_router.current_event.path = '/threat-designer/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.query_string_parameters = {'force_release': 'true'}
        mock_delete_tm.return_value = {'success': True}

        from routes.threat_designer_route import _delete
        _delete('test-job-123')

        mock_delete_tm.assert_called_once_with('test-job-123', 'user-123', True)

    @patch('routes.threat_designer_route.delete_session')
    @patch('routes.threat_designer_route.router')
    def test_delete_session_stops_execution(
        self, mock_router, mock_delete_session
    ):
        """Test _delete_session stops execution."""
        mock_router.current_event.path = '/threat-designer/test-job-123/session/session-456'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_delete_session.return_value = {'success': True}

        from routes.threat_designer_route import _delete_session
        result = _delete_session('test-job-123', 'session-456')

        assert result['success'] is True

    @patch('routes.threat_designer_route.release_lock')
    @patch('routes.threat_designer_route.router')
    def test_release_lock_releases_lock(
        self, mock_router, mock_release_lock
    ):
        """Test _release_lock releases lock."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {'lock_token': 'token-123'}
        mock_release_lock.return_value = {'success': True}

        from routes.threat_designer_route import _release_lock
        result = _release_lock('test-job-123')

        assert result['success'] is True

    @patch('routes.threat_designer_route.remove_collaborator')
    @patch('routes.threat_designer_route.router')
    def test_remove_collaborator_removes_collaborator(
        self, mock_router, mock_remove_collaborator
    ):
        """Test _remove_collaborator removes collaborator."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_remove_collaborator.return_value = {'success': True}

        from routes.threat_designer_route import _remove_collaborator
        result = _remove_collaborator('test-job-123', 'user-456')

        assert result['success'] is True

    @patch('routes.threat_designer_route.force_release_lock')
    @patch('routes.threat_designer_route.router')
    def test_force_release_lock_force_releases_lock(
        self, mock_router, mock_force_release_lock
    ):
        """Test _force_release_lock force releases lock."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_force_release_lock.return_value = {'success': True}

        from routes.threat_designer_route import _force_release_lock
        result = _force_release_lock('test-job-123')

        assert result['success'] is True


# ============================================================================
# Error Handling Tests
# ============================================================================

class TestErrorHandling:
    """Tests for error handling in route handlers."""

    @patch('routes.threat_designer_route.share_threat_model')
    @patch('routes.threat_designer_route.router')
    def test_returns_400_for_missing_required_fields(
        self, mock_router, mock_share_threat_model
    ):
        """Test route returns 400 for missing required fields."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {}
        mock_share_threat_model.side_effect = BadRequestError('Missing required field')

        from routes.threat_designer_route import _share_threat_model
        with pytest.raises(BadRequestError):
            _share_threat_model('test-job-123')

    @patch('routes.threat_designer_route.fetch_results')
    @patch('routes.threat_designer_route.router')
    def test_returns_403_for_unauthorized_access(
        self, mock_router, mock_fetch_results
    ):
        """Test route returns 403 for unauthorized access."""
        mock_router.current_event.path = '/threat-designer/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-456'}
        mock_fetch_results.side_effect = UnauthorizedError('No access')

        from routes.threat_designer_route import _tm_fetch_results
        with pytest.raises(UnauthorizedError):
            _tm_fetch_results('test-job-123')

    @patch('routes.threat_designer_route.fetch_results')
    @patch('routes.threat_designer_route.router')
    def test_returns_404_for_not_found_resources(
        self, mock_router, mock_fetch_results
    ):
        """Test route returns 404 for not found resources."""
        mock_router.current_event.path = '/threat-designer/nonexistent-job'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_fetch_results.side_effect = NotFoundError('Not found')

        from routes.threat_designer_route import _tm_fetch_results
        with pytest.raises(NotFoundError):
            _tm_fetch_results('nonexistent-job')

    @patch('routes.threat_designer_route.update_results')
    @patch('routes.threat_designer_route.router')
    def test_returns_409_for_conflicts(
        self, mock_router, mock_update_results
    ):
        """Test route returns 409 for conflicts."""
        mock_router.current_event.path = '/threat-designer/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {'description': 'Updated', 'lock_token': 'token-123'}
        mock_update_results.side_effect = ConflictError('Version conflict')

        from routes.threat_designer_route import _update_results
        with pytest.raises(ConflictError):
            _update_results('test-job-123')

    @patch('routes.threat_designer_route.check_status')
    @patch('utils.authorization.require_access')
    @patch('routes.threat_designer_route.router')
    def test_returns_500_for_internal_errors(
        self, mock_router, mock_require_access, mock_check_status
    ):
        """Test route returns 500 for internal errors."""
        mock_router.current_event.path = '/threat-designer/status/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_check_status.side_effect = InternalError('Service error')

        from routes.threat_designer_route import _tm_status
        with pytest.raises(InternalError):
            _tm_status('test-job-123')

    @patch('routes.threat_designer_route.invoke_lambda')
    @patch('routes.threat_designer_route.router')
    @patch('routes.threat_designer_route.LOG')
    def test_logs_exceptions_in_route_handlers(
        self, mock_log, mock_router, mock_invoke_lambda
    ):
        """Test that exceptions are logged in route handlers."""
        mock_router.current_event.path = '/threat-designer'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {'description': 'Test'}
        test_exception = Exception('Test error')
        mock_invoke_lambda.side_effect = test_exception

        from routes.threat_designer_route import tm_start
        tm_start()

        mock_log.exception.assert_called_once_with(test_exception)

    @patch('utils.authorization.require_access')
    @patch('routes.threat_designer_route.check_status')
    @patch('routes.threat_designer_route.router')
    def test_authorization_check_before_service_call(
        self, mock_router, mock_check_status, mock_require_access
    ):
        """Test that authorization is checked before service calls."""
        mock_router.current_event.path = '/threat-designer/status/test-job-123'
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-456'}
        mock_require_access.side_effect = UnauthorizedError('No access')

        from routes.threat_designer_route import _tm_status
        with pytest.raises(UnauthorizedError):
            _tm_status('test-job-123')

        mock_check_status.assert_not_called()

    @patch('routes.threat_designer_route.update_collaborator_access')
    @patch('routes.threat_designer_route.router')
    def test_handles_invalid_json_body(
        self, mock_router, mock_update_collaborator_access
    ):
        """Test route handles invalid JSON body gracefully."""
        mock_router.current_event.request_context.authorizer = {'user_id': 'user-123'}
        mock_router.current_event.json_body = {'access_level': 'READ_ONLY'}
        mock_update_collaborator_access.side_effect = BadRequestError('Invalid request')

        from routes.threat_designer_route import _update_collaborator_access
        with pytest.raises(BadRequestError):
            _update_collaborator_access('test-job-123', 'user-456')
