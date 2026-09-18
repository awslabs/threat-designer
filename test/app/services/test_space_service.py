"""Unit tests for space_service system-space guards.

Covers the two guards that keep governance-managed system spaces and the
owner-scoped /spaces API from crossing over:

- _assert_not_system_space: the owner-scoped endpoints must refuse to mutate a
  system space (share, delete, document ops).
- _assert_is_system_space: the governance document endpoints must refuse to
  touch a non-system (user) space.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

backend_path = str(Path(__file__).parent.parent.parent.parent / "backend" / "app")
sys.path.insert(0, backend_path)

sys.modules["aws_xray_sdk"] = MagicMock()
sys.modules["aws_xray_sdk.core"] = MagicMock()

from services import space_service
from exceptions.exceptions import NotFoundError, UnauthorizedError


def _patch_item(item):
    """Point space_service.dynamodb at a table returning the given get_item Item."""
    table = MagicMock()
    table.get_item.return_value = {"Item": item} if item is not None else {}
    resource = MagicMock()
    resource.Table.return_value = table
    return patch.object(space_service, "dynamodb", resource)


class TestAssertNotSystemSpace:
    def test_passes_for_user_space(self):
        with _patch_item({"space_id": "s1", "owner": "u1"}):
            space_service._assert_not_system_space("s1")

    def test_passes_when_system_flag_false(self):
        with _patch_item({"space_id": "s1", "system": False}):
            space_service._assert_not_system_space("s1")

    def test_passes_when_space_missing(self):
        # No item: nothing to protect. Downstream owner check raises NotFound.
        with _patch_item(None):
            space_service._assert_not_system_space("missing")

    def test_raises_for_system_space(self):
        with _patch_item({"space_id": "s1", "system": True}):
            with pytest.raises(UnauthorizedError):
                space_service._assert_not_system_space("s1")


class TestAssertIsSystemSpace:
    def test_passes_for_system_space(self):
        with _patch_item({"space_id": "s1", "system": True}):
            space_service._assert_is_system_space("s1")

    def test_raises_for_user_space(self):
        with _patch_item({"space_id": "s1", "owner": "u1"}):
            with pytest.raises(UnauthorizedError):
                space_service._assert_is_system_space("s1")

    def test_raises_when_system_flag_false(self):
        with _patch_item({"space_id": "s1", "system": False}):
            with pytest.raises(UnauthorizedError):
                space_service._assert_is_system_space("s1")

    def test_raises_not_found_when_space_missing(self):
        with _patch_item(None):
            with pytest.raises(NotFoundError):
                space_service._assert_is_system_space("missing")
