"""Shared fixtures for backend/threat_designer agent tests.

The agent modules import AWS-backed singletons at module scope (state service,
model service, config), so they are stubbed here. Stubs are installed with
patch.dict so they are torn down afterwards rather than leaking into the
backend/app suite, which has its own modules of the same name.
"""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

AGENT_DIR = str(Path(__file__).parent.parent.parent / "backend" / "threat_designer")

# Modules replaced with stubs: AWS clients, model invocation, and the prompt and
# message builders, none of which the methodology logic depends on.
STUBBED = [
    "config",
    "state_tracking_service",
    "model_service",
    "partitioner",
    "prompt_provider",
    "message_builder",
    "monitoring",
    "utils",
]


def _passthrough_with_error_context(monitoring_stub):
    """Make the stubbed monitoring.with_error_context a real identity decorator.

    A MagicMock swallows the decorated function entirely (calling it returns a
    chained MagicMock rather than running the real body), which would silently
    turn every @with_error_context-decorated function under test into a no-op.
    """
    monitoring_stub.with_error_context = lambda *a, **kw: (lambda func: func)


@pytest.fixture(scope="module")
def agent():
    """Import the agent modules under test with their AWS dependencies stubbed."""
    stubs = {name: MagicMock() for name in STUBBED}
    _passthrough_with_error_context(stubs["monitoring"])

    # langchain's @tool decorator would otherwise wrap the functions we assert on
    langchain_tools = MagicMock()
    langchain_tools.tool = lambda **kwargs: (lambda func: func)
    stubs["langchain"] = MagicMock()
    stubs["langchain.tools"] = langchain_tools

    with patch.dict(sys.modules, stubs):
        sys.path.insert(0, AGENT_DIR)
        try:
            import constants
            import state
            import tools
            import workflow_threats
            import nodes

            yield SimpleNamespace(
                constants=constants,
                state=state,
                tools=tools,
                workflow_threats=workflow_threats,
                nodes=nodes,
            )
        finally:
            sys.path.remove(AGENT_DIR)
            for name in ("constants", "state", "tools", "workflow_threats", "nodes"):
                sys.modules.pop(name, None)


class _StubValidationError(Exception):
    """Stand-in for exceptions.ValidationError, which pulls in the AWS stack."""


@pytest.fixture
def entrypoint(monkeypatch):
    """Import agent.py (the AgentCore entrypoint) with its AWS/FastAPI deps stubbed.

    Parameterised by MAESTRO_ENABLED so the feature flag can be exercised: the
    config singleton is built at import time, so the env var must be set first.
    """

    def _load(maestro_enabled: bool = True):
        monkeypatch.setenv("AGENT_STATE_TABLE", "test-table")
        monkeypatch.setenv("MAESTRO_ENABLED", "true" if maestro_enabled else "false")

        stubs = {
            name: MagicMock()
            for name in [
                "fastapi",
                "fastapi.responses",
                "fastapi.middleware",
                "fastapi.middleware.cors",
                "models",
                "model_utils",
                "monitoring",
                "utils",
                "workflow",
                "state_tracking_service",
                "model_service",
                "partitioner",
                "prompt_provider",
                "message_builder",
                "exceptions",
            ]
        }
        stubs["exceptions"].ValidationError = _StubValidationError
        stubs["exceptions"].ThreatModelingError = Exception
        _passthrough_with_error_context(stubs["monitoring"])

        with patch.dict(sys.modules, stubs):
            sys.path.insert(0, AGENT_DIR)
            try:
                sys.modules.pop("agent", None)
                sys.modules.pop("config", None)
                import agent as agent_module

                return agent_module
            finally:
                sys.path.remove(AGENT_DIR)
                sys.modules.pop("agent", None)
                sys.modules.pop("config", None)

    return _load


@pytest.fixture
def validation_error():
    return _StubValidationError


@pytest.fixture(scope="module")
def prompts():
    """Import prompts.py and prompts_gpt.py directly, with only `config` stubbed.

    Both modules need real langchain_core and constants — only their optional
    `from config import config` needs a stand-in so a real deployment config
    (which requires AWS env vars) is never constructed.
    """
    stub_config = MagicMock()
    stub_config.config.model_provider = "bedrock"

    with patch.dict(sys.modules, {"config": stub_config}):
        sys.path.insert(0, AGENT_DIR)
        try:
            for name in ("prompts", "prompts_gpt", "constants"):
                sys.modules.pop(name, None)
            import prompts
            import prompts_gpt

            yield SimpleNamespace(stride=prompts, gpt=prompts_gpt)
        finally:
            sys.path.remove(AGENT_DIR)
            for name in ("prompts", "prompts_gpt"):
                sys.modules.pop(name, None)


@pytest.fixture
def make_threat(agent):
    """Build a valid Threat, overriding any field per test."""

    def _make(**overrides):
        base = {
            "name": "threat",
            "description": "d",
            "target": "API",
            "impact": "i",
            "likelihood": "Low",
            "mitigations": ["m1", "m2"],
            "source": "Insider",
            "prerequisites": ["p"],
            "vector": "v",
        }
        return agent.state.Threat(**{**base, **overrides})

    return _make
