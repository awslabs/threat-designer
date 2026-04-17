"""Model catalog — matches the IDs used in infra/variables.tf."""

BEDROCK_MODELS = [
    {
        "name": "Claude Opus 4.7 (Most Capable)",
        "id": "global.anthropic.claude-opus-4-7",
        "max_tokens": 128000,
        "adaptive": True,
        "supports_max": True,
        "effort_map": {
            "1": "low",
            "2": "medium",
            "3": "high",
            "4": "xhigh",
            "5": "max",
        },
    },
    {
        "name": "Claude Opus 4.6",
        "id": "global.anthropic.claude-opus-4-6-v1",
        "max_tokens": 32000,
        "adaptive": True,
        "supports_max": True,
    },
    {
        "name": "Claude Sonnet 4.6 (Balanced)",
        "id": "global.anthropic.claude-sonnet-4-6",
        "max_tokens": 32000,
        "adaptive": True,
        "supports_max": True,
    },
]

OPENAI_MODELS = [
    {
        "name": "GPT-5.4 (Latest)",
        "id": "gpt-5.4-2026-03-05",
        "max_tokens": 32000,
        "mini": False,
        "effort_map": {"1": "low", "2": "medium", "3": "high", "4": "xhigh"},
    },
]

# Effort levels — map int value → display label
REASONING_LEVELS = [
    {"name": "Off  — no reasoning", "value": 0, "effort": "off"},
    {"name": "Low", "value": 1, "effort": "low"},
    {"name": "Medium", "value": 2, "effort": "medium"},
    {"name": "High", "value": 3, "effort": "high"},
    {"name": "Max  — most thorough", "value": 4, "effort": "max"},
]

# Display names for effort strings
_EFFORT_DISPLAY = {
    "off": "Off",
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "xhigh": "xHigh",
    "max": "Max",
}


def reasoning_levels_for_model(model_props: dict | None = None) -> list[dict]:
    """Return reasoning levels adjusted to the model's effort_map.

    Models without an effort_map get the default REASONING_LEVELS.
    """
    if not model_props or "effort_map" not in model_props:
        return REASONING_LEVELS
    effort_map = model_props["effort_map"]
    max_level = max(int(k) for k in effort_map)
    levels = [REASONING_LEVELS[0]]  # "Off" is always the same
    for i in range(1, max_level + 1):
        effort = effort_map.get(str(i), "low")
        display = _EFFORT_DISPLAY.get(effort, effort)
        if i == max_level:
            display = f"{display} — most thorough"
        levels.append({"name": display, "value": i, "effort": effort})
    return levels


def lookup_model(provider: str, model_id: str) -> dict | None:
    """Return the catalog entry for (provider, model_id), or None for custom IDs."""
    catalog = BEDROCK_MODELS if provider == "bedrock" else OPENAI_MODELS
    return next((m for m in catalog if m["id"] == model_id), None)


def effort_label(reasoning_level: int, model_props: dict | None = None) -> str:
    """Return the effort string for a numeric reasoning level."""
    levels = reasoning_levels_for_model(model_props)
    return next(
        (r["effort"] for r in levels if r["value"] == reasoning_level),
        str(reasoning_level),
    )
