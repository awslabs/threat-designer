"""
LocalStateService — drop-in replacement for the DynamoDB-backed StateService.

Uses class-level state so the single instance created by ThreatModelingOrchestrator
at module import time can be reconfigured across multiple CLI runs in the same session.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

MODELS_DIR = Path.home() / ".threat-designer" / "models"

_STAGE_LABELS = {
    "ASSETS": "Identifying assets",
    "FLOW": "Analyzing data flows",
    "THREAT": "Generating threats",
    "THREAT_RETRY": "Refining threats",
    "FINALIZE": "Finalizing",
    "COMPLETE": "Complete",
    "FAILED": "Failed",
}


class LocalStateService:
    """Replaces StateService; writes final results to local JSON files."""

    # Class-level state shared by all instances
    _job_id: Optional[str] = None
    _on_progress: Optional[Callable[[str], None]] = None
    _final_state: Optional[dict] = None
    _current_stage: Optional[str] = None
    _last_label: Optional[str] = None
    _image_path: Optional[str] = None

    def __init__(self, agent_table: str = "local"):
        pass  # agent_table is irrelevant locally

    @classmethod
    def configure(
        cls,
        job_id: str,
        on_progress: Optional[Callable[[str], None]] = None,
        image_path: Optional[str] = None,
    ) -> None:
        cls._job_id = job_id
        cls._on_progress = on_progress
        cls._final_state = None
        cls._last_label = None
        cls._image_path = image_path

    @classmethod
    def pop_result(cls) -> Optional[dict]:
        result = cls._final_state
        cls._final_state = None
        return result

    def update_job_state(self, job_id, state, retry_count=None, detail=None) -> None:
        raw = state.value if hasattr(state, "value") else str(state)
        if raw:
            self.__class__._current_stage = raw
        stage_label = _STAGE_LABELS.get(
            (self.__class__._current_stage or "").upper(),
            self.__class__._current_stage or "Working...",
        )
        if stage_label != self.__class__._last_label and self.__class__._on_progress:
            self.__class__._last_label = stage_label
            self.__class__._on_progress(stage_label)

    def update_trail(
        self,
        job_id,
        threats=None,
        gaps=None,
        assets=None,
        flows=None,
        space_context=None,
        flush=0,
    ) -> None:
        pass  # Trail not needed for CLI

    def finalize_workflow(self, state_dict) -> None:
        job_id = self.__class__._job_id or "unknown"
        serialized = _serialize_state(state_dict, job_id)
        if self.__class__._image_path:
            serialized["image_path"] = self.__class__._image_path
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        path = MODELS_DIR / f"{job_id}.json"
        path.write_text(json.dumps(serialized, indent=2, default=str))
        self.__class__._final_state = serialized

    def update_with_backup(self, job_id: str) -> None:
        pass


def _serialize_state(state_dict, job_id: str) -> dict:
    """Convert AgentState (may contain Pydantic objects) to a JSON-safe dict."""
    result: dict = {
        "id": job_id,
        "status": "COMPLETE",
        "created_at": datetime.now().isoformat(),
    }
    skip = {"image_data", "image_type", "space_insights", "next_step", "stop"}
    for key, val in state_dict.items():
        if key in skip:
            continue
        if hasattr(val, "model_dump"):
            result[key] = val.model_dump()
        elif isinstance(val, (str, int, float, bool, list, dict)) or val is None:
            result[key] = val
        else:
            result[key] = str(val)
    return result
