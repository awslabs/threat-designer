"""
/list — display all locally saved threat models in a Rich table.
"""

from rich.console import Console
from rich.table import Table

from ..storage import list_models


def list_command(console: Console) -> None:
    models = list_models()
    if not models:
        console.print(
            "[dim]No threat models found. Use [bold]/create[/bold] to start one.[/dim]"
        )
        return

    table = Table(show_header=True, header_style="bold", box=None, padding=(0, 1))
    table.add_column("ID", style="cyan", no_wrap=True)
    table.add_column("Title", style="bold")
    table.add_column("Description", max_width=40)
    table.add_column("Threats", justify="right")
    table.add_column("Status", justify="center")
    table.add_column("Created", no_wrap=True)

    for m in models:
        threat_count = str(len((m.get("threat_list") or {}).get("threats", [])))
        status = m.get("status", "UNKNOWN")
        status_color = (
            "green"
            if status == "COMPLETE"
            else "yellow"
            if status == "RUNNING"
            else "red"
        )
        description = (m.get("description") or "")[:40]
        if len(m.get("description") or "") > 40:
            description += "..."
        created = (m.get("created_at") or "")[:10]
        table.add_row(
            m.get("id", "?"),
            m.get("title") or "[dim]untitled[/dim]",
            description or "[dim]—[/dim]",
            threat_count,
            f"[{status_color}]{status}[/{status_color}]",
            created,
        )

    console.print(table)
