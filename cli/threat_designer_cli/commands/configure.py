"""
/configure — interactive wizard to set model provider, credentials, and reasoning level.
Runs InquirerPy prompts in a thread to avoid asyncio event-loop conflicts with prompt_toolkit.
"""

import asyncio
from typing import Optional

from rich.console import Console
from rich.panel import Panel

from ..config import CLIConfig
from ..models import BEDROCK_MODELS, OPENAI_MODELS, REASONING_LEVELS, effort_label
from ..styles import inquirer_style


async def configure_command(console: Console) -> None:
    cfg = await asyncio.to_thread(_run_wizard)
    if cfg is None:
        console.print("[dim]Configure cancelled.[/dim]")
        return
    cfg.save()
    console.print(
        Panel(
            f"[green]Provider:[/green] {cfg.provider}\n"
            f"[green]Model:[/green]    {cfg.model_name}\n"
            f"[green]Effort:[/green]   {effort_label(cfg.reasoning_level)}",
            title="[bold green]Configuration saved[/bold green]",
            expand=False,
        )
    )


def _run_wizard() -> Optional[CLIConfig]:
    from InquirerPy import inquirer
    from InquirerPy.base.control import Choice

    s = inquirer_style()
    current = CLIConfig.load()

    provider_choice = inquirer.select(
        message="Model provider:",
        choices=["Amazon Bedrock", "OpenAI"],
        default="Amazon Bedrock" if current.provider == "bedrock" else "OpenAI",
        style=s,
    ).execute()

    if provider_choice == "Amazon Bedrock":
        aws_profile = (
            inquirer.text(
                message="AWS Profile (leave blank for default):",
                default=current.aws_profile or "",
                style=s,
            )
            .execute()
            .strip()
            or None
        )

        aws_region = (
            inquirer.text(
                message="AWS Region:",
                default=current.aws_region,
                style=s,
            )
            .execute()
            .strip()
            or "us-west-2"
        )

        _CUSTOM = "__custom__"
        model = inquirer.select(
            message="Model:",
            choices=[Choice(m["id"], name=m["name"]) for m in BEDROCK_MODELS]
            + [Choice(_CUSTOM, name="Custom model ID...")],
            default=current.model_id
            if current.provider == "bedrock"
            else BEDROCK_MODELS[1]["id"],
            style=s,
        ).execute()

        if model == _CUSTOM:
            model = (
                inquirer.text(
                    message="Enter Bedrock model ID:",
                    default=current.model_id if current.provider == "bedrock" else "",
                    style=s,
                )
                .execute()
                .strip()
            )

        model_props = next(
            (m for m in BEDROCK_MODELS if m["id"] == model),
            {
                "name": model,
                "adaptive": True,
                "supports_max": True,
            },
        )

        reasoning = inquirer.select(
            message="Effort:",
            choices=[Choice(r["value"], name=r["name"]) for r in REASONING_LEVELS],
            default=current.reasoning_level if current.provider == "bedrock" else 2,
            style=s,
        ).execute()

        return CLIConfig(
            provider="bedrock",
            aws_profile=aws_profile,
            aws_region=aws_region,
            model_id=model,
            model_name=model_props.get("name", model),
            reasoning_level=reasoning,
        )

    else:  # OpenAI
        api_key = (
            inquirer.secret(
                message="OpenAI API Key (leave blank to use OPENAI_API_KEY env var):",
                default="",
                style=s,
            )
            .execute()
            .strip()
            or None
        )

        model = inquirer.select(
            message="Model:",
            choices=[Choice(m["id"], name=m["name"]) for m in OPENAI_MODELS],
            default=current.model_id
            if current.provider == "openai"
            else OPENAI_MODELS[0]["id"],
            style=s,
        ).execute()

        model_props = next(m for m in OPENAI_MODELS if m["id"] == model)

        reasoning = inquirer.select(
            message="Effort:",
            choices=[Choice(r["value"], name=r["name"]) for r in REASONING_LEVELS],
            default=current.reasoning_level if current.provider == "openai" else 2,
            style=s,
        ).execute()

        return CLIConfig(
            provider="openai",
            model_id=model,
            model_name=model_props["name"],
            reasoning_level=reasoning,
            openai_api_key=api_key,
        )
