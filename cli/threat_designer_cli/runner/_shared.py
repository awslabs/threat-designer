"""Shared helpers used by both the pipeline and attack-tree runners."""

from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from pydantic import BaseModel, ConfigDict


class Strict(BaseModel):
    """BaseModel emitting `additionalProperties: false` — required by OpenAI strict mode."""

    model_config = ConfigDict(extra="forbid")


def image_url_block(data: str, mime: str = "image/png") -> dict:
    """Build an image_url content block accepted by both Bedrock Converse and OpenAI Responses."""
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}


class UsageTracker(BaseCallbackHandler):
    """Tracks cumulative token usage across all LLM calls."""

    def __init__(self) -> None:
        self.input_tokens = 0
        self.output_tokens = 0
        self.cache_read = 0
        self.cache_create = 0
        self.calls = 0

    def add(self, um: dict) -> None:
        self.input_tokens += um.get("input_tokens", 0)
        self.output_tokens += um.get("output_tokens", 0)
        details = um.get("input_token_details") or {}
        self.cache_read += details.get("cache_read", 0)
        self.cache_create += details.get("cache_creation", 0)
        self.calls += 1

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        for gen_list in response.generations:
            for gen in gen_list:
                um = getattr(getattr(gen, "message", None), "usage_metadata", None)
                if um and um.get("input_tokens"):
                    self.add(um)

    def to_dict(self) -> dict:
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.input_tokens + self.output_tokens,
            "cache_read_input_tokens": self.cache_read,
            "cache_creation_input_tokens": self.cache_create,
            "total_calls": self.calls,
        }
