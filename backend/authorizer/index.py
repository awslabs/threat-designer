import os
import time

import jwt
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from jwt import PyJWKClient

logger = Logger()


def generate_policy(
    principal_id: str, effect: str, resource: str, context: dict = None
):
    policy = {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {"Action": "execute-api:Invoke", "Effect": effect, "Resource": resource}
            ],
        },
    }
    if context:
        policy["context"] = context
    return policy


@logger.inject_lambda_context
def lambda_handler(event: dict, context: LambdaContext):
    # Extract token from Authorization header
    token = event.get("authorizationToken").replace("Bearer ", "")

    # Cognito user pool configuration
    region = os.environ.get("COGNITO_REGION")
    user_pool_id = os.environ.get("COGNITO_USER_POOL_ID")
    app_client_id = os.environ.get("COGNITO_APP_CLIENT_ID")

    # Get JWT keys from Cognito
    keys_url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
    jwks_client = PyJWKClient(keys_url)

    try:
        # Verify and decode the token
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token, signing_key.key, algorithms=["RS256"], audience=app_client_id
        )

        # Check token expiration
        if time.time() > claims["exp"]:
            logger.warning("Token expired", extra={"token_exp": claims["exp"]})
            return generate_policy(
                claims["sub"], "Deny", event["methodArn"], {"error": "Token expired"}
            )

        # Extract user information
        # sub is the unique UUID for the user (use this as user_id)
        user_id = claims["sub"]
        # cognito:username is the human-readable username (use for display)
        username = claims.get("cognito:username", claims.get("username", user_id))
        email = claims.get("email", "")

        logger.info(
            "Token validated successfully",
            extra={"user_id": user_id, "username": username},
        )
        return generate_policy(
            user_id,  # Use sub as principal ID
            "Allow",
            event["methodArn"],
            {
                "user_id": user_id,  # UUID for backend operations
                "username": username,  # Human-readable name for display
                "email": email,
            },
        )

    except Exception as e:
        logger.error("Token validation failed", extra={"error": str(e)})
        return generate_policy(
            "unauthorized", "Deny", event["methodArn"], {"error": str(e)}
        )
