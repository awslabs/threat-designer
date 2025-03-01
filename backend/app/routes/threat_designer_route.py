from aws_lambda_powertools import Tracer, Logger
from aws_lambda_powertools.event_handler.api_gateway import Router

from services.threat_designer_service import (
    check_status,
    fetch_results,
    invoke_lambda,
    generate_presigned_url,
    update_results,
    generate_presigned_download_url,
    delete_tm,
    fetch_all,
)

tracer = Tracer()
router = Router()

LOG = logger = Logger(serialize_stacktrace=False)


@router.get("/threat-designer/status/<id>")
def _tm_status(id):
    return check_status(id)


@router.get("/threat-designer/<id>")
def _tm_fetch_results(id):
    return fetch_results(id)


@router.post("/threat-designer")
def _tm_start():
    try:
        body = router.current_event.json_body
        owner = router.current_event.request_context.authorizer.get("username")
        return invoke_lambda(owner, body)
    except Exception as e:
        LOG.exception(e)


@router.get("/threat-designer/all")
def _fetch_all():
    LOG.info(f"Full event: {router.current_event}")
    owner = router.current_event.request_context.authorizer.get("username")
    return fetch_all(owner)


@router.put("/threat-designer/<id>")
def _update_results(id):
    body = router.current_event.json_body
    owner = router.current_event.request_context.authorizer.get("username")
    return update_results(id, body, owner)


@router.delete("/threat-designer/<id>")
def _delete(id):
    owner = router.current_event.request_context.authorizer.get("username")
    return delete_tm(id, owner)


@router.post("/threat-designer/upload")
def _upload():
    try:
        body = router.current_event.json_body
        file_type = body.get("file_type")
        return generate_presigned_url(file_type)
    except Exception as e:
        LOG.exception(e)


@router.post("/threat-designer/download")
def _download():
    try:
        body = router.current_event.json_body
        object = body.get("s3_location")
        return generate_presigned_download_url(object)
    except Exception as e:
        LOG.exception(e)
