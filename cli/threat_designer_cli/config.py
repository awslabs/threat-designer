"""CLI configuration — stored at ~/.threat-designer/config.json."""

import json
import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

CONFIG_DIR = Path.home() / ".threat-designer"
CONFIG_FILE = CONFIG_DIR / "config.json"


class CLIConfig(BaseModel):
    provider: str = "bedrock"
    aws_profile: Optional[str] = None
    aws_region: str = "us-west-2"
    model_id: str = "us.anthropic.claude-sonnet-4-6-20251101-v1:0"
    model_name: str = "Claude Sonnet 4.6 (Balanced)"
    reasoning_level: int = 0
    openai_api_key: Optional[str] = None

    @classmethod
    def load(cls) -> "CLIConfig":
        if CONFIG_FILE.exists():
            try:
                return cls(**json.loads(CONFIG_FILE.read_text()))
            except Exception:
                return cls()
        return cls()

    def save(self) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(self.model_dump_json(indent=2))

    def is_configured(self) -> bool:
        if self.provider == "openai":
            # Accept key from env var as well
            return bool(self.openai_api_key or os.environ.get("OPENAI_API_KEY"))
        return True  # Bedrock uses AWS_PROFILE / default profile

    def effective_openai_key(self) -> Optional[str]:
        return self.openai_api_key or os.environ.get("OPENAI_API_KEY")
