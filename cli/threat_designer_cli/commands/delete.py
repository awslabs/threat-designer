"""
/delete [id] — delete a saved threat model.
"""

import asyncio
from typing import Optional

from rich.console import Console

from ..storage import delete_model, list_models
from ..styles import inquirer_style


async def delete_command(console: Console, model_id: str = "") -> None:
    models = list_models()
    if not models:
        console.print("[dim]No threat models found.[/dim]")
        return

    result = await asyncio.to_thread(_run_delete_wizard, models, model_id)
    if result is None:
        console.print("[dim]Cancelled.[/dim]")
        return

    model_id_to_delete, confirmed = result
    if not confirmed:
        console.print("[dim]Cancelled.[/dim]")
        return

    if delete_model(model_id_to_delete):
        console.print(f"[green]Deleted[/green] [cyan bold]{model_id_to_delete}[/cyan bold]")
    else:
        console.print(f"[red]Not found:[/red] {model_id_to_delete}")


def _run_delete_wizard(models: list, model_id: str) -> Optional[tuple]:
    from InquirerPy import inquirer
    from InquirerPy.base.control import Choice

    s = inquirer_style()

    if not model_id:
        choices = [
            Choice(
                m["id"],
                name=f"{m['id']}  {(m.get('title') or 'untitled')[:40]}  ({m.get('created_at', '')[:10]})",
            )
            for m in models
        ]
        model_id = inquirer.select(
            message="Select threat model to delete:",
            choices=choices,
            style=s,
        ).execute()

    model = next((m for m in models if m["id"] == model_id), None)
    title = (model.get("title") or model_id) if model else model_id

    confirmed = inquirer.confirm(
        message=f"Delete '{title}'? This cannot be undone.",
        default=False,
        style=s,
    ).execute()

    return model_id, confirmed
