"""Model catalog — matches the IDs used in infra/variables.tf."""

BEDROCK_MODELS = [
    {
        "name": "Claude Opus 5 (Most Capable)",
        "id": "global.anthropic.claude-opus-5",
        "max_tokens": 128000,
        "adaptive": True,
        "supports_max": True,
        "effort_map": {
            "1": "low",
            "2": "medium",
            "3": "high",
            "4": "xhigh",
        },
    },
    {
        "name": "Claude Sonnet 5 (Balanced)",
        "id": "global.anthropic.claude-sonnet-5",
        "max_tokens": 128000,
        "adaptive": True,
        "supports_max": True,
        "effort_map": {
            "1": "low",
            "2": "medium",
            "3": "high",
            "4": "xhigh",
        },
    },
]

# GPT-5.6 fleet: Sol is the flagship (the "gpt-5.6" alias routes to it),
# Terra balances intelligence and cost, Luna serves efficient high-volume work.
# All three accept the full reasoning-effort ladder; level 4 tops out at
# "xhigh" (recommended for agentic work) rather than the pricier "max".
OPENAI_MODELS = [
    {
        "name": "GPT-5.6 Sol (Most Capable)",
        "id": "gpt-5.6-sol",
        "max_tokens": 32000,
        "effort_map": {
            "1": "low",
            "2": "medium",
            "3": "high",
            "4": "xhigh",
        },
    },
    {
        "name": "GPT-5.6 Terra (Balanced)",
        "id": "gpt-5.6-terra",
        "max_tokens": 32000,
        "effort_map": {
            "1": "low",
            "2": "medium",
            "3": "high",
            "4": "xhigh",
        },
    },
    {
        "name": "GPT-5.6 Luna (Efficient)",
        "id": "gpt-5.6-luna",
        "max_tokens": 32000,
        "effort_map": {
            "1": "low",
            "2": "medium",
            "3": "high",
            "4": "xhigh",
        },
    },
]

# Effort levels — map int value → display label. Levels start at 1: every
# current model is a reasoning model, so there is no 'off' level.
REASONING_LEVELS = [
    {"name": "Low", "value": 1, "effort": "low"},
    {"name": "Medium", "value": 2, "effort": "medium"},
    {"name": "High", "value": 3, "effort": "high"},
    {"name": "Extra High  — most thorough", "value": 4, "effort": "xhigh"},
]

# Display names for effort strings
_EFFORT_DISPLAY = {
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "xhigh": "Extra High",
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
    levels = []
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
