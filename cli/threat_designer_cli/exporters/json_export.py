"""JSON export — pretty-print the stored model dict."""

import json
from pathlib import Path


def export_json(model: dict, out_path: str) -> None:
    Path(out_path).write_text(json.dumps(model, indent=2, default=str))
