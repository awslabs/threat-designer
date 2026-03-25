"""Markdown export for threat models."""

import re
from pathlib import Path
from typing import List


def export_markdown(model: dict, out_path: str) -> None:
    lines: List[str] = []
    _header(model, lines)
    _assets(model, lines)
    _flows(model, lines)
    _threats(model, lines)
    _attack_trees(model, lines)
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


def _mermaid_escape(text: str) -> str:
    return text.replace('"', "'").replace("\n", " ").replace("\r", "")


def _build_id_map(nodes: list) -> dict:
    """Map original React Flow node IDs → short sequential IDs (N1, N2, …)."""
    return {node["id"]: f"N{i + 1}" for i, node in enumerate(nodes)}


def _heading_anchor(text: str) -> str:
    """GitHub-flavored Markdown heading → #anchor."""
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", "-", text.strip())
    return f"#{text}"


def _to_mermaid(tree: dict, id_map: dict) -> str:
    nodes = tree.get("nodes", [])
    edges = tree.get("edges", [])
    lines = ["graph TD"]
    clicks = []
    for node in nodes:
        sid = id_map[node["id"]]
        ntype = node["type"]
        data = node.get("data", {})
        label = _mermaid_escape(data.get("label", ""))
        if ntype == "root":
            lines.append(f'    {sid}(["{label}"])')
        elif ntype in ("and-gate", "or-gate"):
            gate = data.get("gateType", ntype.split("-")[0].upper())
            lines.append(f'    {sid}{{"{sid}<br/>{gate}"}}')
            anchor = _heading_anchor(f"{sid} — {gate} Gate")
            clicks.append(f'    click {sid} href "{anchor}"')
        elif ntype == "leaf-attack":
            lines.append(f'    {sid}["{sid}"]')
            anchor = _heading_anchor(f"{sid} — {data.get('label', '')}")
            clicks.append(f'    click {sid} href "{anchor}"')
    for edge in edges:
        src = id_map.get(edge["source"], edge["source"])
        tgt = id_map.get(edge["target"], edge["target"])
        lines.append(f"    {src} --> {tgt}")
    lines.extend(clicks)
    return "\n".join(lines)


def _node_details(nodes: list, id_map: dict, lines: List[str]) -> None:
    for node in nodes:
        sid = id_map[node["id"]]
        ntype = node["type"]
        d = node.get("data", {})

        if ntype in ("and-gate", "or-gate"):
            gate = d.get("gateType", ntype.split("-")[0].upper())
            lines += [
                f"#### {sid} — {gate} Gate",
                "",
                "| Field | Value |",
                "|-------|-------|",
                f"| **Type** | {gate} |",
                "",
                f"**Description:** {d.get('label') or '—'}",
                "",
            ]

        elif ntype == "leaf-attack":
            prereqs = "\n".join(f"  - {p}" for p in (d.get("prerequisites") or []))
            techniques = "\n".join(f"  - {t}" for t in (d.get("techniques") or []))
            lines += [
                f"#### {sid} — {d.get('label', '')}",
                "",
                "| Field | Value |",
                "|-------|-------|",
                f"| **Phase** | {d.get('attackChainPhase', '—')} |",
                f"| **Severity** | {d.get('impactSeverity', '—')} |",
                f"| **Likelihood** | {d.get('likelihood', '—')} |",
                f"| **Skill Level** | {d.get('skillLevel', '—')} |",
                "",
                f"**Description:** {d.get('description', '')}",
                "",
            ]
            if prereqs:
                lines += ["**Prerequisites:**", prereqs, ""]
            if techniques:
                lines += ["**Techniques:**", techniques, ""]


def _attack_trees(model: dict, lines: List[str]) -> None:
    attack_trees = model.get("attack_trees") or {}
    if not attack_trees:
        return
    lines += ["---", "", "## Attack Trees", ""]
    for threat_name, tree_data in attack_trees.items():
        nodes = tree_data.get("nodes", [])
        id_map = _build_id_map(nodes)
        lines += [f"### {threat_name}", ""]
        lines += ["```mermaid", _to_mermaid(tree_data, id_map), "```", ""]
        _node_details(nodes, id_map, lines)


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
