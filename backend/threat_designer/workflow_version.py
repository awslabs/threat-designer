"""
Version workflow subgraph.

Pipeline: diff_node → (proceed? agent_init : abort) → version_agent ⇄ tools → validate → Command(goto="finalize", graph=PARENT)
"""

from typing import Annotated, List

from config import config as app_config
from constants import JobState
from langchain.tools import tool, ToolRuntime
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import Command, Overwrite
from model_service import ModelService
from monitoring import logger
from prompt_provider import (
    APPLICATION_TYPE_DESCRIPTIONS,
    create_version_agent_system_prompt,
    version_diff_prompt,
)
from state import (
    AssetsList,
    ConfigSchema,
    DataFlowsList,
    VersionDiffResult,
    VersionState,
    FlowsList,
    ThreatsList,
    TrustBoundariesList,
    TaskStatus,
    create_constrained_threat_model,
    create_constrained_flow_models,
)
from state_tracking_service import StateService
from message_builder import inject_bedrock_cache_points, extract_reasoning_trails
from tools import (
    _calculate_threat_kpis,
    _format_kpis_for_prompt,
    validate_entity_references,
    validate_threats,
    format_validation_response,
    delete_by_field,
    format_delete_response,
)

# Initialize services
state_service = StateService(app_config.agent_state_table)
model_service = ModelService()

# Job state mapping for task → VERSION_* status
_TASK_JOB_STATE = {
    "assets": JobState.VERSION_ASSETS,
    "data_flows": JobState.VERSION_FLOWS,
    "trust_boundaries": JobState.VERSION_BOUNDARIES,
    "threats": JobState.VERSION_THREATS,
}

_TASK_DISPLAY_NAME = {
    "assets": "Assets",
    "data_flows": "Data Flows",
    "trust_boundaries": "Trust Boundaries",
    "threats": "Threats",
}

# Canonical task ordering — used for enforcement and iteration
_TASK_ORDER = ["assets", "data_flows", "trust_boundaries", "threats"]

# Maps task completion to trail field for reasoning capture.
# data_flows is intentionally absent: its reasoning is captured under
# trust_boundaries → "flows" because trail_msg_idx doesn't advance on data_flows completion.
_TRAIL_MAP = {
    "assets": "assets",
    "trust_boundaries": "flows",
    "threats": "threats",
}


# ============================================================================
# Helpers
# ============================================================================


def _get_tasks(state) -> dict:
    """Get version tasks from state, with safe defaults."""
    tasks = state.get("version_tasks")
    if tasks is None:
        return {
            "assets": TaskStatus.PENDING,
            "data_flows": TaskStatus.PENDING,
            "trust_boundaries": TaskStatus.PENDING,
            "threats": TaskStatus.PENDING,
        }
    return dict(tasks)


def _check_task_gate(state, task_name: str) -> str | None:
    """Check if a task is IN_PROGRESS. Returns error message if not."""
    tasks = _get_tasks(state)
    status = tasks.get(task_name)
    if status != TaskStatus.IN_PROGRESS:
        return (
            f"Cannot modify {task_name}: task status is '{status.value if status else 'unknown'}'. "
            f"You must call update_task_status to set '{task_name}' to 'in_progress' first."
        )
    return None


def _format_tasks(tasks: dict) -> str:
    """Format task status dict for display."""
    lines = []
    for k, v in tasks.items():
        val = v.value if isinstance(v, TaskStatus) else str(v)
        lines.append(f"  {k}: {val}")
    return "\n".join(lines)


def _format_section(state, section: str) -> str:
    """Format a section of the current state for reading."""
    if section == "assets":
        assets = state.get("assets")
        if not assets or not assets.assets:
            return "Assets: (empty)"
        lines = ["Assets:"]
        for a in assets.assets:
            lines.append(
                f"  - [{a.type}] {a.name}: {a.description} (criticality: {a.criticality})"
            )
        return "\n".join(lines)

    elif section == "data_flows":
        arch = state.get("system_architecture")
        if not arch or not arch.data_flows:
            return "Data Flows: (empty)"
        lines = ["Data Flows:"]
        for f in arch.data_flows:
            lines.append(
                f"  - {f.source_entity} → {f.target_entity}: {f.flow_description}"
            )
        return "\n".join(lines)

    elif section == "trust_boundaries":
        arch = state.get("system_architecture")
        if not arch or not arch.trust_boundaries:
            return "Trust Boundaries: (empty)"
        lines = ["Trust Boundaries:"]
        for b in arch.trust_boundaries:
            lines.append(f"  - {b.source_entity} ↔ {b.target_entity}: {b.purpose}")
        return "\n".join(lines)

    elif section == "threats":
        tl = state.get("threat_list")
        if not tl or not tl.threats:
            return "Threats: (empty)"
        lines = [f"Threats ({len(tl.threats)} total):"]
        for t in tl.threats:
            lines.append(
                f"  - [{t.stride_category}] {t.name} → {t.target} (source: {t.source}, likelihood: {t.likelihood})"
            )

        # Append KPI stats
        kpis = _calculate_threat_kpis(
            tl, state.get("assets"), state.get("system_architecture")
        )
        lines.append("")
        lines.append(_format_kpis_for_prompt(kpis))
        return "\n".join(lines)

    elif section == "threat_sources":
        arch = state.get("system_architecture")
        if not arch or not arch.threat_sources:
            return "Threat Sources: (empty)"
        lines = ["Threat Sources:"]
        for s in arch.threat_sources:
            lines.append(f"  - {s.category}: {s.description}")
        return "\n".join(lines)

    elif section == "all":
        parts = []
        for s in [
            "assets",
            "data_flows",
            "trust_boundaries",
            "threat_sources",
            "threats",
        ]:
            parts.append(_format_section(state, s))
        return "\n\n".join(parts)

    return f"Unknown section: {section}"


# ============================================================================
# diff_node
# ============================================================================


def diff_node(state: VersionState, config: RunnableConfig) -> Command:
    """Compare old and new architecture diagrams, produce diff summary."""
    job_id = state.get("job_id", "unknown")

    state_service.update_job_state(
        job_id, JobState.VERSION_DIFF.value, detail="Analyzing architecture changes"
    )

    model = config["configurable"].get("model_version_diff")

    prompt = version_diff_prompt()

    # Build message with both images
    old_image = state.get("previous_image_data")
    new_image = state.get("image_data")

    if not old_image or not new_image:
        raise ValueError(
            f"Missing image data for diff: old={'present' if old_image else 'MISSING'}, "
            f"new={'present' if new_image else 'MISSING'}"
        )

    raw_image_type = state.get("image_type") or "png"
    image_type = raw_image_type if "/" in raw_image_type else f"image/{raw_image_type}"

    content = [
        {"type": "text", "text": "OLD architecture diagram:"},
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": image_type,
                "data": old_image,
            },
        },
        {"type": "text", "text": "NEW architecture diagram:"},
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": image_type,
                "data": new_image,
            },
        },
        {
            "type": "text",
            "text": "Describe all changes between the OLD and NEW diagrams.",
        },
    ]

    messages = [
        SystemMessage(content=prompt),
        HumanMessage(content=content),
    ]

    structured_model = model.with_structured_output(VersionDiffResult)
    response = structured_model.invoke(messages, config)

    diff_text = response.diff
    proceed = response.proceed

    # Store diff output in flows trail for reference
    state_service.update_trail(job_id=job_id, flows=diff_text)

    logger.info(
        "Architecture diff completed",
        node="diff_node",
        job_id=job_id,
        diff_length=len(diff_text),
        proceed=proceed,
    )

    return Command(update={"architecture_diff": diff_text, "version_proceed": proceed})


# ============================================================================
# diff routing + abort
# ============================================================================


def route_after_diff(state: VersionState):
    """Route to agent_init if proceed, otherwise abort."""
    if state.get("version_proceed", True):
        return "agent_init"
    return "abort"


def abort_node(state: VersionState) -> Command:
    """Abort the version workflow when changes are too extensive."""
    job_id = state.get("job_id", "unknown")

    state_service.update_job_state(
        job_id,
        JobState.FAILED.value,
        detail="Architecture changes are too extensive for an incremental update. Please create a new threat model instead.",
    )

    logger.info(
        "Version aborted — architecture diff too extensive",
        node="abort",
        job_id=job_id,
    )

    return Command(goto=END)


# ============================================================================
# version_agent_init
# ============================================================================


def version_agent_init(state: VersionState, config: RunnableConfig) -> Command:
    """Initialize the version agent with context."""
    job_id = state.get("job_id", "unknown")
    diff = state.get("architecture_diff", "")
    description = state.get("description", "")
    assumptions = state.get("assumptions", [])
    application_type = state.get("application_type", "hybrid")
    space_insights = state.get("space_insights")

    state_service.update_job_state(job_id, JobState.VERSION_ASSETS.value)

    system_prompt = create_version_agent_system_prompt()

    # Build human message with full context
    current_state_text = _format_section(state, "all")
    assumptions_text = (
        "\n".join(f"- {a}" for a in assumptions) if assumptions else "(none)"
    )

    # Application type context
    app_type_desc = APPLICATION_TYPE_DESCRIPTIONS.get(
        application_type, APPLICATION_TYPE_DESCRIPTIONS["hybrid"]
    )

    # Image setup
    raw_image_type = state.get("image_type") or "png"
    image_type = raw_image_type if "/" in raw_image_type else f"image/{raw_image_type}"

    content = []

    # Previous architecture diagram
    previous_image = state.get("previous_image_data")
    if previous_image:
        content.append({"type": "text", "text": "PREVIOUS architecture diagram:"})
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image_type,
                    "data": previous_image,
                },
            }
        )

    # New architecture diagram
    image_data = state.get("image_data")
    if image_data:
        content.append({"type": "text", "text": "NEW architecture diagram:"})
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image_type,
                    "data": image_data,
                },
            }
        )

    # Space insights block
    space_block = ""
    if space_insights and space_insights.insights:
        lines = ["<space_knowledge_insights>"]
        for i, insight in enumerate(space_insights.insights, 1):
            lines.append(f'  <insight id="{i}">{insight}</insight>')
        lines.append("</space_knowledge_insights>")
        space_block = "\n" + "\n".join(lines) + "\n"

    content.append(
        {
            "type": "text",
            "text": f"""<architecture_diff>
{diff}
</architecture_diff>

<application_type>
Application Type: {application_type}
{app_type_desc}
</application_type>

<description>
{description}
</description>

<assumptions>
{assumptions_text}
</assumptions>
{space_block}
<current_threat_model>
{current_state_text}
</current_threat_model>

Review the architecture changes and update each section of the threat model accordingly. Start by calling update_task_status to set 'assets' to 'in_progress'.""",
        }
    )

    human_message = HumanMessage(content=content)

    # Clear image data from state — already embedded in the HumanMessage above.
    # Prevents redundant base64 payloads in every DDB checkpoint during the ReAct loop.
    return Command(
        update={
            "messages": [system_prompt, human_message],
            "previous_image_data": None,
            "image_data": None,
        }
    )


# ============================================================================
# version_agent (ReAct node)
# ============================================================================


def version_agent_node(state: VersionState, config: RunnableConfig) -> Command:
    """ReAct agent node for versioning the threat model."""
    job_id = state.get("job_id", "unknown")

    messages = state["messages"]
    model = config["configurable"].get("model_version")
    tools = _build_version_tools(state)
    model_with_tools = model_service.get_model_with_tools(
        model=model, tools=tools, tool_choice="auto"
    )
    response = model_with_tools.invoke(inject_bedrock_cache_points(messages), config)

    # Update detail based on tool being called
    if hasattr(response, "tool_calls") and response.tool_calls:
        first_tool = response.tool_calls[0].get("name", "unknown")
        detail_map = {
            "update_task_status": "Updating task status",
            "create_assets": "Adding assets",
            "delete_assets": "Removing assets",
            "create_data_flows": "Adding data flows",
            "delete_data_flows": "Removing data flows",
            "create_trust_boundaries": "Adding trust boundaries",
            "delete_trust_boundaries": "Removing trust boundaries",
            "create_threats": "Adding threats",
            "delete_threats": "Removing threats",
            "read_current_state": "Reviewing current state",
        }
        detail = detail_map.get(first_tool, f"Calling {first_tool}")

        # Determine which VERSION_* state to show based on current tasks
        tasks = _get_tasks(state)
        for task_name in ["threats", "trust_boundaries", "data_flows", "assets"]:
            if tasks.get(task_name) == TaskStatus.IN_PROGRESS:
                state_service.update_job_state(
                    job_id, _TASK_JOB_STATE[task_name].value, detail=detail
                )
                break

    return Command(update={"messages": [response]})


def should_continue(state: VersionState):
    """Route agent to tools or validation."""
    messages = state["messages"]
    last_message = messages[-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return "validate"


# ============================================================================
# Static tools
# ============================================================================


@tool(
    name_or_callable="update_task_status",
    description="Set a task to 'in_progress' or 'complete'. Must be called ALONE (never in parallel with other tools). Tasks must be completed in order: assets → data_flows → trust_boundaries → threats.",
)
def update_task_status(
    task: Annotated[
        str, "Task name: 'assets', 'data_flows', 'trust_boundaries', or 'threats'"
    ],
    status: Annotated[str, "New status: 'in_progress' or 'complete'"],
    runtime: ToolRuntime,
) -> Command:
    """Set task status with enforced transition and ordering rules."""
    if task not in _TASK_ORDER:
        return f"Error: Invalid task '{task}'. Must be one of: {', '.join(_TASK_ORDER)}"

    target_status = (
        TaskStatus(status) if status in [s.value for s in TaskStatus] else None
    )
    if target_status is None:
        return f"Error: Invalid status '{status}'. Must be 'in_progress' or 'complete'."

    valid_transitions = {
        TaskStatus.PENDING: TaskStatus.IN_PROGRESS,
        TaskStatus.IN_PROGRESS: TaskStatus.COMPLETE,
    }

    tasks = _get_tasks(runtime.state)
    current = tasks[task]
    expected_next = valid_transitions.get(current)

    if expected_next != target_status:
        return (
            f"Error: Cannot transition '{task}' from '{current.value}' to '{status}'. "
            f"Expected next status: '{expected_next.value if expected_next else 'N/A'}'."
        )

    # Enforce ordering: all preceding tasks must be COMPLETE before starting a new one
    if target_status == TaskStatus.IN_PROGRESS:
        task_idx = _TASK_ORDER.index(task)
        for prev_task in _TASK_ORDER[:task_idx]:
            if tasks[prev_task] != TaskStatus.COMPLETE:
                return (
                    f"Error: Cannot start '{task}' because '{prev_task}' is not complete yet "
                    f"(status: '{tasks[prev_task].value}'). Tasks must be completed in order: "
                    f"{' → '.join(_TASK_ORDER)}."
                )

    tasks[task] = target_status

    # Update job state
    job_id = runtime.state.get("job_id", "unknown")
    if task in _TASK_JOB_STATE and target_status == TaskStatus.IN_PROGRESS:
        state_service.update_job_state(
            job_id,
            _TASK_JOB_STATE[task].value,
            detail=f"Working on {_TASK_DISPLAY_NAME.get(task, task)}",
        )

    # Capture reasoning trail on task completion
    trail_update = {}
    messages = runtime.state.get("messages", [])
    trail_idx = runtime.state.get("trail_msg_idx", 0) or 0

    if target_status == TaskStatus.COMPLETE:
        segment = messages[trail_idx:]
        reasoning = extract_reasoning_trails(segment)

        trail_field = _TRAIL_MAP.get(task)
        if trail_field and reasoning:
            if trail_field == "threats":
                state_service.update_trail(job_id=job_id, threats=reasoning)
            elif trail_field == "assets":
                state_service.update_trail(job_id=job_id, assets="\n\n".join(reasoning))
            elif trail_field == "flows":
                state_service.update_trail(job_id=job_id, flows="\n\n".join(reasoning))

        # Advance the index for the next segment
        trail_update["trail_msg_idx"] = len(messages)

    return Command(
        update={
            "version_tasks": tasks,
            **trail_update,
            "messages": [
                ToolMessage(
                    f"Task '{task}' set to '{status}'.\n\nCurrent tasks:\n{_format_tasks(tasks)}",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


@tool(
    name_or_callable="read_current_state",
    description="Read current state of a section: 'assets', 'data_flows', 'trust_boundaries', 'threats', or 'all'.",
)
def read_current_state(
    section: Annotated[
        str,
        "Section to read: 'assets', 'data_flows', 'trust_boundaries', 'threats', or 'all'",
    ],
    runtime: ToolRuntime,
) -> str:
    """Read and return the current state of a threat model section."""
    return _format_section(runtime.state, section)


@tool(
    name_or_callable="create_assets",
    description="Add assets to the threat model. Requires assets task IN_PROGRESS.",
)
def create_assets(assets: AssetsList, runtime: ToolRuntime) -> Command:
    """Add assets with deduplication by name."""
    gate_error = _check_task_gate(runtime.state, "assets")
    if gate_error:
        return gate_error

    job_id = runtime.state.get("job_id", "unknown")
    current = runtime.state.get("assets")
    current_list = list(current.assets) if current and current.assets else []
    existing_names = {a.name for a in current_list}

    added = []
    skipped = []
    for asset in assets.assets:
        if asset.name in existing_names:
            skipped.append(asset.name)
            continue
        current_list.append(asset)
        existing_names.add(asset.name)
        added.append(asset.name)

    state_service.update_job_state(
        job_id, JobState.VERSION_ASSETS.value, detail=f"Added {len(added)} assets"
    )

    response_msg = (
        f"Added {len(added)} assets: {', '.join(added)}"
        if added
        else "No new assets added."
    )
    if skipped:
        response_msg += f"\nSkipped (already exist): {', '.join(skipped)}"

    return Command(
        update={
            "assets": AssetsList(assets=current_list),
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool(
    name_or_callable="delete_assets",
    description="Delete assets by name. Requires assets task IN_PROGRESS.",
)
def delete_assets(
    names: Annotated[List[str], "List of asset names to remove"],
    runtime: ToolRuntime,
) -> Command:
    """Remove assets by name."""
    gate_error = _check_task_gate(runtime.state, "assets")
    if gate_error:
        return gate_error

    job_id = runtime.state.get("job_id", "unknown")
    current = runtime.state.get("assets")
    if not current or not current.assets:
        return "No assets to delete."

    names_set = set(names)
    existing_names = {a.name for a in current.assets}
    remaining = [a for a in current.assets if a.name not in names_set]
    deleted_count = len(current.assets) - len(remaining)

    state_service.update_job_state(
        job_id, JobState.VERSION_ASSETS.value, detail=f"Removed {deleted_count} assets"
    )

    not_found = sorted(names_set - existing_names)
    response_msg = f"Deleted {deleted_count} assets. Remaining: {len(remaining)}."
    if not_found:
        response_msg += f"\nNot found: {not_found}"

    return Command(
        update={
            "assets": AssetsList(assets=remaining),
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool(
    name_or_callable="delete_data_flows",
    description="Delete data flows by flow description. Requires data_flows task IN_PROGRESS.",
)
def delete_data_flows(
    flow_descriptions: Annotated[List[str], "List of flow descriptions to remove"],
    runtime: ToolRuntime,
) -> Command:
    """Remove data flows matching by flow_description."""
    gate_error = _check_task_gate(runtime.state, "data_flows")
    if gate_error:
        return gate_error

    job_id = runtime.state.get("job_id", "unknown")
    arch = runtime.state.get("system_architecture")
    if not arch or not arch.data_flows:
        return "No data flows to delete."

    remaining, deleted_count, not_found = delete_by_field(
        arch.data_flows, "flow_description", flow_descriptions
    )

    state_service.update_job_state(
        job_id,
        JobState.VERSION_FLOWS.value,
        detail=f"Removed {deleted_count} data flows",
    )

    response_msg = format_delete_response(
        "data flows", deleted_count, len(remaining), not_found
    )

    updated_arch = FlowsList(
        data_flows=remaining,
        trust_boundaries=arch.trust_boundaries or [],
        threat_sources=arch.threat_sources or [],
    )

    return Command(
        update={
            "system_architecture": updated_arch,
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool(
    name_or_callable="delete_trust_boundaries",
    description="Delete trust boundaries by purpose. Requires trust_boundaries task IN_PROGRESS.",
)
def delete_trust_boundaries(
    boundary_purposes: Annotated[
        List[str], "List of trust boundary purposes to remove"
    ],
    runtime: ToolRuntime,
) -> Command:
    """Remove trust boundaries matching by purpose."""
    gate_error = _check_task_gate(runtime.state, "trust_boundaries")
    if gate_error:
        return gate_error

    job_id = runtime.state.get("job_id", "unknown")
    arch = runtime.state.get("system_architecture")
    if not arch or not arch.trust_boundaries:
        return "No trust boundaries to delete."

    remaining, deleted_count, not_found = delete_by_field(
        arch.trust_boundaries, "purpose", boundary_purposes
    )

    state_service.update_job_state(
        job_id,
        JobState.VERSION_BOUNDARIES.value,
        detail=f"Removed {deleted_count} trust boundaries",
    )

    response_msg = format_delete_response(
        "trust boundaries", deleted_count, len(remaining), not_found
    )

    updated_arch = FlowsList(
        data_flows=arch.data_flows or [],
        trust_boundaries=remaining,
        threat_sources=arch.threat_sources or [],
    )

    return Command(
        update={
            "system_architecture": updated_arch,
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool(
    name_or_callable="delete_threats",
    description="Delete threats by name. Requires threats task IN_PROGRESS.",
)
def delete_threats(
    names: Annotated[List[str], "List of threat names to remove"],
    runtime: ToolRuntime,
) -> Command:
    """Remove threats by name."""
    gate_error = _check_task_gate(runtime.state, "threats")
    if gate_error:
        return gate_error

    job_id = runtime.state.get("job_id", "unknown")
    current_tl = runtime.state.get("threat_list")
    if not current_tl or not current_tl.threats:
        return "No threats to delete."

    remaining, deleted_count, not_found = delete_by_field(
        current_tl.threats, "name", names
    )

    state_service.update_job_state(
        job_id,
        JobState.VERSION_THREATS.value,
        detail=f"Removed {deleted_count} threats",
    )

    response_msg = format_delete_response(
        "threats", deleted_count, len(remaining), not_found
    )

    return Command(
        update={
            "threat_list": Overwrite(ThreatsList(threats=remaining)),
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


# ============================================================================
# Shared handlers for create tools (static + dynamic variants)
# ============================================================================


def _handle_create_data_flows(data_flows, runtime: ToolRuntime):
    """Shared handler for create_data_flows (static and dynamic variants)."""
    gate_error = _check_task_gate(runtime.state, "data_flows")
    if gate_error:
        return gate_error

    job_id = runtime.state.get("job_id", "unknown")
    assets = runtime.state.get("assets")
    valid_asset_names = (
        {a.name for a in assets.assets} if assets and assets.assets else set()
    )

    valid_flows, invalid_flows = validate_entity_references(
        data_flows.data_flows, valid_asset_names, "data flow", "flow_description"
    )

    # Merge with existing
    arch = runtime.state.get("system_architecture")
    existing_flows = list(arch.data_flows) if arch and arch.data_flows else []
    merged_flows = existing_flows + valid_flows

    state_service.update_job_state(
        job_id,
        JobState.VERSION_FLOWS.value,
        detail=f"Adding {len(valid_flows)} data flows",
    )

    response_msg = format_validation_response(
        "data flows",
        len(valid_flows),
        invalid_flows,
        valid_asset_names if invalid_flows else None,
    )

    updated_arch = FlowsList(
        data_flows=merged_flows,
        trust_boundaries=arch.trust_boundaries if arch else [],
        threat_sources=arch.threat_sources if arch else [],
    )

    return Command(
        update={
            "system_architecture": updated_arch,
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


def _handle_create_trust_boundaries(trust_boundaries, runtime: ToolRuntime):
    """Shared handler for create_trust_boundaries (static and dynamic variants)."""
    gate_error = _check_task_gate(runtime.state, "trust_boundaries")
    if gate_error:
        return gate_error

    job_id = runtime.state.get("job_id", "unknown")
    assets = runtime.state.get("assets")
    valid_asset_names = (
        {a.name for a in assets.assets} if assets and assets.assets else set()
    )

    valid_bounds, invalid_bounds = validate_entity_references(
        trust_boundaries.trust_boundaries,
        valid_asset_names,
        "trust boundary",
        "purpose",
    )

    # Merge with existing
    arch = runtime.state.get("system_architecture")
    existing_tbs = list(arch.trust_boundaries) if arch and arch.trust_boundaries else []
    merged_tbs = existing_tbs + valid_bounds

    state_service.update_job_state(
        job_id,
        JobState.VERSION_BOUNDARIES.value,
        detail=f"Adding {len(valid_bounds)} trust boundaries",
    )

    response_msg = format_validation_response(
        "trust boundaries",
        len(valid_bounds),
        invalid_bounds,
        valid_asset_names if invalid_bounds else None,
    )

    updated_arch = FlowsList(
        data_flows=arch.data_flows if arch else [],
        trust_boundaries=merged_tbs,
        threat_sources=arch.threat_sources if arch else [],
    )

    return Command(
        update={
            "system_architecture": updated_arch,
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


def _handle_create_threats(threats, runtime: ToolRuntime):
    """Shared handler for create_threats (static and dynamic variants)."""
    gate_error = _check_task_gate(runtime.state, "threats")
    if gate_error:
        return gate_error

    job_id = runtime.state.get("job_id", "unknown")
    assets = runtime.state.get("assets")
    system_architecture = runtime.state.get("system_architecture")
    valid_asset_names = (
        {a.name for a in assets.assets} if assets and assets.assets else set()
    )
    valid_threat_sources = (
        {s.category for s in system_architecture.threat_sources}
        if system_architecture and system_architecture.threat_sources
        else set()
    )

    current_tl = runtime.state.get("threat_list")
    existing_names = (
        {t.name for t in current_tl.threats}
        if current_tl and current_tl.threats
        else set()
    )

    valid_threats, invalid_threats = validate_threats(
        threats.threats, valid_asset_names, valid_threat_sources, existing_names
    )

    state_service.update_job_state(
        job_id,
        JobState.VERSION_THREATS.value,
        detail=f"Added {len(valid_threats)} threats",
    )

    hint_names = (valid_asset_names | valid_threat_sources) if invalid_threats else None
    response_msg = format_validation_response(
        "threats", len(valid_threats), invalid_threats, hint_names
    )

    # Use delta (operator.add reducer merges via ThreatsList.__add__)
    delta = ThreatsList(threats=valid_threats)

    return Command(
        update={
            "threat_list": delta,
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


# ============================================================================
# Static create tools (fallback when dynamic models unavailable)
# ============================================================================


@tool(
    name_or_callable="create_data_flows",
    description="Add data flows. Each must reference valid asset names as source_entity and target_entity. Requires data_flows task IN_PROGRESS.",
)
def create_data_flows(data_flows: DataFlowsList, runtime: ToolRuntime) -> Command:
    """Add data flows with entity validation."""
    return _handle_create_data_flows(data_flows, runtime)


@tool(
    name_or_callable="create_trust_boundaries",
    description="Add trust boundaries. Each must reference valid asset names as source_entity and target_entity. Requires trust_boundaries task IN_PROGRESS.",
)
def create_trust_boundaries(
    trust_boundaries: TrustBoundariesList, runtime: ToolRuntime
) -> Command:
    """Add trust boundaries with entity validation."""
    return _handle_create_trust_boundaries(trust_boundaries, runtime)


@tool(
    name_or_callable="create_threats",
    description="Add threats to the catalog. Requires threats task IN_PROGRESS.",
)
def create_threats(threats: ThreatsList, runtime: ToolRuntime) -> Command:
    """Add threats with target/source validation."""
    return _handle_create_threats(threats, runtime)


# ============================================================================
# Dynamic tool factories (Literal-constrained schemas)
# ============================================================================


def _create_dynamic_create_data_flows_tool(data_flows_list_model: type):
    """Create a create_data_flows tool with Literal-constrained entity fields."""

    @tool(
        name_or_callable="create_data_flows",
        description="Add data flows. Each must reference valid asset names as source_entity and target_entity. Requires data_flows task IN_PROGRESS.",
    )
    def dynamic_create_data_flows(
        data_flows: data_flows_list_model, runtime: ToolRuntime
    ) -> Command:
        return _handle_create_data_flows(data_flows, runtime)

    return dynamic_create_data_flows


def _create_dynamic_create_trust_boundaries_tool(trust_boundaries_list_model: type):
    """Create a create_trust_boundaries tool with Literal-constrained entity fields."""

    @tool(
        name_or_callable="create_trust_boundaries",
        description="Add trust boundaries. Each must reference valid asset names as source_entity and target_entity. Requires trust_boundaries task IN_PROGRESS.",
    )
    def dynamic_create_trust_boundaries(
        trust_boundaries: trust_boundaries_list_model, runtime: ToolRuntime
    ) -> Command:
        return _handle_create_trust_boundaries(trust_boundaries, runtime)

    return dynamic_create_trust_boundaries


def _create_dynamic_create_threats_tool(threats_list_model: type):
    """Create a create_threats tool with Literal-constrained target/source fields."""

    @tool(
        name_or_callable="create_threats",
        description="Add threats to the catalog. Requires threats task IN_PROGRESS.",
    )
    def dynamic_create_threats(
        threats: threats_list_model, runtime: ToolRuntime
    ) -> Command:
        return _handle_create_threats(threats, runtime)

    return dynamic_create_threats


# ============================================================================
# Tool builder
# ============================================================================


def _build_version_tools(state: VersionState) -> list:
    """Build tools scoped to the current active task.

    Only the tools for the IN_PROGRESS task are included, plus the
    always-available update_task_status and read_current_state.
    Dynamic Pydantic models with Literal constraints are used for
    data_flows, trust_boundaries, and threats — since their prerequisite
    tasks are already COMPLETE, the constraints are stable.
    """
    tasks = _get_tasks(state)

    # Always available
    tools = [update_task_status, read_current_state]

    # Find the active task
    active = None
    for task_name in ["assets", "data_flows", "trust_boundaries", "threats"]:
        if tasks.get(task_name) == TaskStatus.IN_PROGRESS:
            active = task_name
            break

    if active == "assets":
        tools.extend([create_assets, delete_assets])

    elif active == "data_flows":
        # Assets are complete — build constrained models from stable asset names
        assets = state.get("assets")
        asset_names = (
            frozenset(a.name for a in assets.assets)
            if assets and assets.assets
            else frozenset()
        )

        flows_tool = create_data_flows
        if asset_names:
            try:
                _, _, DynDataFlowsList, _ = create_constrained_flow_models(asset_names)
                flows_tool = _create_dynamic_create_data_flows_tool(DynDataFlowsList)
            except Exception:
                logger.warning(
                    "Failed to create constrained flow models, using fallback"
                )

        tools.extend([flows_tool, delete_data_flows])

    elif active == "trust_boundaries":
        assets = state.get("assets")
        asset_names = (
            frozenset(a.name for a in assets.assets)
            if assets and assets.assets
            else frozenset()
        )

        tbs_tool = create_trust_boundaries
        if asset_names:
            try:
                _, _, _, DynTrustBoundariesList = create_constrained_flow_models(
                    asset_names
                )
                tbs_tool = _create_dynamic_create_trust_boundaries_tool(
                    DynTrustBoundariesList
                )
            except Exception:
                logger.warning(
                    "Failed to create constrained boundary models, using fallback"
                )

        tools.extend([tbs_tool, delete_trust_boundaries])

    elif active == "threats":
        assets = state.get("assets")
        system_architecture = state.get("system_architecture")
        asset_names = (
            frozenset(a.name for a in assets.assets)
            if assets and assets.assets
            else frozenset()
        )
        source_cats = frozenset()
        if system_architecture and system_architecture.threat_sources:
            source_cats = frozenset(
                s.category for s in system_architecture.threat_sources
            )

        threats_tool = create_threats
        if asset_names or source_cats:
            try:
                _, DynThreatsList = create_constrained_threat_model(
                    asset_names, source_cats
                )
                threats_tool = _create_dynamic_create_threats_tool(DynThreatsList)
            except Exception:
                logger.warning(
                    "Failed to create constrained threat model, using fallback"
                )

        tools.extend([threats_tool, delete_threats])

    return tools


def dynamic_tool_node(state: VersionState) -> Command:
    """Tool node using dynamic version tools."""
    tools = _build_version_tools(state)
    node = ToolNode(tools)
    return node.invoke(state)


# ============================================================================
# validate
# ============================================================================


def validate_node(state: VersionState) -> Command:
    """Validate that all version tasks are complete before proceeding to finalize."""
    job_id = state.get("job_id", "unknown")
    tasks = _get_tasks(state)

    incomplete = [
        task_name
        for task_name, status in tasks.items()
        if status != TaskStatus.COMPLETE
    ]

    if incomplete:
        feedback = HumanMessage(
            content=f"The following tasks are not yet complete: {', '.join(incomplete)}. "
            f"You must complete all 4 tasks before finishing. "
            f"Current status:\n{_format_tasks(tasks)}"
        )
        return Command(goto="agent", update={"messages": [feedback]})

    # All tasks complete — route to parent finalize
    threat_list = state.get("threat_list")
    assets = state.get("assets")
    system_architecture = state.get("system_architecture")

    logger.debug(
        "Version validation passed, routing to parent finalize",
        node="validate",
        job_id=job_id,
        threat_count=len(threat_list.threats) if threat_list else 0,
    )

    return Command(
        goto="finalize",
        update={
            "threat_list": Overwrite(threat_list)
            if threat_list
            else ThreatsList(threats=[]),
            "assets": assets,
            "system_architecture": system_architecture,
        },
        graph=Command.PARENT,
    )


# ============================================================================
# Build the version subgraph
# ============================================================================

workflow = StateGraph(VersionState, ConfigSchema)

# Nodes
workflow.add_node("diff_node", diff_node)
workflow.add_node("abort", abort_node)
workflow.add_node("agent_init", version_agent_init)
workflow.add_node("agent", version_agent_node)
workflow.add_node("tools", dynamic_tool_node)
workflow.add_node("validate", validate_node)

# Entry → diff_node → (proceed? agent_init : abort)
workflow.set_entry_point("diff_node")
workflow.add_conditional_edges("diff_node", route_after_diff)
workflow.add_edge("agent_init", "agent")

# Agent ReAct loop
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")

# validate routes to parent via Command(graph=Command.PARENT) or loops back to agent
# abort routes to END via Command(goto=END)

version_subgraph = workflow.compile()
