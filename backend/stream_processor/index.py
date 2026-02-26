"""Lambda handler for DynamoDB Streams events on AGENT_STATE_TABLE.

Routes stream records by event type:
- MODIFY: diff threat lists and delete orphaned attack trees
- REMOVE / INSERT: log and skip
"""

import logging
import os

from cleanup import delete_orphaned_attack_trees
from deserializer import deserialize_dynamodb_image
from diff import compute_threat_diff

# Configure the root logger so all module loggers (cleanup, diff, etc.) emit to CloudWatch
logging.getLogger().setLevel(os.environ.get("LOG_LEVEL", "INFO"))
LOG = logging.getLogger(__name__)


def _extract_threats(image: dict) -> list[dict] | None:
    """Extract the threats list from a deserialized DynamoDB image.

    Returns ``None`` if the ``threat_list`` or ``threats`` key is missing.
    """
    threat_list = image.get("threat_list")
    if threat_list is None:
        return None
    if not isinstance(threat_list, dict):
        return None
    threats = threat_list.get("threats")
    if threats is None:
        return None
    if not isinstance(threats, list):
        return None
    return threats


def process_record(record: dict) -> dict:
    """Process a single DynamoDB stream record.

    Returns a summary dict: ``{"action": str, "deleted": int, "failed": int, "skipped": int}``
    """
    event_name = record.get("eventName", "")
    dynamodb = record.get("dynamodb", {})

    if event_name == "REMOVE":
        LOG.info("REMOVE event — skipping (cascade handled by delete_tm)")
        return {"action": "skipped", "deleted": 0, "failed": 0, "skipped": 0}

    if event_name == "INSERT":
        LOG.info("INSERT event — skipping")
        return {"action": "skipped", "deleted": 0, "failed": 0, "skipped": 0}

    if event_name != "MODIFY":
        LOG.info("Unrecognised event type '%s' — skipping", event_name)
        return {"action": "skipped", "deleted": 0, "failed": 0, "skipped": 0}

    # --- MODIFY path ---
    keys = dynamodb.get("Keys", {})
    job_id_attr = keys.get("job_id", {})
    threat_model_id = job_id_attr.get("S", "")
    if not threat_model_id:
        LOG.warning("MODIFY event missing job_id in Keys — skipping")
        return {"action": "skipped", "deleted": 0, "failed": 0, "skipped": 0}

    old_image_raw = dynamodb.get("OldImage")
    new_image_raw = dynamodb.get("NewImage")

    if not old_image_raw:
        LOG.warning("MODIFY event missing OldImage — skipping")
        return {"action": "skipped", "deleted": 0, "failed": 0, "skipped": 0}

    old_image = deserialize_dynamodb_image(old_image_raw)
    old_threats = _extract_threats(old_image)
    if old_threats is None:
        LOG.warning(
            "OldImage missing threat_list — skipping record %s", threat_model_id
        )
        return {"action": "skipped", "deleted": 0, "failed": 0, "skipped": 0}

    if not new_image_raw:
        LOG.warning("MODIFY event missing NewImage — skipping")
        return {"action": "skipped", "deleted": 0, "failed": 0, "skipped": 0}

    new_image = deserialize_dynamodb_image(new_image_raw)
    new_threats = _extract_threats(new_image)
    if new_threats is None:
        LOG.warning(
            "NewImage missing threat_list — skipping record %s", threat_model_id
        )
        return {"action": "skipped", "deleted": 0, "failed": 0, "skipped": 0}

    removed = compute_threat_diff(old_threats, new_threats)
    if not removed:
        LOG.info("No threats removed for %s — nothing to clean up", threat_model_id)
        return {"action": "no_change", "deleted": 0, "failed": 0, "skipped": 0}

    result = delete_orphaned_attack_trees(threat_model_id, removed)
    result["action"] = "cleaned"
    return result


def lambda_handler(event: dict, context) -> dict:
    """DynamoDB Streams event handler.

    Processes each record in the event and returns an aggregate summary.
    """
    records = event.get("Records", [])
    LOG.info("Received %d stream record(s)", len(records))

    total_deleted = 0
    total_failed = 0
    total_skipped = 0

    for record in records:
        try:
            result = process_record(record)
            total_deleted += result.get("deleted", 0)
            total_failed += result.get("failed", 0)
            total_skipped += result.get("skipped", 0)
        except Exception:
            LOG.exception(
                "Unexpected error processing record: %s",
                record.get("eventID", "unknown"),
            )
            total_failed += 1

    return {
        "processed": len(records),
        "deleted": total_deleted,
        "failed": total_failed,
        "skipped": total_skipped,
    }
