"""
Local pipeline — sets env vars, patches StateService, invokes the LangGraph workflow.

The workflow modules are imported lazily (after env vars are set) so model
configuration is picked up correctly. The StateService patch is applied once
per process; subsequent runs reconfigure the singleton via LocalStateService.configure().
"""

import base64
import json
import logging
import mimetypes
import os
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from ..config import CLIConfig
from ..models import BEDROCK_MODELS, OPENAI_MODELS
from .local_state import LocalStateService

# Path to the backend threat_designer package.
# When pip-installed, __file__ is in site-packages so we can't rely on parents[3].
# Try __file__-relative first (editable install / running from repo), then fall
# back to a THREAT_DESIGNER_REPO env var, then search common locations.
def _resolve_backend_path() -> Path:
    # 1. Relative to source (works for editable installs / running from repo)
    candidate = Path(__file__).parents[3] / "backend" / "threat_designer"
    if candidate.is_dir():
        return candidate
    # 2. Explicit env var
    repo = os.environ.get("THREAT_DESIGNER_REPO")
    if repo:
        candidate = Path(repo) / "backend" / "threat_designer"
        if candidate.is_dir():
            return candidate
    # 3. Config file stores the repo root from first install
    marker = Path.home() / ".threat-designer" / "repo_path"
    if marker.exists():
        candidate = Path(marker.read_text().strip()) / "backend" / "threat_designer"
        if candidate.is_dir():
            return candidate
    # 4. Not found — will fail at import time with a clear error
    return Path("__backend_not_found__")


BACKEND_PATH = _resolve_backend_path()

_patched = False  # Track whether StateService has been patched this process


def _suppress_logging() -> None:
    for name in (
        "langchain_aws",
        "langchain_core",
        "langgraph",
        "botocore",
        "boto3",
        "urllib3",
        "httpx",
    ):
        logging.getLogger(name).setLevel(logging.WARNING)
    # Silence structlog output to stderr
    logging.getLogger().setLevel(logging.WARNING)


def _ensure_backend_path() -> None:
    if not BACKEND_PATH.is_dir():
        raise RuntimeError(
            f"Backend not found at {BACKEND_PATH}.\n"
            "If you installed via 'pip install ./cli', the backend path could not be resolved.\n"
            "Fix: reinstall with 'pip install -e ./cli' (editable mode) from the repo root,\n"
            "or set THREAT_DESIGNER_REPO=/path/to/threat-designer"
        )
    path = str(BACKEND_PATH)
    if path not in sys.path:
        sys.path.insert(0, path)
    # Cache the repo path for future non-editable installs
    marker = Path.home() / ".threat-designer" / "repo_path"
    if not marker.exists():
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(str(BACKEND_PATH.parent.parent))


def _build_model_config(cfg: CLIConfig) -> dict:
    """Return a model config dict suitable for a single node."""
    if cfg.provider == "bedrock":
        props = next(
            (m for m in BEDROCK_MODELS if m["id"] == cfg.model_id), BEDROCK_MODELS[1]
        )
        return {
            "id": cfg.model_id,
            "max_tokens": props["max_tokens"],
            "reasoning_budget": props.get("reasoning_budget", {}),
        }
    else:
        props = next(
            (m for m in OPENAI_MODELS if m["id"] == cfg.model_id), OPENAI_MODELS[0]
        )
        return {"id": cfg.model_id, "max_tokens": props["max_tokens"]}


def _setup_env(cfg: CLIConfig) -> None:
    """Populate all environment variables the workflow modules expect."""
    mc = _build_model_config(cfg)
    nodes = ["assets", "flows", "threats", "threats_agent", "gaps", "attack_tree"]
    main_model = {n: mc for n in nodes}

    if cfg.provider == "bedrock":
        props = next(
            (m for m in BEDROCK_MODELS if m["id"] == cfg.model_id), BEDROCK_MODELS[1]
        )
        env = {
            "MODEL_PROVIDER": "bedrock",
            "MAIN_MODEL": json.dumps(main_model),
            "MODEL_STRUCT": json.dumps(mc),
            "MODEL_SUMMARY": json.dumps(mc),
            "REASONING_MODELS": json.dumps(
                [] if props.get("adaptive") else [cfg.model_id]
            ),
            "ADAPTIVE_THINKING_MODELS": json.dumps(
                [cfg.model_id] if props.get("adaptive") else []
            ),
            "MODELS_SUPPORTING_MAX": json.dumps(
                [cfg.model_id] if props.get("supports_max") else []
            ),
            "REGION": cfg.aws_region,
            "AWS_REGION": cfg.aws_region,
        }
        if cfg.aws_profile:
            env["AWS_PROFILE"] = cfg.aws_profile
    else:
        env = {
            "MODEL_PROVIDER": "openai",
            "MAIN_MODEL": json.dumps(main_model),
            "MODEL_STRUCT": json.dumps(mc),
            "MODEL_SUMMARY": json.dumps(mc),
            "REASONING_MODELS": json.dumps([cfg.model_id]),
            "ADAPTIVE_THINKING_MODELS": json.dumps([]),
            "MODELS_SUPPORTING_MAX": json.dumps([]),
            "OPENAI_API_KEY": cfg.effective_openai_key() or "",
        }

    env.update(
        {
            "AGENT_STATE_TABLE": "local",
            "JOB_STATUS_TABLE": "local",
            "AGENT_TRAIL_TABLE": "local",
            "LOG_LEVEL": "ERROR",
        }
    )
    for k, v in env.items():
        os.environ[k] = v


def _load_image(image_path: str) -> tuple[str, str]:
    with open(image_path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    mime, _ = mimetypes.guess_type(image_path)
    image_type = (mime or "image/jpeg").split("/")[1]
    return data, image_type


def run_workflow(
    name: str,
    description: str,
    image_path: str,
    cfg: CLIConfig,
    job_id: str,
    assumptions: Optional[list] = None,
    iteration: int = 0,
    app_type: str = "hybrid",
    on_progress: Optional[Callable[[str], None]] = None,
    on_event: Optional[Callable[[str], None]] = None,
    stop_event: Optional[threading.Event] = None,
) -> dict:
    global _patched

    _ensure_backend_path()
    _suppress_logging()
    _setup_env(cfg)

    # Patch StateService once per process (before any workflow import)
    import state_tracking_service  # type: ignore  # noqa: E402

    if not _patched:
        state_tracking_service.StateService = LocalStateService
        _patched = True

    # Reconfigure singleton for this run
    LocalStateService.configure(job_id, on_progress, image_path=image_path)

    # Deferred imports — must happen after env vars are set and StateService is patched
    from workflow import agent  # type: ignore  # noqa: E402
    from model_utils import initialize_models  # type: ignore  # noqa: E402
    from state import ThreatsList  # type: ignore  # noqa: E402
    from constants import DEFAULT_MAX_RETRY  # type: ignore  # noqa: E402

    image_data, image_type = _load_image(image_path)

    initial_state = {
        "job_id": job_id,
        "image_data": image_data,
        "image_type": image_type,
        "title": name,
        "description": description,
        "assumptions": assumptions or [],
        "instructions": None,
        "owner": "cli",
        "replay": False,
        "iteration": iteration,
        "threat_list": ThreatsList(threats=[]),
        "application_type": app_type,
    }

    models = initialize_models(reasoning=cfg.reasoning_level, job_id=job_id)
    agent_config = {
        "configurable": {
            "model_assets": models["assets_model"],
            "model_flows": models["flows_model"],
            "model_threats": models["threats_model"],
            "model_threats_agent": models["threats_agent_model"],
            "model_gaps": models["gaps_model"],
            "model_struct": models["struct_model"],
            "model_summary": models["summary_model"],
            "model_space_context": models.get(
                "space_context_model", models["flows_model"]
            ),
            "start_time": datetime.now(),
            "max_retries": DEFAULT_MAX_RETRY,
            "reasoning": cfg.reasoning_level > 0,
        },
        "recursion_limit": 150,
    }

    _seen_tc_ids: set = set()
    _working_shown_ns: set = set()

    for ns_tuple, (msg_chunk, metadata) in agent.stream(
        initial_state, config=agent_config, stream_mode="messages", subgraphs=True
    ):
        if stop_event and stop_event.is_set():
            break
        if on_event:
            ns = ns_tuple[0] if ns_tuple else ""
            node = metadata.get("langgraph_node", "")
            if node == "agent" and (
                ns.startswith("flows") or ns.startswith("threats_agentic")
            ):
                if (
                    hasattr(msg_chunk, "tool_call_chunks")
                    and msg_chunk.tool_call_chunks
                ):
                    for tc_chunk in msg_chunk.tool_call_chunks:
                        tc_id = tc_chunk.get("id") or ""
                        tc_name = (tc_chunk.get("name") or "").strip()
                        if tc_id and tc_id not in _seen_tc_ids and tc_name:
                            _seen_tc_ids.add(tc_id)
                            _working_shown_ns.discard(ns)
                            on_event(tc_name)
                elif hasattr(msg_chunk, "content") and msg_chunk.content:
                    if ns not in _working_shown_ns:
                        _working_shown_ns.add(ns)
                        on_event("Working...")

    return LocalStateService.pop_result() or {}
