"""Routing into the space-context subgraph from route_after_summary.

The regression under test: on a new run with no user space attached, if
system-space discovery fails, get_system_space_ids() returns [] but latches
_system_space_discovery_failed. The router must still enter SPACE_CONTEXT so
finish_node writes the "org standards NOT consulted" trail warning. Routing
straight to ASSET would drop that warning silently, which is exactly the case
the warning exists for.
"""

import sys
from types import SimpleNamespace
from unittest.mock import patch

import pytest


def _route(agent, *, space_id="", system_ids=None, discovery_failed=False):
    """Run route_after_summary for a new (non-replay) run with a faked
    workflow_space_context module exposing the two attributes the router reads.
    """
    fake_wsc = SimpleNamespace(
        get_system_space_ids=lambda: list(system_ids or []),
        _system_space_discovery_failed=discovery_failed,
    )
    svc = agent.nodes.ReplayService(state_service=None)
    with patch.dict(sys.modules, {"workflow_space_context": fake_wsc}):
        return svc.route_after_summary({"replay": False, "space_id": space_id})


@pytest.mark.unit
def test_discovery_failure_with_no_user_space_still_enters_space_context(agent):
    """The regression: no user space + discovery failed must not route to ASSET."""
    result = _route(agent, space_id="", system_ids=[], discovery_failed=True)
    assert result == agent.constants.WORKFLOW_NODE_SPACE_CONTEXT


@pytest.mark.unit
def test_no_user_space_and_clean_discovery_routes_to_asset(agent):
    """Baseline: nothing to consult and no failure skips the subgraph."""
    result = _route(agent, space_id="", system_ids=[], discovery_failed=False)
    assert result == agent.constants.WORKFLOW_NODE_ASSET


@pytest.mark.unit
def test_user_space_enters_space_context(agent):
    result = _route(agent, space_id="space-123", system_ids=[], discovery_failed=False)
    assert result == agent.constants.WORKFLOW_NODE_SPACE_CONTEXT


@pytest.mark.unit
def test_configured_system_space_enters_space_context(agent):
    result = _route(agent, space_id="", system_ids=["sys-1"], discovery_failed=False)
    assert result == agent.constants.WORKFLOW_NODE_SPACE_CONTEXT
