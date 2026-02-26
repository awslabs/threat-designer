"""Compute the diff between old and new threat lists."""

import logging

LOG = logging.getLogger(__name__)


def compute_threat_diff(old_threats: list[dict], new_threats: list[dict]) -> list[dict]:
    """Return threats present in old_threats but absent in new_threats.

    Threats are matched by their ``name`` field. Changes to other fields
    on a retained threat are ignored.

    Args:
        old_threats: Threat dicts from the OldImage.
        new_threats: Threat dicts from the NewImage.

    Returns:
        List of threat dicts that were removed.
    """
    new_names = {t.get("name") for t in new_threats if t.get("name") is not None}
    removed = [t for t in old_threats if t.get("name") not in new_names]

    if removed:
        LOG.info(
            "Detected %d removed threat(s): %s",
            len(removed),
            [t.get("name") for t in removed],
        )

    return removed
