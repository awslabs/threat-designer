"""
run — headless (non-interactive) threat modeling run.

Usage:
    threat-designer run --name NAME --image PATH [options]

Progress is written to stderr; the job ID is printed to stdout on success.
This allows shell capture: JOB_ID=$(threat-designer run --name ... --image ...)
"""

import argparse
import asyncio
import json as _json
import sys
import threading as _threading
import time
import uuid
from pathlib import Path

from rich.console import Console
from rich.live import Live
from rich.spinner import Spinner
from rich.text import Text

from ..config import CLIConfig
from ..formatters import apply_threat_filters, format_threats_markdown
from ..models import effort_label
from ..runner.pipeline import run_workflow
from ..storage import get_model, save_model
from ..styles import (
    ACTIVE_COLOR,
    DONE_COLOR as _DONE_COLOR,
    TIME_COLOR as _TIME_COLOR,
    fmt_duration,
)

_EFFORT_MAP = {"off": 0, "low": 1, "medium": 2, "high": 3, "max": 4}


def _parse_args(argv: list) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="threat-designer run",
        description="Run threat modeling non-interactively.",
    )
    p.add_argument("--name", required=True, help="Threat model name")
    p.add_argument(
        "--image", required=True, help="Path to architecture diagram (PNG/JPG/PDF)"
    )
    p.add_argument("--description", default="", help="System description")
    p.add_argument(
        "--assumption",
        action="append",
        dest="assumptions",
        default=[],
        metavar="TEXT",
        help="Assumption to include (repeatable)",
    )
    p.add_argument(
        "--app-type",
        choices=["public", "internal", "hybrid"],
        default="hybrid",
        dest="app_type",
        help="Application exposure: public (internet-facing), internal (private network), hybrid (default)",
    )
    p.add_argument(
        "--effort",
        choices=list(_EFFORT_MAP),
        default=None,
        help="Override configured effort level (off/low/medium/high/max)",
    )
    p.add_argument(
        "--iterations",
        type=int,
        default=0,
        help="Number of iterations (default: 0 = Auto)",
    )
    p.add_argument(
        "--min-likelihood",
        choices=["high", "medium", "low"],
        default=None,
        dest="min_likelihood",
        help="Remove threats below this likelihood from the saved model (high/medium/low)",
    )
    p.add_argument(
        "--stride",
        default=None,
        help="Keep only these STRIDE categories, comma-separated (e.g. Spoofing,Tampering)",
    )
    p.add_argument(
        "--output-format",
        choices=["markdown", "json"],
        default="markdown",
        dest="output_format",
        help="stdout format: markdown (job ID + threat list, no mitigations) or json (full model)",
    )
    return p.parse_args(argv)


async def run_headless(argv: list) -> None:
    args = _parse_args(argv)

    if not Path(args.image).is_file():
        sys.stderr.write(f"error: image not found: {args.image}\n")
        sys.exit(1)

    cfg = CLIConfig.load()
    if not cfg.is_configured():
        sys.stderr.write(
            "error: not configured — run 'threat-designer' and use /configure first\n"
        )
        sys.exit(1)

    _APP_TYPE_MAP = {
        "public": "public_facing",
        "internal": "internal",
        "hybrid": "hybrid",
    }
    args.app_type = _APP_TYPE_MAP[args.app_type]

    if args.effort is not None:
        cfg = cfg.model_copy(update={"reasoning_level": _EFFORT_MAP[args.effort]})

    # All display goes to stderr — stdout is reserved for the job ID
    err = Console(stderr=True)

    job_id = str(uuid.uuid4())[:8]
    err.print(
        f"\n[cyan]{job_id}[/cyan] — [bold]{args.name}[/bold]\n"
        f"Model: {cfg.model_name}  |  Effort: {effort_label(cfg.reasoning_level)}"
        f"  |  Iterations: {args.iterations}\n"
    )

    is_tty = sys.stderr.isatty()

    completed: list = []
    event_log: list = []
    current = {"label": "Initializing", "start": time.monotonic()}
    error_holder: dict = {"error": None}
    done = {"value": False}
    stop_event = _threading.Event()

    def on_progress(label: str) -> None:
        events_snapshot = list(event_log)
        event_log.clear()
        now = time.monotonic()
        prev = current["label"]
        elapsed = now - current["start"]
        if prev and prev not in ("Initializing", "Complete", "Failed"):
            completed.append((prev, elapsed, events_snapshot))
            if not is_tty:
                err.print(f"●  {prev}  {fmt_duration(elapsed)}")
        current["label"] = label
        current["start"] = now
        if not is_tty and label == "Complete":
            err.print("●  Complete")

    def _on_event(label: str) -> None:
        if event_log:
            last = event_log[-1]
            base = last.split(" (x")[0] if " (x" in last else last
            if base == label:
                count = int(last[len(base) + 3 : -1]) + 1 if " (x" in last else 2
                event_log[-1] = f"{label} (x{count})"
                return
        event_log.append(label)

    def worker() -> None:
        try:
            run_workflow(
                name=args.name,
                description=args.description,
                assumptions=args.assumptions,
                image_path=args.image,
                iteration=args.iterations,
                app_type=args.app_type,
                cfg=cfg,
                job_id=job_id,
                on_progress=on_progress,
                on_event=_on_event,
                stop_event=stop_event,
            )
        except BaseException as exc:
            error_holder["error"] = exc
        finally:
            done["value"] = True

    thread = _threading.Thread(target=worker, daemon=True)
    thread.start()

    from .create import _render  # deferred to avoid circular import

    spinner = Spinner("dots", style=ACTIVE_COLOR)
    cancel_count = {"n": 0}

    if is_tty:
        with Live(console=err, refresh_per_second=12) as live:
            while not done["value"]:
                try:
                    live.update(
                        _render(
                            completed,
                            current["label"],
                            spinner,
                            event_log,
                            cancel_count["n"] > 0,
                        )
                    )
                    await asyncio.sleep(0.083)
                except (KeyboardInterrupt, asyncio.CancelledError):
                    cancel_count["n"] += 1
                    if cancel_count["n"] == 1:
                        spinner.text = Text(
                            " Press Ctrl+C again to cancel", style="yellow"
                        )
                    else:
                        stop_event.set()
                        done["value"] = True
                        break
            # Final static frame
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
            live.update(final)
    else:
        while not done["value"]:
            await asyncio.sleep(0.5)
    thread.join(timeout=2)

    if stop_event.is_set():
        err.print("\n[yellow]Cancelled.[/yellow]")
        sys.exit(1)

    if error_holder["error"]:
        err.print(f"\n[red]Error:[/red] {error_holder['error']}")
        sys.exit(1)

    model = get_model(job_id)

    if model and (args.min_likelihood or args.stride):
        before = len((model.get("threat_list") or {}).get("threats") or [])
        apply_threat_filters(model, args.min_likelihood, args.stride)
        after = len((model.get("threat_list") or {}).get("threats") or [])
        save_model(model)
        if before != after:
            err.print(f"[dim]Filtered threats: {before} → {after}[/dim]")

    if args.output_format == "json":
        print(_json.dumps(model, indent=2) if model else job_id)
    else:
        # markdown: job ID on line 1, then markdown threat list (no mitigations)
        print(job_id)
        if model:
            print(format_threats_markdown(model))
