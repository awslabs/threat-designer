"""API routes for Spaces."""

import json

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import Response, content_types
from aws_lambda_powertools.event_handler.api_gateway import Router
from services.space_service import (
    confirm_document_upload,
    create_space,
    delete_document,
    delete_space,
    generate_document_upload_url,
    get_space,
    get_space_sharing,
    list_documents,
    list_spaces,
    remove_space_sharing,
    share_space,
    update_space,
)

tracer = Tracer()
router = Router()
LOG = logger = Logger(serialize_stacktrace=False)


def _user_id() -> str:
    return router.current_event.request_context.authorizer.get("user_id")


# ── Spaces CRUD ──────────────────────────────────────────────────────────────


@router.post("/spaces")
def _create_space():
    body = router.current_event.json_body
    name = body.get("name", "").strip()
    if not name:
        return Response(
            status_code=400,
            content_type=content_types.APPLICATION_JSON,
            body=json.dumps({"error": "name is required"}),
        )
    description = body.get("description", "")
    return create_space(_user_id(), name, description)


@router.get("/spaces")
def _list_spaces():
    return {"spaces": list_spaces(_user_id())}


@router.get("/spaces/<space_id>")
def _get_space(space_id):
    return get_space(space_id, _user_id())


@router.put("/spaces/<space_id>")
def _update_space(space_id):
    body = router.current_event.json_body
    return update_space(
        space_id,
        _user_id(),
        name=body.get("name"),
        description=body.get("description"),
    )


@router.delete("/spaces/<space_id>")
def _delete_space(space_id):
    delete_space(space_id, _user_id())
    return {"message": "Space deleted"}


# ── Documents ─────────────────────────────────────────────────────────────────


@router.post("/spaces/<space_id>/documents/upload")
def _request_upload(space_id):
    body = router.current_event.json_body
    filename = body.get("filename", "").strip()
    file_type = body.get("file_type", "application/octet-stream")
    if not filename:
        return Response(
            status_code=400,
            content_type=content_types.APPLICATION_JSON,
            body=json.dumps({"error": "filename is required"}),
        )
    return generate_document_upload_url(space_id, _user_id(), filename, file_type)


@router.post("/spaces/<space_id>/documents/confirm")
def _confirm_upload(space_id):
    body = router.current_event.json_body
    document_id = body.get("document_id", "").strip()
    s3_key = body.get("s3_key", "").strip()
    filename = body.get("filename", "").strip()
    if not document_id or not s3_key or not filename:
        return Response(
            status_code=400,
            content_type=content_types.APPLICATION_JSON,
            body=json.dumps(
                {"error": "document_id, s3_key, and filename are required"}
            ),
        )
    return confirm_document_upload(space_id, _user_id(), document_id, s3_key, filename)


@router.get("/spaces/<space_id>/documents")
def _list_documents(space_id):
    return {"documents": list_documents(space_id, _user_id())}


@router.delete("/spaces/<space_id>/documents/<document_id>")
def _delete_document(space_id, document_id):
    delete_document(space_id, _user_id(), document_id)
    return {"message": "Document deleted"}


# ── Sharing ───────────────────────────────────────────────────────────────────


@router.post("/spaces/<space_id>/share")
def _share_space(space_id):
    body = router.current_event.json_body
    user_ids = body.get("user_ids", [])
    if not isinstance(user_ids, list) or not user_ids:
        return Response(
            status_code=400,
            content_type=content_types.APPLICATION_JSON,
            body=json.dumps({"error": "user_ids must be a non-empty array"}),
        )
    return {"shared": share_space(space_id, _user_id(), user_ids)}


@router.get("/spaces/<space_id>/sharing")
def _get_sharing(space_id):
    return {"collaborators": get_space_sharing(space_id, _user_id())}


@router.delete("/spaces/<space_id>/sharing/<target_user_id>")
def _remove_sharing(space_id, target_user_id):
    remove_space_sharing(space_id, _user_id(), target_user_id)
    return {"message": "Access removed"}
