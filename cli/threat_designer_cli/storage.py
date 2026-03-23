"""Local threat model storage — ~/.threat-designer/models/<id>.json."""

import json
from pathlib import Path
from typing import List, Optional

MODELS_DIR = Path.home() / ".threat-designer" / "models"


def list_models() -> List[dict]:
    if not MODELS_DIR.exists():
        return []
    models = []
    for path in sorted(MODELS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            models.append(json.loads(path.read_text()))
        except Exception:
            pass
    return models


def get_model(model_id: str) -> Optional[dict]:
    path = MODELS_DIR / f"{model_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def delete_model(model_id: str) -> bool:
    path = MODELS_DIR / f"{model_id}.json"
    if not path.exists():
        return False
    path.unlink()
    return True
