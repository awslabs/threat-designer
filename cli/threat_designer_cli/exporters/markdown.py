"""Markdown export for threat models."""

from pathlib import Path
from typing import List


def export_markdown(model: dict, out_path: str) -> None:
    lines: List[str] = []
    _header(model, lines)
    _assets(model, lines)
    _flows(model, lines)
    _threats(model, lines)
    Path(out_path).write_text("\n".join(lines))


def _header(model: dict, lines: List[str]) -> None:
    title = model.get("title") or "Threat Model"
    lines += [
        f"# {title}",
        "",
        f"**ID:** {model.get('id', '—')}  ",
        f"**Created:** {(model.get('created_at') or '')[:10]}  ",
        f"**Description:** {model.get('description') or '—'}  ",
        "",
    ]
    if model.get("summary"):
        lines += [f"> {model['summary']}", ""]


def _assets(model: dict, lines: List[str]) -> None:
    assets = (model.get("assets") or {}).get("assets", [])
    if not assets:
        return
    lines += ["---", "", "## Assets", ""]
    lines.append("| Name | Type | Criticality | Description |")
    lines.append("|------|------|-------------|-------------|")
    for a in assets:
        lines.append(
            f"| {a.get('name', '')} | {a.get('type', '')} | {a.get('criticality', '')} | {a.get('description', '')} |"
        )
    lines.append("")


def _flows(model: dict, lines: List[str]) -> None:
    arch = model.get("system_architecture") or {}
    data_flows = arch.get("data_flows", [])
    trust_boundaries = arch.get("trust_boundaries", [])
    threat_sources = arch.get("threat_sources", [])

    if data_flows:
        lines += ["---", "", "## Data Flows", ""]
        lines.append("| From | To | Description |")
        lines.append("|------|----|-------------|")
        for f in data_flows:
            lines.append(
                f"| {f.get('source_entity', '')} | {f.get('target_entity', '')} | {f.get('flow_description', '')} |"
            )
        lines.append("")

    if trust_boundaries:
        lines += ["### Trust Boundaries", ""]
        lines.append("| From | To | Purpose |")
        lines.append("|------|----|---------|")
        for b in trust_boundaries:
            lines.append(
                f"| {b.get('source_entity', '')} | {b.get('target_entity', '')} | {b.get('purpose', '')} |"
            )
        lines.append("")

    if threat_sources:
        lines += ["### Threat Actors", ""]
        lines.append("| Category | Description | Examples |")
        lines.append("|----------|-------------|----------|")
        for s in threat_sources:
            lines.append(
                f"| {s.get('category', '')} | {s.get('description', '')} | {s.get('example', '')} |"
            )
        lines.append("")


def _threats(model: dict, lines: List[str]) -> None:
    threats = (model.get("threat_list") or {}).get("threats", [])
    if not threats:
        return

    lines += ["---", "", "## Threats", ""]

    # Group by STRIDE category
    by_category: dict = {}
    for t in threats:
        cat = t.get("stride_category", "Uncategorized")
        by_category.setdefault(cat, []).append(t)

    stride_order = [
        "Spoofing",
        "Tampering",
        "Repudiation",
        "Information Disclosure",
        "Denial of Service",
        "Elevation of Privilege",
    ]
    categories = sorted(
        by_category.keys(),
        key=lambda c: stride_order.index(c) if c in stride_order else 99,
    )

    for idx_cat, cat in enumerate(categories):
        lines += [f"### {cat}", ""]
        for t in by_category[cat]:
            mitigations = "\n".join(f"  - {m}" for m in (t.get("mitigations") or []))
            prereqs = ", ".join(t.get("prerequisites") or [])
            lines += [
                f"#### {t.get('name', 'Unnamed')}",
                "",
                f"| Field | Value |",
                f"|-------|-------|",
                f"| **Target** | {t.get('target', '—')} |",
                f"| **Likelihood** | {t.get('likelihood', '—')} |",
                f"| **Source** | {t.get('source', '—')} |",
                f"| **Vector** | {t.get('vector', '—')} |",
                f"| **Prerequisites** | {prereqs or '—'} |",
                "",
                f"**Impact:** {t.get('impact', '')}",
                "",
                f"**Description:** {t.get('description', '')}",
                "",
                "**Mitigations:**",
                mitigations,
                "",
            ]
