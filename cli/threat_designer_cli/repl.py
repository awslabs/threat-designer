"""
Interactive REPL session for Threat Designer CLI.
Entry: type `threat-designer` to start, then use /commands.
"""

import asyncio
import sys

from prompt_toolkit import PromptSession
from prompt_toolkit.completion import WordCompleter
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.keys import Keys
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style

from rich.console import Console
from rich.panel import Panel
from rich.text import Text

COMMANDS = [
    "/configure",
    "/create",
    "/export",
    "/list",
    "/delete",
    "/attack-tree",
    "/help",
    "/quit",
]

_TOOLBAR_STYLE = Style.from_dict({"bottom-toolbar": "bg:#1a1a2e #6c6c8a"})
_TOOLBAR_HTML = HTML("  " + "  <b>·</b>  ".join(f"<b>{c}</b>" for c in COMMANDS))


_HELP_TEXT = (
    "[bold]/configure[/bold]         Set model provider, credentials, and reasoning level\n"
    "[bold]/create[/bold]            Start a new threat modeling run\n"
    "[bold]/list[/bold]              Show all saved threat models\n"
    "[bold]/export \\[id][/bold]       Export a threat model (markdown, Word, PDF, JSON)\n"
    "[bold]/delete \\[id][/bold]       Delete a saved threat model\n"
    "[bold]/attack-tree \\[id][/bold]  Generate attack trees for a threat model\n"
    "[bold]/help[/bold]              Show this help\n"
    "[bold]/quit[/bold]              Quit"
)


def _enter_alt_screen() -> None:
    sys.stdout.write("\033]0;Threat Designer\007")
    sys.stdout.write("\033[?1049h")  # switch to alternate screen buffer
    sys.stdout.write("\033[3J")  # erase saved lines (clear scrollback)
    sys.stdout.write("\033[2J")  # clear visible screen
    sys.stdout.write("\033[H")  # cursor to home
    sys.stdout.flush()


def _exit_alt_screen() -> None:
    sys.stdout.write("\033[?1049l")
    sys.stdout.write("\033]0;\007")
    sys.stdout.flush()


async def start_repl() -> None:
    console = Console()
    completer = WordCompleter(COMMANDS, sentence=True, ignore_case=True)

    kb = KeyBindings()

    @kb.add(Keys.Escape, eager=True)
    def _esc_quit(event) -> None:
        event.app.exit(exception=EOFError())

    session: PromptSession = PromptSession(
        completer=completer,
        complete_while_typing=True,
        bottom_toolbar=_TOOLBAR_HTML,
        style=_TOOLBAR_STYLE,
        key_bindings=kb,
    )

    _enter_alt_screen()
    try:
        _print_welcome(console)

        while True:
            try:
                text = await session.prompt_async("❯ ")
                text = text.strip()
                if not text:
                    continue
                await _dispatch(text, console)
            except KeyboardInterrupt:
                console.print("[dim]  (Use /quit to quit)[/dim]")
                continue
            except (EOFError, SystemExit, asyncio.CancelledError):
                try:
                    console.print("\n[dim]Goodbye.[/dim]")
                except Exception:
                    pass
                break
            except Exception as exc:
                console.print(f"[red]Unexpected error:[/red] {exc}")
    finally:
        _exit_alt_screen()


async def _dispatch(text: str, console: Console) -> None:
    parts = text.split(maxsplit=1)
    cmd = parts[0].lower()
    args = parts[1].strip() if len(parts) > 1 else ""

    if cmd == "/configure":
        from .commands.configure import configure_command

        await configure_command(console)

    elif cmd == "/create":
        from .commands.create import create_command

        await create_command(console)

    elif cmd == "/export":
        from .commands.export import export_command

        await export_command(console, args)

    elif cmd == "/list":
        from .commands.list_cmd import list_command

        list_command(console)

    elif cmd == "/delete":
        from .commands.delete import delete_command

        await delete_command(console, args)

    elif cmd == "/attack-tree":
        from .commands.attack_tree_cmd import attack_tree_command

        await attack_tree_command(console, args)

    elif cmd == "/help":
        console.print(Panel(_HELP_TEXT, title="Commands", expand=False))

    elif cmd == "/quit":
        raise SystemExit(0)

    else:
        console.print(
            f"[red]Unknown command:[/red] [bold]{cmd}[/bold]  "
            "— type [bold]/help[/bold] for available commands"
        )


def _print_welcome(console: Console) -> None:
    from .config import CLIConfig

    cfg = CLIConfig.load()
    configured = cfg.is_configured()

    if configured:
        from .models import effort_label

        status = (
            f"[#8575FF]{cfg.model_name}[/#8575FF]  |  "
            f"Effort: [#8575FF]{effort_label(cfg.reasoning_level)}[/#8575FF]"
        )
    else:
        status = "[yellow]Not configured — run /configure to get started[/yellow]"

    console.print(
        Panel(
            Text.from_markup(
                f"[bold]Threat Designer[/bold]  [dim]CLI[/dim]\n\n"
                f"{status}\n\n"
                "[dim]Type /help for commands[/dim]"
            ),
            expand=False,
        )
    )
