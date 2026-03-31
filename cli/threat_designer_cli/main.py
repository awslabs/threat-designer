"""Entry point for the threat-designer CLI."""

import asyncio
import os
import sys
import threading


__version__ = "0.8.9"


def run() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else None

    if cmd in ("--version", "-v"):
        print(f"threat-designer {__version__}")
        return
    elif cmd == "run":
        from .commands.run_cmd import run_headless

        asyncio.run(run_headless(sys.argv[2:]))
    elif cmd == "threats":
        from .commands.threats_cmd import threats_command

        threats_command(sys.argv[2:])
    else:
        from .repl import start_repl

        try:
            asyncio.run(start_repl())
        except KeyboardInterrupt:
            pass

    # If background threads linger (e.g. cancelled LangGraph run), force exit
    # to avoid the concurrent.futures atexit handler blocking on thread.join().
    if threading.active_count() > 1:
        os._exit(0)
