"""API routes for governance: management of system spaces (org-wide KBs).

Every route is gated by the governance Cognito group via @governance_only.
System spaces are queried for every threat model and cannot be mutated through
the standard owner-scoped /spaces API.
"""

import json

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import Response, content_types
from aws_lambda_powertools.event_handler.api_gateway import Router
from services.space_service import (
    confirm_system_document_upload,
    create_system_space,
    delete_system_document,
    delete_system_space,
    generate_system_document_upload_url,
    list_system_documents,
    list_system_spaces,
    update_system_space,
)
from utils.authorization import governance_only

tracer = Tracer()
router = Router()
LOG = logger = Logger(serialize_stacktrace=False)


def _user_id() -> str:
    return router.current_event.request_context.authorizer.get("user_id")


def _bad_request(message: str) -> Response:
    return Response(
        status_code=400,
        content_type=content_types.APPLICATION_JSON,
        body=json.dumps({"error": message}),
    )


@router.post("/governance/spaces")
@governance_only
def _create_system_space():
    body = router.current_event.json_body
    name = body.get("name", "").strip()
    if not name:
        return _bad_request("name is required")
    description = body.get("description", "")
    return create_system_space(_user_id(), name, description)


@router.get("/governance/spaces")
@governance_only
def _list_system_spaces():
    return {"spaces": list_system_spaces()}


@router.put("/governance/spaces/<space_id>")
@governance_only
def _update_system_space(space_id):
    body = router.current_event.json_body
    return update_system_space(
        space_id,
        name=body.get("name"),
        description=body.get("description"),
    )


@router.delete("/governance/spaces/<space_id>")
@governance_only
def _delete_system_space(space_id):
    delete_system_space(space_id)
    return {"message": "System space deleted"}


@router.post("/governance/spaces/<space_id>/documents/upload")
@governance_only
def _request_upload(space_id):
    body = router.current_event.json_body
    filename = body.get("filename", "").strip()
    file_type = body.get("file_type", "application/octet-stream")
    if not filename:
        return _bad_request("filename is required")
    return generate_system_document_upload_url(space_id, filename, file_type)


@router.post("/governance/spaces/<space_id>/documents/confirm")
@governance_only
def _confirm_upload(space_id):
    body = router.current_event.json_body
    document_id = body.get("document_id", "").strip()
    s3_key = body.get("s3_key", "").strip()
    filename = body.get("filename", "").strip()
    if not document_id or not s3_key or not filename:
        return _bad_request("document_id, s3_key, and filename are required")
    return confirm_system_document_upload(space_id, document_id, s3_key, filename)


@router.get("/governance/spaces/<space_id>/documents")
@governance_only
def _list_documents(space_id):
    return {"documents": list_system_documents(space_id)}


@router.delete("/governance/spaces/<space_id>/documents/<document_id>")
@governance_only
def _delete_document(space_id, document_id):
    delete_system_document(space_id, document_id)
    return {"message": "Document deleted"}
