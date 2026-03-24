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
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from ..config import CLIConfig
from ..models import BEDROCK_MODELS, OPENAI_MODELS
from .local_state import LocalStateService

# Path to the backend threat_designer package
BACKEND_PATH = Path(__file__).parents[3] / "backend" / "threat_designer"

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
    path = str(BACKEND_PATH)
    if path not in sys.path:
        sys.path.insert(0, path)


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
    on_progress: Optional[Callable[[str], None]] = None,
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
        "application_type": "hybrid",
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

    agent.invoke(initial_state, config=agent_config)
    return LocalStateService.pop_result() or {}
