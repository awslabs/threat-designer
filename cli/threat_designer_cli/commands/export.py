"""
/export [id] — export a saved threat model to markdown, Word, PDF, or JSON.
"""

import asyncio
from pathlib import Path
from typing import Optional

from rich.console import Console

from ..storage import get_model, list_models


async def export_command(console: Console, model_id: str = "") -> None:
    # If no ID given, prompt
    if not model_id:
        models = list_models()
        if not models:
            console.print("[dim]No threat models found.[/dim]")
            return
        model_id = await asyncio.to_thread(_pick_model, models)
        if not model_id:
            return

    model = get_model(model_id)
    if not model:
        console.print(f"[red]Threat model not found:[/red] {model_id}")
        return

    result = await asyncio.to_thread(_run_export_wizard, model_id, model)
    if result is None:
        console.print("[dim]Cancelled.[/dim]")
        return

    out_path, fmt = result
    try:
        _write_export(model, out_path, fmt)
        console.print(f"\n[green]Exported:[/green] {out_path}\n")
    except Exception as exc:
        console.print(f"[red]Export failed:[/red] {exc}")


def _pick_model(models: list) -> Optional[str]:
    from InquirerPy import inquirer
    from InquirerPy.base.control import Choice

    choices = [
        Choice(
            m["id"],
            name=f"{m['id']}  {(m.get('title') or 'untitled')[:30]}  ({m.get('created_at', '')[:10]})",
        )
        for m in models
    ]
    return inquirer.select(message="Select threat model:", choices=choices).execute()


def _run_export_wizard(model_id: str, model: dict):
    from InquirerPy import inquirer
    from InquirerPy.base.control import Choice

    fmt = inquirer.select(
        message="Export format:",
        choices=[
            Choice("markdown", name="Markdown (.md)"),
            Choice("json", name="JSON (.json)"),
            Choice("word", name="Word (.docx)"),
            Choice("pdf", name="PDF (.pdf)"),
        ],
    ).execute()

    ext = {"markdown": "md", "json": "json", "word": "docx", "pdf": "pdf"}[fmt]
    title_slug = (model.get("title") or model_id).lower().replace(" ", "-")[:30]
    default_name = f"threat-model-{title_slug}-{model_id}.{ext}"

    out_path = inquirer.filepath(
        message="Output path:",
        default=str(Path.cwd() / default_name),
    ).execute()

    return out_path, fmt


def _write_export(model: dict, out_path: str, fmt: str) -> None:
    if fmt == "markdown":
        from ..exporters.markdown import export_markdown
        export_markdown(model, out_path)
    elif fmt == "json":
        from ..exporters.json_export import export_json
        export_json(model, out_path)
    elif fmt == "word":
        from ..exporters.word import export_word
        export_word(model, out_path)
    elif fmt == "pdf":
        from ..exporters.pdf import export_pdf
        export_pdf(model, out_path)
