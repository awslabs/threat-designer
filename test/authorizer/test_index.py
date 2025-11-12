"""
Unit tests for the backend authorizer Lambda function.

This test module validates the authorizer's ability to:
- Generate correct IAM policy documents
- Validate JWT tokens from AWS Cognito
- Handle expired tokens
- Handle invalid tokens
- Extract user information from token claims
"""

import sys
import os
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'backend'))

import pytest
from unittest.mock import Mock, patch, MagicMock
import time
import jwt
from aws_lambda_powertools.utilities.typing import LambdaContext
from authorizer.index import generate_policy, lambda_handler


class TestGeneratePolicy:
    """Tests for the generate_policy function"""
    
    def test_generate_policy_with_allow_effect(self):
        """Test that generate_policy creates correct policy structure with Allow effect"""
        # Arrange
        principal_id = "user-123"
        effect = "Allow"
        resource = "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        
        # Act
        policy = generate_policy(principal_id, effect, resource)
        
        # Assert - Verify principalId
        assert policy["principalId"] == principal_id
        
        # Assert - Verify policyDocument structure and version
        assert "policyDocument" in policy
        assert policy["policyDocument"]["Version"] == "2012-10-17"
        
        # Assert - Verify Statement fields
        assert "Statement" in policy["policyDocument"]
        assert len(policy["policyDocument"]["Statement"]) == 1
        
        statement = policy["policyDocument"]["Statement"][0]
        assert statement["Action"] == "execute-api:Invoke"
        assert statement["Effect"] == "Allow"
        assert statement["Resource"] == resource
    
    def test_generate_policy_with_deny_effect(self):
        """Test that generate_policy creates correct policy with Deny effect"""
        # Arrange
        principal_id = "unauthorized"
        effect = "Deny"
        resource = "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        
        # Act
        policy = generate_policy(principal_id, effect, resource)
        
        # Assert - Verify Effect field is "Deny"
        statement = policy["policyDocument"]["Statement"][0]
        assert statement["Effect"] == "Deny"
    
    def test_generate_policy_with_context(self):
        """Test that generate_policy includes context field when provided"""
        # Arrange
        principal_id = "user-123"
        effect = "Allow"
        resource = "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        context = {
            "user_id": "user-uuid-123",
            "username": "testuser",
            "email": "test@example.com"
        }
        
        # Act
        policy = generate_policy(principal_id, effect, resource, context)
        
        # Assert - Verify context field is present with correct data
        assert "context" in policy
        assert policy["context"] == context
        assert policy["context"]["user_id"] == "user-uuid-123"
        assert policy["context"]["username"] == "testuser"
        assert policy["context"]["email"] == "test@example.com"
    
    def test_generate_policy_without_context(self):
        """Test that generate_policy does not include context field when not provided"""
        # Arrange
        principal_id = "user-123"
        effect = "Allow"
        resource = "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        
        # Act
        policy = generate_policy(principal_id, effect, resource)
        
        # Assert - Verify context field is not present
        assert "context" not in policy


class TestLambdaHandlerValidToken:
    """Tests for lambda_handler with valid tokens"""

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.time.time')
    def test_valid_token_with_all_claims(self, mock_time, mock_decode, mock_jwks_client_class):
        """Test that valid token with all claims returns Allow policy"""
        # Arrange
        current_time = 1609459200  # 2021-01-01 00:00:00
        future_time = current_time + 3600  # 1 hour in the future

        mock_time.return_value = current_time

        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock JWT decode to return valid claims
        mock_decode.return_value = {
            "sub": "user-uuid-123",
            "cognito:username": "testuser",
            "email": "test@example.com",
            "exp": future_time,
            "aud": "test-client-id"
        }

        event = {
            "authorizationToken": "Bearer test-jwt-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify Allow policy is returned
        assert policy["policyDocument"]["Statement"][0]["Effect"] == "Allow"

        # Assert - Verify principalId matches token sub claim
        assert policy["principalId"] == "user-uuid-123"

        # Assert - Verify context contains user_id, username, and email
        assert "context" in policy
        assert policy["context"]["user_id"] == "user-uuid-123"
        assert policy["context"]["username"] == "testuser"
        assert policy["context"]["email"] == "test@example.com"

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.time.time')
    def test_valid_token_without_email_claim(self, mock_time, mock_decode, mock_jwks_client_class):
        """Test that valid token without email claim returns empty string for email"""
        # Arrange
        current_time = 1609459200
        future_time = current_time + 3600

        mock_time.return_value = current_time

        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock JWT decode to return claims without email
        mock_decode.return_value = {
            "sub": "user-uuid-456",
            "cognito:username": "testuser2",
            "exp": future_time,
            "aud": "test-client-id"
        }

        event = {
            "authorizationToken": "Bearer test-jwt-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify email field is empty string
        assert policy["context"]["email"] == ""

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.time.time')
    def test_valid_token_with_username_fallback(self, mock_time, mock_decode, mock_jwks_client_class):
        """Test that valid token uses username claim when cognito:username is not present"""
        # Arrange
        current_time = 1609459200
        future_time = current_time + 3600

        mock_time.return_value = current_time

        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock JWT decode to return username instead of cognito:username
        mock_decode.return_value = {
            "sub": "user-uuid-789",
            "username": "fallbackuser",
            "email": "fallback@example.com",
            "exp": future_time,
            "aud": "test-client-id"
        }

        event = {
            "authorizationToken": "Bearer test-jwt-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify username field uses the username claim value
        assert policy["context"]["username"] == "fallbackuser"

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.time.time')
    def test_bearer_token_extraction(self, mock_time, mock_decode, mock_jwks_client_class):
        """Test that Bearer token is correctly extracted without Bearer prefix"""
        # Arrange
        current_time = 1609459200
        future_time = current_time + 3600

        mock_time.return_value = current_time

        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock JWT decode to return valid claims
        mock_decode.return_value = {
            "sub": "user-uuid-999",
            "cognito:username": "bearertest",
            "email": "bearer@example.com",
            "exp": future_time,
            "aud": "test-client-id"
        }

        # Create event with "Bearer <token>" format
        test_token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature"
        event = {
            "authorizationToken": f"Bearer {test_token}",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify token is correctly extracted without Bearer prefix
        # The get_signing_key_from_jwt should be called with the token without "Bearer "
        mock_client.get_signing_key_from_jwt.assert_called_once_with(test_token)

        # Assert - Verify jwt.decode is called with the token without "Bearer "
        assert mock_decode.call_args[0][0] == test_token

        # Assert - Verify policy includes correct resource ARN from methodArn
        assert policy["policyDocument"]["Statement"][0]["Resource"] == event["methodArn"]


class TestLambdaHandlerExpiredToken:
    """Tests for lambda_handler with expired tokens"""

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.time.time')
    def test_expired_token_returns_deny_policy(self, mock_time, mock_decode, mock_jwks_client_class):
        """Test that expired token returns Deny policy"""
        # Arrange
        current_time = 1609459200  # 2021-01-01 00:00:00
        past_time = current_time - 3600  # 1 hour in the past

        mock_time.return_value = current_time

        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock JWT decode to return expired claims
        mock_decode.return_value = {
            "sub": "user-uuid-expired",
            "cognito:username": "expireduser",
            "email": "expired@example.com",
            "exp": past_time,
            "aud": "test-client-id"
        }

        event = {
            "authorizationToken": "Bearer expired-jwt-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify Deny policy is returned
        assert policy["policyDocument"]["Statement"][0]["Effect"] == "Deny"

        # Assert - Verify principalId matches token sub claim
        assert policy["principalId"] == "user-uuid-expired"

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.time.time')
    def test_expired_token_error_context(self, mock_time, mock_decode, mock_jwks_client_class):
        """Test that expired token includes error message in context"""
        # Arrange
        current_time = 1609459200
        past_time = current_time - 3600

        mock_time.return_value = current_time

        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock JWT decode to return expired claims
        mock_decode.return_value = {
            "sub": "user-uuid-expired2",
            "cognito:username": "expireduser2",
            "exp": past_time,
            "aud": "test-client-id"
        }

        event = {
            "authorizationToken": "Bearer expired-jwt-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify context contains error field with "Token expired"
        assert "context" in policy
        assert "error" in policy["context"]
        assert policy["context"]["error"] == "Token expired"

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.time.time')
    @patch('authorizer.index.logger')
    def test_expired_token_logging(self, mock_logger, mock_time, mock_decode, mock_jwks_client_class):
        """Test that expired token triggers warning log"""
        # Arrange
        current_time = 1609459200
        past_time = current_time - 3600

        mock_time.return_value = current_time

        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock JWT decode to return expired claims
        mock_decode.return_value = {
            "sub": "user-uuid-expired3",
            "cognito:username": "expireduser3",
            "exp": past_time,
            "aud": "test-client-id"
        }

        event = {
            "authorizationToken": "Bearer expired-jwt-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        lambda_handler(event, context)

        # Assert - Verify logger.warning is called with expiration message
        mock_logger.warning.assert_called_once()
        call_args = mock_logger.warning.call_args
        assert "Token expired" in call_args[0][0]


class TestLambdaHandlerInvalidToken:
    """Tests for lambda_handler with invalid tokens"""

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.logger')
    def test_invalid_signature_returns_deny_policy(self, mock_logger, mock_decode, mock_jwks_client_class):
        """Test that token with invalid signature returns Deny policy"""
        # Arrange
        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock jwt.decode to raise InvalidSignatureError
        mock_decode.side_effect = jwt.InvalidSignatureError("Signature verification failed")

        event = {
            "authorizationToken": "Bearer invalid-signature-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify Deny policy is returned
        assert policy["policyDocument"]["Statement"][0]["Effect"] == "Deny"

        # Assert - Verify principalId is "unauthorized"
        assert policy["principalId"] == "unauthorized"

        # Assert - Verify context contains error message
        assert "context" in policy
        assert "error" in policy["context"]
        assert "Signature verification failed" in policy["context"]["error"]

        # Assert - Verify logger.error is called
        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        assert "Token validation failed" in call_args[0][0]

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.logger')
    def test_malformed_token_returns_deny_policy(self, mock_logger, mock_decode, mock_jwks_client_class):
        """Test that malformed token returns Deny policy"""
        # Arrange
        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock jwt.decode to raise DecodeError
        mock_decode.side_effect = jwt.DecodeError("Not enough segments")

        event = {
            "authorizationToken": "Bearer malformed-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify Deny policy is returned
        assert policy["policyDocument"]["Statement"][0]["Effect"] == "Deny"

        # Assert - Verify principalId is "unauthorized"
        assert policy["principalId"] == "unauthorized"

        # Assert - Verify context contains error message
        assert "context" in policy
        assert "error" in policy["context"]
        assert "Not enough segments" in policy["context"]["error"]

        # Assert - Verify logger.error is called
        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        assert "Token validation failed" in call_args[0][0]

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.logger')
    def test_wrong_audience_returns_deny_policy(self, mock_logger, mock_decode, mock_jwks_client_class):
        """Test that token with wrong audience returns Deny policy"""
        # Arrange
        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock jwt.decode to raise InvalidAudienceError
        mock_decode.side_effect = jwt.InvalidAudienceError("Invalid audience")

        event = {
            "authorizationToken": "Bearer wrong-audience-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify Deny policy is returned
        assert policy["policyDocument"]["Statement"][0]["Effect"] == "Deny"

        # Assert - Verify context contains error message
        assert "context" in policy
        assert "error" in policy["context"]
        assert "Invalid audience" in policy["context"]["error"]

        # Assert - Verify logger.error is called
        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        assert "Token validation failed" in call_args[0][0]

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-east-1',
        'COGNITO_USER_POOL_ID': 'us-east-1_TestPool',
        'COGNITO_APP_CLIENT_ID': 'test-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.logger')
    def test_invalid_token_logging_contains_exception_details(self, mock_logger, mock_decode, mock_jwks_client_class):
        """Test that invalid token logging includes exception details"""
        # Arrange
        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock jwt.decode to raise an exception with specific details
        exception_message = "Token validation error: invalid format"
        mock_decode.side_effect = jwt.DecodeError(exception_message)

        event = {
            "authorizationToken": "Bearer test-token",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        lambda_handler(event, context)

        # Assert - Verify logger.error is called
        mock_logger.error.assert_called_once()

        # Assert - Verify error message contains exception details
        call_args = mock_logger.error.call_args
        assert "Token validation failed" in call_args[0][0]

        # Verify the extra parameter contains the error details
        extra_param = call_args[1].get('extra', {})
        assert 'error' in extra_param
        assert exception_message in extra_param['error']


class TestEnvironmentConfiguration:
    """Tests for environment configuration"""

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'us-west-2',
        'COGNITO_USER_POOL_ID': 'us-west-2_TestPool123',
        'COGNITO_APP_CLIENT_ID': 'test-app-client-id-456'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.time.time')
    def test_jwks_url_construction(self, mock_time, mock_decode, mock_jwks_client_class):
        """Test that JWKS URL is correctly constructed with region and pool ID"""
        # Arrange
        current_time = 1609459200
        future_time = current_time + 3600

        mock_time.return_value = current_time

        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock JWT decode to return valid claims
        mock_decode.return_value = {
            "sub": "user-uuid-config-test",
            "cognito:username": "configuser",
            "email": "config@example.com",
            "exp": future_time,
            "aud": "test-app-client-id-456"
        }

        event = {
            "authorizationToken": "Bearer test-jwt-token",
            "methodArn": "arn:aws:execute-api:us-west-2:123456789012:api-id/stage/GET/resource"
        }
        context = Mock()

        # Act
        lambda_handler(event, context)

        # Assert - Verify PyJWKClient was initialized with correct JWKS URL
        expected_jwks_url = "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_TestPool123/.well-known/jwks.json"
        mock_jwks_client_class.assert_called_once_with(expected_jwks_url)

    @patch.dict(os.environ, {
        'COGNITO_REGION': 'eu-central-1',
        'COGNITO_USER_POOL_ID': 'eu-central-1_AnotherPool',
        'COGNITO_APP_CLIENT_ID': 'another-client-id'
    })
    @patch('authorizer.index.PyJWKClient')
    @patch('authorizer.index.jwt.decode')
    @patch('authorizer.index.time.time')
    def test_methodarn_in_policy(self, mock_time, mock_decode, mock_jwks_client_class):
        """Test that generated policy Resource field matches methodArn"""
        # Arrange
        current_time = 1609459200
        future_time = current_time + 3600

        mock_time.return_value = current_time

        # Mock JWKS client
        mock_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_client

        # Mock JWT decode to return valid claims
        mock_decode.return_value = {
            "sub": "user-uuid-methodarn-test",
            "cognito:username": "methodarnuser",
            "email": "methodarn@example.com",
            "exp": future_time,
            "aud": "another-client-id"
        }

        # Create event with specific methodArn
        specific_method_arn = "arn:aws:execute-api:eu-central-1:987654321098:api-xyz/prod/POST/users/*/profile"
        event = {
            "authorizationToken": "Bearer test-jwt-token",
            "methodArn": specific_method_arn
        }
        context = Mock()

        # Act
        policy = lambda_handler(event, context)

        # Assert - Verify generated policy Resource field matches methodArn
        assert policy["policyDocument"]["Statement"][0]["Resource"] == specific_method_arn
