"""Shared color constants and InquirerPy style."""

PURPLE = "#8575FF"

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
