from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext
from utils.utils import custom_serializer
from routes import threat_designer_route
from exceptions.exceptions import ViewError, InternalError, BadRequestError
import os
from typing import Dict, Any
import json
import copy
from aws_lambda_powertools.event_handler import (
    Response,
    content_types,
)

from utils.utils import mask_sensitive_attributes

PORTAL_REDIRECT_URL = os.getenv(key="PORTAL_REDIRECT_URL")
TRUSTED_ORIGINS = os.getenv(key="TRUSTED_ORIGINS")


logger = Logger(serialize_stacktrace=False)
tracer = Tracer()


# Using default CORS configs
cors_config = CORSConfig(
    max_age=100,
    allow_credentials=True,
    allow_origin=os.environ["PORTAL_REDIRECT_URL"],
    allow_headers=["Content-Type"],
)

trusted_origins = os.environ["TRUSTED_ORIGINS"].split(",")

app = APIGatewayRestResolver(serializer=custom_serializer, cors=cors_config)
app.include_router(threat_designer_route.router)


@app.route(method="OPTIONS", rule=".*")
# Matches any pre-flight request coming from API Gateway
def preflight_handler():
    """Handles multi-origin preflight requests"""
    origin = app.current_event.get_header_value(name="Origin", default_value="")
    if origin in trusted_origins:
        app._cors.allow_origin = origin
        app._cors.allow_credentials = True


def add_security_headers(response: Dict[str, Any]):
    headers = response.get("multiValueHeaders")
    headers["Strict-Transport-Security"] = ["max-age=63072000;"]
    headers["Content-Security-Policy"] = ["default-src 'self'"]
    headers["X-Content-Type-Options"] = ["nosniff"]
    headers["X-Frame-Options"] = ["DENY"]
    origin = app.current_event.get_header_value(name="Origin", default_value="")
    headers["Access-Control-Allow-Origin"] = [origin]
    if origin in trusted_origins:
        headers["Access-Control-Allow-Origin"] = [origin]
        headers["Access-Control-Allow-Credentials"] = ["true"]
    if app.current_event.http_method == "OPTIONS":
        headers["Access-Control-Allow-Methods"] = [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS",
        ]
        headers["Access-Control-Allow-Headers"] = ["Content-Type"]
        headers["Access-Control-Allow-Credentials"] = ["true"]
    logger.info(f"Adding security headers: {response}")
    return response


def log_event(event: dict):
    """Makes a copy of incoming event, removes sensitive headers and logs the event."""
    event_copy = copy.deepcopy(event)
    # Remove attributes which might potentially contain sensitive info
    if "headers" in event_copy:
        event_copy.pop("headers")
    if "multiValueHeaders" in event_copy:
        event_copy.pop("multiValueHeaders")
    if "requestContext" in event_copy:
        event_copy.pop("requestContext")
    if "body" in event_copy and event_copy["body"]:
        body = json.loads(event_copy["body"])
        if body:
            mask_sensitive_attributes(body)
            event_copy["body"] = body


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    log_event(event)
    return add_security_headers(app.resolve(event, context))


@app.exception_handler(Exception)
def handle_service_errors(ex: Exception):  # global catch all
    logger.error("Internal Server Error")
    error_dict = {"code": type(ex).__name__, "message": str(ex)}
    return build_error_response(error_dict, 500)


@app.exception_handler(InternalError)
def handle_service_errors(ex: InternalError):  # receives exception raised
    logger.error("Internal Server Error")
    error_dict = {"code": type(ex).__name__, "message": str(ex)}
    return build_error_response(error_dict, 500)


@app.exception_handler(ViewError)
def handle_service_errors(ex: ViewError):  # receives exception raised
    logger.warning("Application Errors")
    return build_error_response(ex.to_dict(), ex.STATUS)


@app.exception_handler(BadRequestError)
def handle_service_errors(ex: BadRequestError):  # receives exception raised
    logger.warning("Bad Request Error")
    error_dict = {"code": type(ex).__name__, "message": str(ex.msg)}
    return build_error_response(error_dict, 400)


def build_error_response(msg: Dict[str, str], status: int):
    return Response(
        status_code=status,
        content_type=content_types.APPLICATION_JSON,
        body=json.dumps(msg),
    )
