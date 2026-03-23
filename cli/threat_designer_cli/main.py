"""Entry point for the threat-designer CLI."""

import asyncio


def run() -> None:
    from .repl import start_repl
    try:
        asyncio.run(start_repl())
    except KeyboardInterrupt:
        pass
