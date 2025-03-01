from aws_lambda_powertools import Tracer, Logger
import json
from datetime import datetime
from aws_lambda_powertools.event_handler.api_gateway import Router
from exceptions.exceptions import UnauthorizedError
from enum import Enum
from json import JSONEncoder
import json
from datetime import datetime, date

tracer = Tracer()
logger = Logger()


sensitive_attributes = [
    "email",
    "username",
    "firstName",
    "lastName",
    "businessAddress",
    "address",
]


class CustomEncoder(JSONEncoder):
    """Custom encoder for objects not serializable by default json code"""

    def default(self, obj):
        if isinstance(obj, Enum):
            return obj.value
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, type(None)):
            return ""
        try:
            iterable = iter(obj)
        except TypeError:
            pass
        else:
            return sorted(iterable)
        return JSONEncoder.default(self, obj)


def custom_serializer(obj) -> str:
    """Custom serializer function ApiGatewayResolver can use"""
    return json.dumps(obj, cls=CustomEncoder)


def mask_sensitive_attributes(payload: dict):
    """Redacts the values in dict based on sensitive key names configured."""
    for k, v in payload.items():
        if isinstance(v, dict):
            mask_sensitive_attributes(v)
        if k in sensitive_attributes:
            payload[k] = "[REDACTED]"


class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


def validate_user(router: Router):
    """
    Decorator to validate the API call against the owner in request body.
    :param router: Router to get current event
    :return: Throws an error or forwards the call to service
    """

    def decorator(func):
        def wrapper(*args, **kwargs):
            body = router.current_event.json_body
            owner = body.get("owner", None)
            user_id = router.current_event.request_context.authorizer.get(
                "username", ""
            )
            email = router.current_event.request_context.authorizer.get("email", "")

            logger.info(f"Owner from body: {owner}")
            logger.info(f"Authenticated user: {user_id}")

            if user_id == owner:
                return func(*args, **kwargs)
            else:
                logger.error("Owner does not match the authenticated user")
                raise UnauthorizedError(
                    f"User: {email} is not authorized to access this resource."
                )

        return wrapper

    return decorator
