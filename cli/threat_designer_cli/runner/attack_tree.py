"""
Local attack tree generator — runs the real attack_tree_workflow and captures
the final AttackTreeLogical from state before the DynamoDB save step.

No structured output, no forced tool_choice → fully compatible with reasoning.
"""

import threading
import uuid
from typing import Callable, Optional

from ..config import CLIConfig


def _fmt_event(name: str, args: dict) -> str:
    if name == "create_attack_tree":
        goal = (args.get("goal") or "")[:50]
        return f"create_attack_tree: {goal}" if goal else name
    if name == "add_attack_node":
        node = args.get("node") or {}
        label = (node.get("name") or node.get("description") or "")[:50]
        return f"add_attack_node: {label}" if label else name
    if name == "update_attack_node":
        return f"update_attack_node @ {args.get('node_path', [])}"
    if name == "delete_attack_node":
        return f"delete_attack_node @ {args.get('node_path', [])}"
    return name


def run_attack_tree(
    threat: dict,
    model_data: dict,
    cfg: CLIConfig,
    on_event: Optional[Callable[[str], None]] = None,
    stop_event: Optional[threading.Event] = None,
) -> Optional[dict]:
    """
    Generate an attack tree for a single threat by running the real workflow.
    Streams state updates and captures the final AttackTreeLogical before the
    DynamoDB save step (which has no table in CLI context).
    Returns React Flow {nodes, edges} dict, or None on failure.
    """
    from .pipeline import _ensure_backend_path, _suppress_logging, _setup_env

    _ensure_backend_path()
    _suppress_logging()
    _setup_env(cfg)

    import state_tracking_service  # type: ignore
    from .local_state import LocalStateService

    state_tracking_service.StateService = LocalStateService

    import workflow_attack_tree  # type: ignore

    workflow_attack_tree.state_service = LocalStateService()

    from model_utils import initialize_models  # type: ignore
    from attack_tree_models import AttackTreeConverter  # type: ignore
    from workflow_attack_tree import attack_tree_workflow  # type: ignore

    from attack_tree_prompts import (  # type: ignore
        create_attack_tree_system_prompt,
        create_attack_tree_human_message,
    )

    models = initialize_models(reasoning=cfg.reasoning_level, job_id="attack-tree")
    model = models.get("attack_tree_agent_model") or models["threats_agent_model"]

    # Build context from saved model data (mirrors what the full-stack workflow
    # fetches from DynamoDB/S3, but sourced locally instead).
    context_parts = []

    if model_data.get("description"):
        context_parts.append(f"Threat Model Description:\n{model_data['description']}")

    threat_target = threat.get("target")
    for asset in (model_data.get("assets") or {}).get("assets", []):
        if asset.get("name") == threat_target:
            asset_text = (
                f"Name: {asset['name']}\nDescription: {asset.get('description', '')}"
            )
            if asset.get("data_classification"):
                asset_text += f"\nData Classification: {asset['data_classification']}"
            context_parts.append(f"Target Asset:\n{asset_text}")
            break

    threat_source_name = threat.get("source")
    sys_arch = model_data.get("system_architecture") or {}
    for ts in sys_arch.get("threat_sources", []):
        if ts.get("category") == threat_source_name:
            source_text = (
                f"Category: {ts['category']}\n"
                f"Description: {ts.get('description', '')}\n"
                f"Example: {ts.get('example', '')}"
            )
            if ts.get("capabilities"):
                source_text += f"\nCapabilities: {', '.join(ts['capabilities'])}"
            context_parts.append(f"Threat Source:\n{source_text}")
            break

    threat_model_context = "\n\n".join(context_parts) if context_parts else None

    # Load architecture image if path was saved with the model
    import base64 as _b64

    architecture_image = None
    image_path = model_data.get("image_path")
    if image_path:
        try:
            with open(image_path, "rb") as fh:
                architecture_image = _b64.b64encode(fh.read()).decode()
        except Exception:
            pass

    # Pre-populate messages so agent_node skips its DynamoDB/S3 fetch
    initial_messages = [
        create_attack_tree_system_prompt(),
        create_attack_tree_human_message(
            threat_object=threat,
            threat_model_context=threat_model_context,
            architecture_image=architecture_image,
        ),
    ]

    initial_state = {
        "attack_tree_id": str(uuid.uuid4())[:8],
        "threat_model_id": "",
        "threat_name": threat.get("name", ""),
        "threat_description": threat.get("description", ""),
        "owner": "cli",
        "attack_tree": None,
        "tool_use": 0,
        "validate_tool_use": 0,
        "validate_called_since_reset": False,
        "start_time": None,
        "messages": initial_messages,
    }

    agent_config = {
        "configurable": {
            "model_attack_tree_agent": model,
        },
        "recursion_limit": 100,
    }

    # Use both stream modes simultaneously:
    # - "messages" gives real-time token chunks as the LLM generates them
    # - "updates" gives node-level state deltas so we can capture attack_tree
    # Each yielded item is (mode, data).
    attack_tree_logical = None
    _working_shown = False  # debounce: emit "Working..." once per agent turn
    _seen_tc_ids: set = set()  # deduplicate tool calls (name arrives on first chunk)

    if on_event:
        on_event("Processing...")

    try:
        for mode, data in attack_tree_workflow.stream(
            initial_state, config=agent_config, stream_mode=["messages", "updates"]
        ):
            if stop_event and stop_event.is_set():
                break
            if mode == "updates":
                for node_name, node_updates in data.items():
                    if node_name == "agent":
                        _working_shown = (
                            False  # new agent turn — allow next "Working..."
                        )
                    if isinstance(node_updates, dict) and node_updates.get(
                        "attack_tree"
                    ):
                        attack_tree_logical = node_updates["attack_tree"]

            elif mode == "messages":
                msg_chunk, metadata = data
                if metadata.get("langgraph_node") != "agent":
                    continue
                if (
                    hasattr(msg_chunk, "tool_call_chunks")
                    and msg_chunk.tool_call_chunks
                ):
                    for tc_chunk in msg_chunk.tool_call_chunks:
                        tc_id = tc_chunk.get("id") or ""
                        tc_name = (tc_chunk.get("name") or "").strip()
                        if tc_id and tc_id not in _seen_tc_ids and tc_name:
                            _seen_tc_ids.add(tc_id)
                            if on_event:
                                on_event(tc_name)
                elif (
                    hasattr(msg_chunk, "content")
                    and msg_chunk.content
                    and not _working_shown
                ):
                    _working_shown = True
                    if on_event:
                        on_event("Working...")
    except Exception:
        pass

    if not attack_tree_logical:
        return None

    return AttackTreeConverter().convert(attack_tree_logical)
