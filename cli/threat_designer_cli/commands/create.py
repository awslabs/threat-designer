"""
/create — wizard to start a new threat modeling run.
"""

import asyncio
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from rich.console import Console, Group
from rich.live import Live
from rich.spinner import Spinner
from rich.text import Text

from ..config import CLIConfig
from ..runner.pipeline import run_workflow
from ..styles import PURPLE, inquirer_style

_ACTIVE_COLOR = f"bold {PURPLE}"
_DONE_COLOR = "bold green"
_TIME_COLOR = "dim"


def _render(completed: list, current_label: str, spinner: Spinner) -> Group:
    items = []
    for label, duration in completed:
        t = Text()
        t.append("●  ", style=_DONE_COLOR)
        t.append(label, style="white")
        t.append(f"  {duration:.1f}s", style=_TIME_COLOR)
        items.append(t)
    if current_label:
        if completed:
            items.append(Text(""))  # blank line separator
        # Spinner char is 1 col wide; 4 spaces aligns label with the ● items above
        spinner.text = Text(f" {current_label}", style=_ACTIVE_COLOR)
        items.append(spinner)
    return Group(*items)


async def create_command(console: Console) -> None:
    cfg = CLIConfig.load()
    if not cfg.is_configured():
        console.print("[yellow]Run [bold]/configure[/bold] first to set up your model provider.[/yellow]")
        return

    params = await asyncio.to_thread(_run_create_wizard, cfg)
    if params is None:
        console.print("[dim]Cancelled.[/dim]")
        return

    from ..models import effort_label
    job_id = str(uuid.uuid4())[:8]
    iteration_label = "Auto" if params["iteration"] == 0 else str(params["iteration"])
    console.print(
        f"\nStarting [cyan]{job_id}[/cyan] — [bold]{params['name']}[/bold]\n"
        f"Model: {cfg.model_name}  |  Effort: {effort_label(cfg.reasoning_level)}  |  Iterations: {iteration_label}\n"
    )

    completed: list = []
    current = {"label": "Initializing", "start": time.monotonic()}
    error_holder: dict = {"error": None}
    done = {"value": False}

    def on_progress(label: str) -> None:
        now = time.monotonic()
        prev = current["label"]
        if prev and prev not in ("Initializing", "Complete", "Failed"):
            completed.append((prev, now - current["start"]))
        current["label"] = label
        current["start"] = now

    def worker() -> None:
        try:
            run_workflow(
                name=params["name"],
                description=params["description"],
                image_path=params["image_path"],
                iteration=params["iteration"],
                cfg=cfg,
                job_id=job_id,
                on_progress=on_progress,
            )
        except Exception as exc:
            error_holder["error"] = exc
        finally:
            done["value"] = True

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    cancelled = {"value": False}
    cancel_count = {"n": 0}

    spinner = Spinner("dots", style=_ACTIVE_COLOR)
    with Live(console=console, refresh_per_second=12) as live:
        while not done["value"]:
            try:
                live.update(_render(completed, current["label"], spinner))
                await asyncio.sleep(0.083)
            except (KeyboardInterrupt, asyncio.CancelledError):
                cancel_count["n"] += 1
                if cancel_count["n"] == 1:
                    spinner.text = Text("  Press Ctrl+C again to cancel", style="yellow")
                else:
                    cancelled["value"] = True
                    done["value"] = True
                    break
        # Final static frame
        final = Text()
        for idx, (label, duration) in enumerate(completed):
            if idx:
                final.append("\n")
            final.append("●  ", style=_DONE_COLOR)
            final.append(label, style="white")
            final.append(f"  {duration:.1f}s", style=_TIME_COLOR)
        live.update(final)
    thread.join(timeout=2)

    if cancelled["value"]:
        console.print("\n[yellow]Cancelled.[/yellow]\n")
        return

    if error_holder["error"]:
        console.print(f"\n[red]Error:[/red] {error_holder['error']}")
        return

    console.print(f"\n[green]Done![/green] Threat model saved as [cyan bold]{job_id}[/cyan bold]")
    console.print(f"  Use [bold]/export {job_id}[/bold] to export it.\n")


def _run_create_wizard(_cfg: CLIConfig) -> Optional[dict]:
    from InquirerPy import inquirer
    from InquirerPy.base.control import Choice

    s = inquirer_style()

    name = inquirer.text(message="Threat model name:", style=s).execute().strip()
    if not name:
        return None

    description = inquirer.text(
        message="Description (optional):", default="", style=s,
    ).execute().strip()

    image_path = inquirer.filepath(
        message="Architecture diagram path:",
        validate=lambda p: Path(p).is_file() or "File not found",
        style=s,
    ).execute()

    app_type = inquirer.select(
        message="Application type:",
        choices=["hybrid", "internal", "public_facing"],
        default="hybrid",
        style=s,
    ).execute()

    iteration = inquirer.select(
        message="Iterations:",
        choices=[
            Choice(0, name="Auto — agent decides when complete (recommended)"),
            Choice(1, name="1"),
            Choice(2, name="2"),
            Choice(3, name="3"),
            Choice(5, name="5"),
            Choice(7, name="7"),
            Choice(10, name="10"),
        ],
        default=0,
        style=s,
    ).execute()

    confirmed = inquirer.confirm(
        message=f"Start threat modeling for '{name}'?",
        default=True,
        style=s,
    ).execute()

    if not confirmed:
        return None

    return {
        "name": name,
        "description": description,
        "image_path": image_path,
        "app_type": app_type,
        "iteration": iteration,
    }
