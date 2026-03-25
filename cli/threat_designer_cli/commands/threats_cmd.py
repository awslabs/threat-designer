"""
threats — print the threat list for a saved model.

Usage:
    threat-designer threats <id> [--output-format markdown|json]
                                 [--min-likelihood high|medium|low]
                                 [--stride CATEGORIES]

Outputs to stdout. Default format is markdown (no mitigations).
Filters are applied to the output only — the saved model is not modified.
"""

import argparse
import copy
import json
import sys


def _parse_args(argv: list) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="threat-designer threats",
        description="Print the threat list for a saved model.",
    )
    p.add_argument("id", help="Threat model ID")
    p.add_argument(
        "--output-format",
        choices=["markdown", "json"],
        default="markdown",
        dest="output_format",
        help="Output format: markdown (no mitigations) or json (threats array only)",
    )
    p.add_argument(
        "--min-likelihood",
        choices=["high", "medium", "low"],
        default=None,
        dest="min_likelihood",
        help="Exclude threats below this likelihood (high/medium/low)",
    )
    p.add_argument(
        "--stride",
        default=None,
        help="Keep only these STRIDE categories, comma-separated (e.g. Spoofing,Tampering)",
    )
    return p.parse_args(argv)


def threats_command(argv: list) -> None:
    args = _parse_args(argv)

    from ..storage import get_model
    from ..formatters import apply_threat_filters, format_threats_markdown

    model = get_model(args.id)
    if not model:
        sys.stderr.write(f"error: model not found: {args.id}\n")
        sys.exit(1)

    if args.min_likelihood or args.stride:
        model = copy.deepcopy(model)
        apply_threat_filters(model, args.min_likelihood, args.stride)

    if args.output_format == "json":
        threats = (model.get("threat_list") or {}).get("threats") or []
        print(json.dumps(threats, indent=2))
    else:
        print(format_threats_markdown(model))
