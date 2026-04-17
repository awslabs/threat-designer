"""
/create — wizard to start a new threat modeling run.
"""

import asyncio
import threading as _threading
import time
import uuid
from pathlib import Path
from typing import Optional

from rich.console import Console, Group
from rich.live import Live
from rich.spinner import Spinner
from rich.text import Text

from ..config import CLIConfig
from ..models import effort_label, lookup_model
from ..runner.pipeline import run_pipeline, to_model_format, TASK_LABELS
from ..storage import save_model
from ..styles import (
    ACTIVE_COLOR,
    DONE_COLOR as _DONE_COLOR,
    PURPLE as _PURPLE,
    TIME_COLOR as _TIME_COLOR,
    fmt_duration,
    inquirer_style,
)

_LIKELIHOOD_ORDER = ["High", "Medium", "Low"]
_LIKELIHOOD_RANK = {lk: i for i, lk in enumerate(_LIKELIHOOD_ORDER)}

# Short labels for the task status bar (ordered)
_TASK_BAR_ITEMS = [
    ("summary", "Summary"),
    ("assets", "Assets"),
    ("data_flows", "Flows"),
    ("trust_boundaries", "Boundaries"),
    ("threat_sources", "Sources"),
    ("threats", "Threats"),
]


def _render_task_bar(task_statuses: dict) -> Text:
    """Render a compact task status bar: ● label  ● label  ..."""
    bar = Text()
    for i, (task_name, short_label) in enumerate(_TASK_BAR_ITEMS):
        if i:
            bar.append("  ")
        status = task_statuses.get(task_name, "pending")
        if status == "complete":
            bar.append("●", style="bold green")
        elif status == "in_progress":
            bar.append("●", style=f"bold {_PURPLE}")
        else:
            bar.append("●", style="dim")
        bar.append(f" {short_label}", style="white" if status != "pending" else "dim")
    return bar


def _render(
    completed: list,
    current_label: str,
    spinner: Spinner,
    event_log: Optional[list] = None,
    cancel_pending: bool = False,
    task_statuses: Optional[dict] = None,
) -> Group:
    items = []
    if task_statuses:
        items.append(_render_task_bar(task_statuses))
        items.append(Text(""))
    for label, duration, *rest in completed:
        events = rest[0] if rest else []
        t = Text()
        t.append("●  ", style=_DONE_COLOR)
        t.append(label, style="white")
        t.append(f"  {fmt_duration(duration)}", style=_TIME_COLOR)
        items.append(t)
        for entry in (events or [])[-20:]:
            items.append(Text(f"   \u2514 {entry}", style="dim"))
    if current_label:
        if completed:
            items.append(Text(""))  # blank line separator
        if not cancel_pending:
            spinner.text = Text(f" {current_label}", style=ACTIVE_COLOR)
        items.append(spinner)
        if event_log:
            for entry in event_log[-20:]:
                items.append(Text(f"   \u2514 {entry}", style="dim"))
    return Group(*items)


async def create_command(console: Console) -> None:
    cfg = CLIConfig.load()
    if not cfg.is_configured():
        console.print(
            "[yellow]Run [bold]/configure[/bold] first to set up your model provider.[/yellow]"
        )
        return

    params = await asyncio.to_thread(_run_create_wizard, cfg)
    if params is None:
        console.print("[dim]Cancelled.[/dim]")
        return

    model_props = lookup_model(cfg.provider, cfg.model_id)
    job_id = str(uuid.uuid4())[:8]
    iteration_label = "Auto" if params["iteration"] == 0 else str(params["iteration"])
    console.print(
        f"\nStarting [cyan]{job_id}[/cyan] — [bold]{params['name']}[/bold]\n"
        f"Model: {cfg.model_name}  |  Effort: {effort_label(cfg.reasoning_level, model_props)}  |  Iterations: {iteration_label}\n"
    )

    completed: list = []
    event_log: list = []
    task_statuses: dict = {}
    current = {"label": "Initializing", "start": time.monotonic()}
    error_holder: dict = {"error": None}
    done = {"value": False}
    stop_event = _threading.Event()

    def on_progress(label: str) -> None:
        events_snapshot = list(event_log)
        event_log.clear()
        now = time.monotonic()
        prev = current["label"]
        if prev and prev not in ("Initializing", "Complete", "Failed"):
            completed.append((prev, now - current["start"], events_snapshot))
        current["label"] = label
        current["start"] = now

    def _on_event(label: str) -> None:
        if event_log:
            last = event_log[-1]
            base = last.split(" (x")[0] if " (x" in last else last
            if base == label:
                count = int(last[len(base) + 3 : -1]) + 1 if " (x" in last else 2
                event_log[-1] = f"{label} (x{count})"
                return
        event_log.append(label)

    def on_pipeline_event(event_type: str, detail: str) -> None:
        if event_type == "task" and " -> " in detail:
            task_name, status = detail.split(" -> ", 1)
            task_statuses[task_name] = status
            if status == "in_progress":
                label = TASK_LABELS.get(task_name, task_name.replace("_", " ").title())
                on_progress(label)
        elif event_type == "tool":
            _on_event(detail)

    def worker() -> None:
        try:
            result = run_pipeline(
                image_path=params["image_path"],
                description=params["description"],
                assumptions=params["assumptions"],
                model_id=cfg.model_id,
                region=cfg.aws_region,
                reasoning_effort=effort_label(cfg.reasoning_level, model_props),
                application_type=params["app_type"],
                iteration=params["iteration"],
                on_event=on_pipeline_event,
                aws_profile=cfg.aws_profile,
                stop_event=stop_event,
                provider=cfg.provider,
                openai_api_key=cfg.effective_openai_key(),
            )
            if not (stop_event and stop_event.is_set()):
                on_progress("Complete")
                model = to_model_format(
                    result,
                    job_id=job_id,
                    name=params["name"],
                    description=params["description"],
                    assumptions=params["assumptions"],
                    app_type=params["app_type"],
                    image_path=params["image_path"],
                )
                save_model(model)
        except BaseException as exc:
            error_holder["error"] = exc
        finally:
            done["value"] = True

    thread = _threading.Thread(target=worker, daemon=True)
    thread.start()

    cancel_count = {"n": 0}
    prev_snapshot: tuple = ()

    spinner = Spinner("dots", style=ACTIVE_COLOR)
    with Live(spinner, console=console, refresh_per_second=8) as live:
        while not done["value"]:
            try:
                snapshot = (
                    len(completed),
                    current["label"],
                    len(event_log),
                    cancel_count["n"],
                    tuple(task_statuses.items()),
                )
                if snapshot != prev_snapshot:
                    prev_snapshot = snapshot
                    live.update(
                        _render(
                            completed,
                            current["label"],
                            spinner,
                            event_log,
                            cancel_count["n"] > 0,
                            task_statuses,
                        ),
                    )
                await asyncio.sleep(0.15)
            except (KeyboardInterrupt, asyncio.CancelledError):
                cancel_count["n"] += 1
                if cancel_count["n"] == 1:
                    spinner.text = Text(" Press Ctrl+C again to cancel", style="yellow")
                else:
                    stop_event.set()
                    done["value"] = True
                    break
        # Final static frame — include all completed steps plus the terminal label
        final_items: list = []
        if task_statuses:
            final_items.append(_render_task_bar(task_statuses))
            final_items.append(Text(""))
        final = Text()
        for idx, (label, duration, *rest) in enumerate(completed):
            events = rest[0] if rest else []
            if idx:
                final.append("\n")
            final.append("●  ", style=_DONE_COLOR)
            final.append(label, style="white")
            final.append(f"  {fmt_duration(duration)}", style=_TIME_COLOR)
            for entry in (events or [])[-20:]:
                final.append(f"\n   \u2514 {entry}", style="dim")
        if current["label"] == "Complete":
            if completed:
                final.append("\n")
            final.append("●  ", style=_DONE_COLOR)
            final.append("Complete", style="white")
        final_items.append(final)
        live.update(Group(*final_items))
    thread.join(timeout=2)

    if stop_event.is_set():
        console.print("\n[yellow]Cancelled.[/yellow]\n")
        return

    if error_holder["error"]:
        if isinstance(error_holder["error"], KeyboardInterrupt):
            console.print("\n[yellow]Cancelled.[/yellow]\n")
        else:
            console.print(f"\n[red]Error:[/red] {error_holder['error']}")
        return

    console.print(
        f"\n[green]Done![/green] Threat model saved as [cyan bold]{job_id}[/cyan bold]"
    )

    from ..storage import get_model

    model = get_model(job_id)
    if model:
        _print_summary(console, model)
        _print_token_usage(console, model)

    if params.get("generate_trees") and model:
        threats = (model.get("threat_list") or {}).get("threats", [])
        likelihoods = {lk.capitalize() for lk in params["tree_likelihoods"]}
        filtered = sorted(
            [
                t
                for t in threats
                if (t.get("likelihood") or "").capitalize() in likelihoods
            ],
            key=lambda t: _LIKELIHOOD_RANK.get(
                (t.get("likelihood") or "").capitalize(), 99
            ),
        )
        selected = filtered[: params["max_trees"]]
        if selected:
            console.print(
                f"\nGenerating [bold]{len(selected)}[/bold] attack tree(s)...\n"
            )
            from .attack_tree_cmd import _run_attack_tree_loop

            trees_cancelled = await _run_attack_tree_loop(console, cfg, model, selected)
            if not trees_cancelled and model.get("attack_trees"):
                save_model(model)
                console.print(
                    f"  Attack trees saved. Use [bold]/export {job_id}[/bold] "
                    "and choose Markdown to include them.\n"
                )
        else:
            console.print("[dim]No threats matched the selected likelihoods.[/dim]\n")

    console.print(f"  Use [bold]/export {job_id}[/bold] to export it.\n")


def _print_summary(console: Console, model: dict) -> None:
    arch = model.get("system_architecture") or {}
    assets = (model.get("assets") or {}).get("assets", [])
    flows = arch.get("data_flows", [])
    boundaries = arch.get("trust_boundaries", [])
    threats = (model.get("threat_list") or {}).get("threats", [])

    by_likelihood: dict = {}
    for t in threats:
        lk = (t.get("likelihood") or "Unknown").capitalize()
        by_likelihood[lk] = by_likelihood.get(lk, 0) + 1

    lk_parts = [
        f"[bold]{by_likelihood[lk]}[/bold] {lk}"
        for lk in _LIKELIHOOD_ORDER
        if lk in by_likelihood
    ]
    for lk, count in by_likelihood.items():
        if lk not in _LIKELIHOOD_ORDER:
            lk_parts.append(f"[bold]{count}[/bold] {lk}")

    console.print(
        f"  Assets: [bold]{len(assets)}[/bold]  |  "
        f"Flows: [bold]{len(flows)}[/bold]  |  "
        f"Boundaries: [bold]{len(boundaries)}[/bold]  |  "
        f"Threats: [bold]{len(threats)}[/bold]"
        + (f"  ({',  '.join(lk_parts)})" if lk_parts else "")
    )


def _print_token_usage(console: Console, model: dict) -> None:
    usage = model.get("token_usage")
    if not usage:
        return

    def _fmt(n: int) -> str:
        if n >= 1_000_000:
            return f"{n / 1_000_000:.1f}M"
        if n >= 1_000:
            return f"{n / 1_000:.1f}K"
        return str(n)

    parts = [
        f"In: [bold]{_fmt(usage['input_tokens'])}[/bold]",
        f"Out: [bold]{_fmt(usage['output_tokens'])}[/bold]",
    ]
    cache_read = usage.get("cache_read_input_tokens", 0)
    cache_create = usage.get("cache_creation_input_tokens", 0)
    if cache_read or cache_create:
        parts.append(f"Cache read: [bold]{_fmt(cache_read)}[/bold]")
        parts.append(f"Cache write: [bold]{_fmt(cache_create)}[/bold]")
    parts.append(f"Calls: [bold]{usage.get('total_calls', 0)}[/bold]")

    console.print(f"  Tokens: {' | '.join(parts)}")


def _run_create_wizard(_cfg: CLIConfig) -> Optional[dict]:
    from InquirerPy import inquirer
    from InquirerPy.base.control import Choice

    s = inquirer_style()

    name = inquirer.text(message="Threat model name:", style=s).execute().strip()
    if not name:
        return None

    description = (
        inquirer.text(
            message="Description (optional):",
            default="",
            style=s,
        )
        .execute()
        .strip()
    )

    assumptions = []
    while True:
        prompt = (
            f"Assumption {len(assumptions) + 1}:"
            if assumptions
            else "Assumptions (optional — empty to skip):"
        )
        val = inquirer.text(message=prompt, default="", style=s).execute().strip()
        if not val:
            break
        assumptions.append(val)

    app_type = inquirer.select(
        message="Application type:",
        choices=[
            Choice("hybrid", name="Hybrid — both public and internal components"),
            Choice(
                "public_facing",
                name="Public — internet-facing, accessible by anonymous users",
            ),
            Choice(
                "internal", name="Internal — private network only, controlled access"
            ),
        ],
        default="hybrid",
        style=s,
    ).execute()

    image_path = inquirer.filepath(
        message="Architecture diagram path:",
        validate=lambda p: Path(p).is_file() or "File not found",
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

    generate_trees = inquirer.confirm(
        message="Generate attack trees after threat modeling?",
        default=False,
        style=s,
    ).execute()

    tree_likelihoods: list = []
    max_trees = 5
    if generate_trees:
        tree_likelihoods = inquirer.checkbox(
            message="Include threats of likelihood:",
            choices=[
                Choice("High", name="High"),
                Choice("Medium", name="Medium"),
                Choice("Low", name="Low"),
            ],
            instruction="(Space to select, a to toggle all, Enter to confirm)",
            style=s,
        ).execute()
        if not tree_likelihoods:
            generate_trees = False
        else:
            max_val = inquirer.text(
                message="Max attack trees:",
                default="5",
                validate=lambda v: (v.isdigit() and int(v) > 0)
                or "Enter a positive number",
                style=s,
            ).execute()
            max_trees = int(max_val)

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
        "assumptions": assumptions,
        "app_type": app_type,
        "image_path": image_path,
        "iteration": iteration,
        "generate_trees": generate_trees,
        "tree_likelihoods": tree_likelihoods,
        "max_trees": max_trees,
    }
