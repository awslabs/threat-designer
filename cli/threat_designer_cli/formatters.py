"""Shared threat formatting and filtering utilities."""

_LIKELIHOOD_RANK = {"high": 0, "medium": 1, "low": 2}


def apply_threat_filters(
    model: dict, min_likelihood: str | None, stride: str | None
) -> None:
    """Filter threats in place. Does not save the model."""
    threat_list = model.get("threat_list") or {}
    threats = threat_list.get("threats") or []
    if not threats:
        return

    min_rank = _LIKELIHOOD_RANK.get((min_likelihood or "").lower(), 2)
    stride_set = {s.strip() for s in stride.split(",")} if stride else None

    model["threat_list"]["threats"] = [
        t
        for t in threats
        if _LIKELIHOOD_RANK.get((t.get("likelihood") or "").lower(), 2) <= min_rank
        and (stride_set is None or (t.get("stride_category") or "") in stride_set)
    ]


def format_threats_markdown(model: dict) -> str:
    """Render a model's threat list as markdown (no mitigations)."""
    name = model.get("name") or model.get("id", "")
    model_id = model.get("id", "")
    date = (model.get("created_at") or "")[:10]
    threats = (model.get("threat_list") or {}).get("threats") or []

    lines = [
        f"# Threats — {name}",
        f"Model: {model_id} | {len(threats)} threats | {date}",
        "",
    ]
    for i, t in enumerate(threats, 1):
        lines.append(f"## {i}. {t.get('name', 'Unknown')}")
        lines.append(
            f"**Likelihood:** {t.get('likelihood', '')} | "
            f"**STRIDE:** {t.get('stride_category', '')} | "
            f"**Target:** {t.get('target', '')}"
        )
        lines.append("")
        if t.get("description"):
            lines.append(t["description"])
            lines.append("")

    return "\n".join(lines)
