"""Delete orphaned attack tree records from ATTACK_TREE_TABLE and STATE_TABLE."""

import logging
import os

import boto3

LOG = logging.getLogger(__name__)

_dynamodb = boto3.resource("dynamodb")


def generate_attack_tree_id(threat_model_id: str, threat_name: str) -> str:
    """Generate a deterministic attack tree ID.

    Replicates the normalization from
    ``attack_tree_service.generate_attack_tree_id()``:
    - Strip and lowercase the threat name
    - Replace spaces with underscores
    - Keep only ASCII alphanumeric, underscore, and hyphen characters
    - Combine as ``{threat_model_id}_{normalized_name}``

    Raises:
        ValueError: If either argument is empty or the normalized name has
            no alphanumeric characters.
    """
    if not threat_model_id or not isinstance(threat_model_id, str):
        raise ValueError("threat_model_id must be a non-empty string")
    if not threat_model_id.strip():
        raise ValueError("threat_model_id must be a non-empty string")

    if not threat_name or not isinstance(threat_name, str):
        raise ValueError("threat_name must be a non-empty string")
    if not threat_name.strip():
        raise ValueError("threat_name must be a non-empty string")

    normalized = threat_name.strip().lower().replace(" ", "_")
    normalized = "".join(
        c for c in normalized if (c.isascii() and c.isalnum()) or c in ("_", "-")
    )

    if not normalized or not any(c.isalnum() for c in normalized):
        raise ValueError("threat_name must contain at least one alphanumeric character")

    return f"{threat_model_id}_{normalized}"


def delete_orphaned_attack_trees(
    threat_model_id: str, removed_threats: list[dict]
) -> dict:
    """Delete attack tree and state records for each removed threat.

    For every removed threat the function:
    1. Computes the ``attack_tree_id`` via :func:`generate_attack_tree_id`.
    2. Deletes the record from ``ATTACK_TREE_TABLE``.
    3. Deletes the record from ``STATE_TABLE``.

    Individual failures are logged and skipped so that one bad threat does
    not block cleanup of the rest.  Deleting a non-existent item is treated
    as success (idempotent).

    Returns:
        ``{"deleted": <int>, "failed": <int>, "skipped": <int>}``
    """
    attack_tree_table_name = os.environ.get("ATTACK_TREE_TABLE", "")
    state_table_name = os.environ.get("JOB_STATUS_TABLE", "")

    attack_tree_table = _dynamodb.Table(attack_tree_table_name)
    state_table = _dynamodb.Table(state_table_name)

    deleted = 0
    failed = 0
    skipped = 0

    for threat in removed_threats:
        threat_name = threat.get("name")
        if not threat_name:
            LOG.warning("Threat missing 'name' field, skipping: %s", threat)
            skipped += 1
            continue

        try:
            attack_tree_id = generate_attack_tree_id(threat_model_id, threat_name)
        except ValueError:
            LOG.warning("Invalid threat name '%s', skipping ID generation", threat_name)
            skipped += 1
            continue

        try:
            attack_tree_table.delete_item(Key={"attack_tree_id": attack_tree_id})
            state_table.delete_item(Key={"id": attack_tree_id})
            deleted += 1
            LOG.info("Deleted orphaned attack tree: %s", attack_tree_id)
        except Exception:
            LOG.exception("Failed to delete attack tree %s, continuing", attack_tree_id)
            failed += 1

    return {"deleted": deleted, "failed": failed, "skipped": skipped}
