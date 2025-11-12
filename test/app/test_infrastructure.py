"""
Infrastructure validation tests.

This module validates that the test infrastructure is set up correctly:
- Fixtures are accessible
- Mock objects work as expected
- Test data structures are valid
"""

import pytest


class TestFixtureAvailability:
    """Validate that all fixtures are accessible and functional."""
    
    def test_mock_dynamodb_resource_fixture(self, mock_dynamodb_resource):
        """Test that mock_dynamodb_resource fixture is available."""
        assert mock_dynamodb_resource is not None
    
    def test_mock_dynamodb_table_fixture(self, mock_dynamodb_table):
        """Test that mock_dynamodb_table fixture is available."""
        assert mock_dynamodb_table is not None
        assert hasattr(mock_dynamodb_table, 'get_item')
        assert hasattr(mock_dynamodb_table, 'put_item')
    
    def test_mock_s3_client_fixture(self, mock_s3_client):
        """Test that mock_s3_client fixture is available."""
        assert mock_s3_client is not None
        assert hasattr(mock_s3_client, 'delete_object')
    
    def test_mock_lambda_client_fixture(self, mock_lambda_client):
        """Test that mock_lambda_client fixture is available."""
        assert mock_lambda_client is not None
        assert hasattr(mock_lambda_client, 'invoke')
    
    def test_mock_cognito_client_fixture(self, mock_cognito_client):
        """Test that mock_cognito_client fixture is available."""
        assert mock_cognito_client is not None
        assert hasattr(mock_cognito_client, 'list_users')
    
    def test_mock_bedrock_client_fixture(self, mock_bedrock_client):
        """Test that mock_bedrock_client fixture is available."""
        assert mock_bedrock_client is not None
        assert hasattr(mock_bedrock_client, 'invoke_agent')
    
    def test_mock_environment_fixture(self, mock_environment):
        """Test that mock_environment fixture is available."""
        assert mock_environment is not None
        assert 'JOB_STATUS_TABLE' in mock_environment
        assert 'AGENT_STATE_TABLE' in mock_environment
        assert 'LOCKS_TABLE' in mock_environment
        assert 'SHARING_TABLE' in mock_environment
    
    def test_sample_threat_model_fixture(self, sample_threat_model):
        """Test that sample_threat_model fixture is available."""
        assert sample_threat_model is not None
        assert 'job_id' in sample_threat_model
        assert 'owner' in sample_threat_model
        assert sample_threat_model['job_id'] == 'test-job-123'
    
    def test_sample_user_fixture(self, sample_user):
        """Test that sample_user fixture is available."""
        assert sample_user is not None
        assert 'user_id' in sample_user
        assert 'username' in sample_user
        assert sample_user['user_id'] == 'user-123'
    
    def test_sample_lock_fixture(self, sample_lock):
        """Test that sample_lock fixture is available."""
        assert sample_lock is not None
        assert 'threat_model_id' in sample_lock
        assert 'lock_token' in sample_lock
    
    def test_sample_sharing_record_fixture(self, sample_sharing_record):
        """Test that sample_sharing_record fixture is available."""
        assert sample_sharing_record is not None
        assert 'threat_model_id' in sample_sharing_record
        assert 'access_level' in sample_sharing_record
    
    def test_mock_time_fixture(self, mock_time):
        """Test that mock_time fixture is available."""
        assert mock_time is not None
        assert isinstance(mock_time, float)
        assert mock_time == 1704067200.0
    
    def test_mock_lambda_context_fixture(self, mock_lambda_context):
        """Test that mock_lambda_context fixture is available."""
        assert mock_lambda_context is not None
        assert hasattr(mock_lambda_context, 'function_name')
        assert mock_lambda_context.function_name == 'test-function'


class TestMockBehavior:
    """Validate that mock objects behave as expected."""
    
    def test_dynamodb_table_get_item(self, mock_dynamodb_table):
        """Test that mock DynamoDB table get_item returns expected structure."""
        result = mock_dynamodb_table.get_item(Key={'job_id': 'test'})
        assert 'Item' in result
    
    def test_dynamodb_table_put_item(self, mock_dynamodb_table):
        """Test that mock DynamoDB table put_item returns success."""
        result = mock_dynamodb_table.put_item(Item={'job_id': 'test'})
        assert result['ResponseMetadata']['HTTPStatusCode'] == 200
    
    def test_s3_client_delete_object(self, mock_s3_client):
        """Test that mock S3 client delete_object returns success."""
        result = mock_s3_client.delete_object(Bucket='test', Key='test-key')
        assert result['ResponseMetadata']['HTTPStatusCode'] == 204
    
    def test_lambda_client_invoke(self, mock_lambda_client):
        """Test that mock Lambda client invoke returns success."""
        result = mock_lambda_client.invoke(
            FunctionName='test-function',
            InvocationType='Event'
        )
        assert result['StatusCode'] == 202
    
    def test_cognito_client_list_users(self, mock_cognito_client):
        """Test that mock Cognito client list_users returns expected structure."""
        result = mock_cognito_client.list_users(UserPoolId='test-pool')
        assert 'Users' in result
        assert isinstance(result['Users'], list)


class TestDataStructures:
    """Validate that test data structures are properly formatted."""
    
    def test_threat_model_has_required_fields(self, sample_threat_model):
        """Test that sample threat model has all required fields."""
        required_fields = [
            'job_id', 'owner', 'title', 's3_location', 'description',
            'assumptions', 'threat_list', 'assets', 'system_architecture',
            'last_modified_at', 'last_modified_by', 'content_hash'
        ]
        for field in required_fields:
            assert field in sample_threat_model, f"Missing field: {field}"
    
    def test_lock_has_required_fields(self, sample_lock):
        """Test that sample lock has all required fields."""
        required_fields = [
            'threat_model_id', 'user_id', 'lock_token',
            'lock_timestamp', 'acquired_at', 'ttl'
        ]
        for field in required_fields:
            assert field in sample_lock, f"Missing field: {field}"
    
    def test_sharing_record_has_required_fields(self, sample_sharing_record):
        """Test that sample sharing record has all required fields."""
        required_fields = [
            'threat_model_id', 'user_id', 'access_level',
            'shared_by', 'shared_at', 'owner'
        ]
        for field in required_fields:
            assert field in sample_sharing_record, f"Missing field: {field}"
    
    def test_cognito_user_structure(self, sample_cognito_user):
        """Test that sample Cognito user has correct structure."""
        assert 'Username' in sample_cognito_user
        assert 'Attributes' in sample_cognito_user
        assert isinstance(sample_cognito_user['Attributes'], list)
        
        # Check for required attributes
        attr_names = [attr['Name'] for attr in sample_cognito_user['Attributes']]
        assert 'sub' in attr_names
        assert 'email' in attr_names
