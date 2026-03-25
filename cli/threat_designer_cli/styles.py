"""Shared color constants, formatting helpers, and InquirerPy style."""

PURPLE = "#8575FF"
ACTIVE_COLOR = f"bold {PURPLE}"
DONE_COLOR = "bold green"
TIME_COLOR = "dim"


def fmt_duration(seconds: float) -> str:
    s = int(seconds)
    if s < 60:
        return f"{seconds:.1f}s"
    m, s = divmod(s, 60)
    if m < 60:
        return f"{m}m {s}s"
    h, m = divmod(m, 60)
    return f"{h}h {m}m {s}s"


# Raw dict — converted via get_style() at call sites
STYLE_DICT = {
    "questionmark": f"{PURPLE} bold",
    "answermark": f"{PURPLE} bold",
    "answer": PURPLE,
    "input": PURPLE,
    "question": "bold",
    "pointer": f"{PURPLE} bold",
    "highlighted": f"{PURPLE} bold",
    "selected": PURPLE,
    "separator": "default",
    "instruction": "default",
}


def inquirer_style():
    """Return a properly wrapped InquirerPy Style object."""
    from InquirerPy import get_style

    return get_style(STYLE_DICT, style_override=False)
