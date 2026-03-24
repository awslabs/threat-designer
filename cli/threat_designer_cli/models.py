"""Model catalog — matches the IDs used in infra/variables.tf."""

BEDROCK_MODELS = [
    {
        "name": "Claude Opus 4.6 (Most Capable)",
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


def effort_label(reasoning_level: int) -> str:
    """Return the effort string for a numeric reasoning level."""
    return next(
        (r["effort"] for r in REASONING_LEVELS if r["value"] == reasoning_level),
        str(reasoning_level),
    )
