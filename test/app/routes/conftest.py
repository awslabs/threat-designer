"""
Pytest configuration and fixtures for route tests.

This module provides autouse fixtures that mock service functions
before the route modules are imported, ensuring proper test isolation.
"""

import sys
import os
from pathlib import Path
from unittest.mock import Mock, MagicMock
import pytest

# Add backend/app to path for imports
backend_path = str(Path(__file__).parent.parent.parent.parent / 'backend' / 'app')
sys.path.insert(0, backend_path)

# Mock AWS X-Ray before importing services
sys.modules['aws_xray_sdk'] = MagicMock()
sys.modules['aws_xray_sdk.core'] = MagicMock()

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


@pytest.fixture(scope='session', autouse=True)
def mock_boto3_session():
    """Mock boto3 at session level before any imports."""
    import boto3
    from unittest.mock import patch
    
    with patch('boto3.resource') as mock_resource, \
         patch('boto3.client') as mock_client:
        
        # Mock DynamoDB resource
        mock_dynamodb = Mock()
        mock_table = Mock()
        mock_table.get_item.return_value = {'Item': {}}
        mock_table.put_item.return_value = {'ResponseMetadata': {'HTTPStatusCode': 200}}
        mock_table.update_item.return_value = {'ResponseMetadata': {'HTTPStatusCode': 200}}
        mock_table.delete_item.return_value = {'ResponseMetadata': {'HTTPStatusCode': 200}}
        mock_table.query.return_value = {'Items': [], 'Count': 0}
        mock_table.scan.return_value = {'Items': [], 'Count': 0}
        mock_dynamodb.Table.return_value = mock_table
        
        # Mock S3 client
        mock_s3 = Mock()
        mock_s3.generate_presigned_url.return_value = 'https://s3.example.com/presigned'
        mock_s3.put_object.return_value = {'ResponseMetadata': {'HTTPStatusCode': 200}}
        mock_s3.delete_object.return_value = {'ResponseMetadata': {'HTTPStatusCode': 204}}
        
        # Mock Lambda client
        mock_lambda = Mock()
        mock_lambda.invoke.return_value = {
            'StatusCode': 202,
            'Payload': Mock(read=Mock(return_value=b'{"status": "success"}'))
        }
        
        # Mock Cognito client
        mock_cognito = Mock()
        mock_cognito.list_users.return_value = {'Users': [], 'ResponseMetadata': {'HTTPStatusCode': 200}}
        
        # Mock Bedrock client
        mock_bedrock = Mock()
        mock_bedrock.invoke_agent.return_value = {
            'ResponseMetadata': {'HTTPStatusCode': 200},
            'sessionId': 'test-session-id'
        }
        
        def resource_side_effect(service_name, **kwargs):
            if service_name == 'dynamodb':
                return mock_dynamodb
            return Mock()
        
        def client_side_effect(service_name, **kwargs):
            if service_name == 's3':
                return mock_s3
            elif service_name == 'lambda':
                return mock_lambda
            elif service_name == 'cognito-idp':
                return mock_cognito
            elif service_name == 'bedrock-agent-runtime':
                return mock_bedrock
            return Mock()
        
        mock_resource.side_effect = resource_side_effect
        mock_client.side_effect = client_side_effect
        
        yield {
            'dynamodb': mock_dynamodb,
            'table': mock_table,
            's3': mock_s3,
            'lambda': mock_lambda,
            'cognito': mock_cognito,
            'bedrock': mock_bedrock
        }
