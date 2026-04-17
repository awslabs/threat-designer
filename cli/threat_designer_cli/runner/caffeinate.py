"""
Prevent macOS from sleeping while a long-running workflow is active.

Uses the built-in `caffeinate` command. No-op on non-macOS platforms.
"""

import subprocess
import sys
from contextlib import contextmanager


@contextmanager
def prevent_sleep():
    """Context manager that prevents macOS sleep for the duration of the block."""
    if sys.platform != "darwin":
        yield
        return

    try:
        proc = subprocess.Popen(
            ["caffeinate", "-ims"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        yield
        return

    try:
        yield
    finally:
        proc.terminate()
        proc.wait(timeout=5)
