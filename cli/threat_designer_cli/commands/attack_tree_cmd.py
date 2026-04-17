"""
/attack-tree [id] — generate attack trees for threats in a saved model.
"""

import asyncio
import threading
from collections import deque
from typing import Optional

from rich.console import Console, Group
from rich.live import Live
from rich.spinner import Spinner
from rich.text import Text

from ..config import CLIConfig
from ..storage import get_model, list_models, save_model
from ..styles import ACTIVE_COLOR, inquirer_style


def _fmt_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


async def _run_attack_tree_loop(
    console: Console,
    cfg: CLIConfig,
    model_data: dict,
    selected_threats: list,
) -> bool:
    """
    Generate attack trees for each threat in selected_threats.
    Updates model_data['attack_trees'] in place.
    Returns True if the user cancelled, False if all trees completed.
    """
    from ..runner.attack_tree import run_attack_tree

    attack_trees: dict = dict(model_data.get("attack_trees") or {})
    total = len(selected_threats)

    for idx, threat in enumerate(selected_threats, 1):
        threat_name = threat.get("name", f"threat-{idx}")
        console.print(f"\n[{idx}/{total}] [bold]{threat_name}[/bold]")

        result_holder: dict = {
            "tree": None,
            "error": None,
            "done": False,
            "cancelled": False,
        }
        tool_log: deque = deque(maxlen=20)
        stop_event = threading.Event()

        def _on_event(label: str) -> None:
            tool_log.append(label)

        def worker(t=threat):
            try:
                result_holder["tree"] = run_attack_tree(
                    t, model_data, cfg, on_event=_on_event, stop_event=stop_event
                )
            except BaseException as exc:
                result_holder["error"] = exc
            finally:
                result_holder["done"] = True

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

        cancel_count = {"n": 0}
        prev_snapshot: tuple = ()
        spinner = Spinner(
            "dots", text=Text(" Initializing", style=ACTIVE_COLOR), style=ACTIVE_COLOR
        )
        with Live(spinner, console=console, refresh_per_second=8) as live:
            while not result_holder["done"]:
                try:
                    if cancel_count["n"] > 0:
                        spinner.text = Text(
                            " Press Ctrl+C again to cancel", style="yellow"
                        )
                    elif tool_log:
                        spinner.text = Text(f" {tool_log[-1]}", style=ACTIVE_COLOR)
                    snapshot = (len(tool_log), cancel_count["n"])
                    if snapshot != prev_snapshot:
                        prev_snapshot = snapshot
                        items: list = [spinner]
                        for entry in tool_log:
                            items.append(Text(f"   \u2514 {entry}", style="dim"))
                        live.update(Group(*items))
                    await asyncio.sleep(0.15)
                except (KeyboardInterrupt, asyncio.CancelledError):
                    cancel_count["n"] += 1
                    if cancel_count["n"] >= 2:
                        stop_event.set()
                        result_holder["cancelled"] = True
                        result_holder["done"] = True
                        break
            # Final static frame
            if not result_holder["cancelled"]:
                header = Text()
                if result_holder["tree"]:
                    node_count = len(result_holder["tree"].get("nodes", []))
                    usage = result_holder["tree"].get("token_usage")
                    header.append("●  ", style="bold green")
                    header.append("Generated attack tree", style="white")
                    header.append(f"  {node_count} nodes", style="dim")
                    if usage:
                        header.append(
                            f"  (In: {_fmt_tokens(usage['input_tokens'])}"
                            f"  Out: {_fmt_tokens(usage['output_tokens'])})",
                            style="dim",
                        )
                elif result_holder["error"]:
                    header.append("●  ", style="bold red")
                    header.append("Failed", style="white")
                else:
                    header.append("●  ", style="bold red")
                    header.append("No result", style="white")
                items = [header]
                for entry in tool_log:
                    items.append(Text(f"   \u2514 {entry}", style="dim"))
                live.update(Group(*items))
        thread.join(timeout=2)

        if result_holder["cancelled"]:
            console.print("[yellow]Cancelled.[/yellow]")
            model_data["attack_trees"] = attack_trees
            return True

        if result_holder["error"]:
            console.print(f"[red]Error:[/red] {result_holder['error']}")
        if result_holder["tree"]:
            attack_trees[threat_name] = result_holder["tree"]

    model_data["attack_trees"] = attack_trees
    return False


async def attack_tree_command(console: Console, model_id: str = "") -> None:
    cfg = CLIConfig.load()
    if not cfg.is_configured():
        console.print(
            "[yellow]Run [bold]/configure[/bold] first to set up your model provider.[/yellow]"
        )
        return

    models = list_models()
    if not models:
        console.print("[dim]No threat models found.[/dim]")
        return

    result = await asyncio.to_thread(_run_wizard, models, model_id)
    if result is None:
        console.print("[dim]Cancelled.[/dim]")
        return

    model_id_selected, threat_names = result
    model_data = get_model(model_id_selected)
    if not model_data:
        console.print(f"[red]Model not found:[/red] {model_id_selected}")
        return

    threats = (model_data.get("threat_list") or {}).get("threats", [])
    selected = [t for t in threats if t.get("name") in threat_names]
    if not selected:
        console.print("[dim]No matching threats found.[/dim]")
        return

    cancelled = await _run_attack_tree_loop(console, cfg, model_data, selected)

    if not cancelled and model_data.get("attack_trees"):
        # Aggregate token usage across all generated trees
        totals = {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read": 0,
            "cache_create": 0,
            "calls": 0,
        }
        for tree in model_data["attack_trees"].values():
            u = tree.get("token_usage")
            if u:
                totals["input_tokens"] += u.get("input_tokens", 0)
                totals["output_tokens"] += u.get("output_tokens", 0)
                totals["cache_read"] += u.get("cache_read_input_tokens", 0)
                totals["cache_create"] += u.get("cache_creation_input_tokens", 0)
                totals["calls"] += u.get("total_calls", 0)
        if totals["input_tokens"] or totals["output_tokens"]:
            parts = [
                f"In: [bold]{_fmt_tokens(totals['input_tokens'])}[/bold]",
                f"Out: [bold]{_fmt_tokens(totals['output_tokens'])}[/bold]",
            ]
            if totals["cache_read"] or totals["cache_create"]:
                parts.append(
                    f"Cache read: [bold]{_fmt_tokens(totals['cache_read'])}[/bold]"
                )
                parts.append(
                    f"Cache write: [bold]{_fmt_tokens(totals['cache_create'])}[/bold]"
                )
            parts.append(f"Calls: [bold]{totals['calls']}[/bold]")
            console.print(f"\n  Tokens: {' | '.join(parts)}")

        save_model(model_data)
        console.print(
            f"\n[green]Saved![/green] Use [bold]/export {model_id_selected}[/bold] "
            "and choose Markdown to include the Mermaid attack trees.\n"
        )


def _run_wizard(models: list, model_id: str) -> Optional[tuple]:
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
            message="Select threat model:",
            choices=choices,
            style=s,
        ).execute()

    model_data = next((m for m in models if m["id"] == model_id), None)
    if not model_data:
        return None

    threats = (model_data.get("threat_list") or {}).get("threats", [])
    if not threats:
        return None

    existing_trees = set((model_data.get("attack_trees") or {}).keys())
    threat_choices = [
        Choice(
            t.get("name"),
            name=f"{t.get('name', '')}  [{t.get('stride_category', '')}]"
            + (" ✓" if t.get("name") in existing_trees else ""),
        )
        for t in threats
    ]

    selected = inquirer.checkbox(
        message="Generate attack trees for:",
        choices=threat_choices,
        instruction="(Space to select, a to toggle all, Enter to confirm)",
        style=s,
    ).execute()

    if not selected:
        return None

    threat_names = selected

    confirmed = inquirer.confirm(
        message=f"Generate {len(threat_names)} attack tree{'s' if len(threat_names) > 1 else ''}?",
        default=True,
        style=s,
    ).execute()

    if not confirmed:
        return None

    return model_id, threat_names
