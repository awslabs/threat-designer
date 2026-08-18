"""Shared fixtures for backend/sentry tests.

utils.py pulls in FastAPI, the Bedrock AgentCore graph builder, and the AWS
checkpoint saver at module scope. None of those are exercised by the MAESTRO
tool-gating logic under test, so they're stubbed here.
"""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

SENTRY_DIR = str(Path(__file__).parent.parent.parent / "backend" / "sentry")

STUBBED = [
    "fastapi",
    "fastapi.responses",
    "graph",
    "langchain_aws",
    "langgraph_checkpoint_aws",
    "langgraph_checkpoint_aws.async_saver",
]


@pytest.fixture(scope="module")
def sentry():
    """Import the sentry modules under test with their AWS/FastAPI deps stubbed."""
    stubs = {name: MagicMock() for name in STUBBED}

    sys.path.insert(0, SENTRY_DIR)
    for name, stub in stubs.items():
        sys.modules[name] = stub
    try:
        import prompt
        import utils

        yield SimpleNamespace(prompt=prompt, utils=utils)
    finally:
        sys.path.remove(SENTRY_DIR)
        for name in list(stubs) + ["prompt", "utils"]:
            sys.modules.pop(name, None)
