"""
Version workflow — standalone diff node + task-steered versioning agent.

The diff runs as its own graph node (``version_diff_node``): a single
structured-output LLM call that either routes the graph forward to the
versioning agent or aborts the workflow when the architectures are too
different to update incrementally.

The versioning agent itself (``version_subgraph``) then runs the
remaining tasks — assets → data_flows → trust_boundaries → threats —
driven by ``TaskSteeringMiddleware``, with the diff summary injected
into its HumanMessage.
"""

from typing import Annotated, List

from config import config as app_config
from constants import (
    JobState,
    WORKFLOW_NODE_FINALIZE,
    WORKFLOW_NODE_VERSION,
)
from langchain.agents import create_agent
from langchain.tools import tool, ToolRuntime
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables.config import RunnableConfig
from langchain_task_steering import Task, TaskMiddleware, TaskSteeringMiddleware
from langgraph.graph import END
from langgraph.types import Command, Overwrite
from model_service import ModelService
from monitoring import logger
from prompt_provider import (
    APPLICATION_TYPE_DESCRIPTIONS,
    create_version_agent_system_prompt,
    version_diff_prompt,
)
from state import (
    AgentState,
    AssetsList,
    DataFlowsList,
    VersionDiffResult,
    VersionState,
    FlowsList,
    ThreatsList,
    TrustBoundariesList,
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


# ============================================================================
# CachePointModel
# ============================================================================


class CachePointModel:
    """Transparent wrapper that injects Bedrock cache breakpoints before each invoke."""

    def __init__(self, model):
        self._model = model

    def invoke(self, input, config=None, **kwargs):
        if isinstance(input, list):
            input = inject_bedrock_cache_points(input)
        return self._model.invoke(input, config=config, **kwargs)

    async def ainvoke(self, input, config=None, **kwargs):
        if isinstance(input, list):
            input = inject_bedrock_cache_points(input)
        return await self._model.ainvoke(input, config=config, **kwargs)

    def bind_tools(self, tools, **kwargs):
        return CachePointModel(self._model.bind_tools(tools, **kwargs))

    def __getattr__(self, name):
        return getattr(self._model, name)


# ============================================================================
# VersionTaskMiddleware — side-effects + dynamic tool schemas
# ============================================================================


class VersionTaskMiddleware(TaskMiddleware):
    """Fires job-state updates, reasoning-trail capture, and optional
    dynamic Literal-constrained tool swapping on task transitions."""

    def __init__(
        self,
        task_name: str,
        job_state_value: str,
        display_name: str,
        trail_field: str | None = None,
        dynamic_tool_builder=None,
    ):
        self.task_name = task_name
        self.job_state_value = job_state_value
        self.display_name = display_name
        self.trail_field = trail_field
        self.dynamic_tool_builder = dynamic_tool_builder
        self._dynamic_tool = None

    # -- lifecycle hooks -----------------------------------------------------

    def on_start(self, state) -> dict | None:
        job_id = state.get("job_id", "unknown")
        state_service.update_job_state(
            job_id, self.job_state_value, detail=f"Working on {self.display_name}"
        )

        if self.dynamic_tool_builder:
            try:
                self._dynamic_tool = self.dynamic_tool_builder(state)
            except Exception:
                logger.warning(
                    "Failed to build dynamic tool, using static fallback",
                    task=self.task_name,
                )
                self._dynamic_tool = None

        return None

    def on_complete(self, state) -> dict | None:
        job_id = state.get("job_id", "unknown")

        if not self.trail_field:
            return None

        messages = state.get("messages", [])
        trail_idx = state.get("trail_msg_idx", 0) or 0
        segment = messages[trail_idx:]
        reasoning = extract_reasoning_trails(segment)

        if reasoning:
            if self.trail_field == "threats":
                state_service.update_trail(job_id=job_id, threats=reasoning)
            elif self.trail_field == "assets":
                state_service.update_trail(job_id=job_id, assets="\n\n".join(reasoning))
            elif self.trail_field == "flows":
                state_service.update_trail(job_id=job_id, flows="\n\n".join(reasoning))

        return {"trail_msg_idx": len(messages)}

    # -- model-call hook: swap in dynamic tool schema ------------------------

    def wrap_model_call(self, request, handler):
        if self._dynamic_tool:
            request.tools = [
                self._dynamic_tool if t.name == self._dynamic_tool.name else t
                for t in request.tools
            ]
        return handler(request)

    async def awrap_model_call(self, request, handler):
        if self._dynamic_tool:
            request.tools = [
                self._dynamic_tool if t.name == self._dynamic_tool.name else t
                for t in request.tools
            ]
        return await handler(request)


# ============================================================================
# Helpers
# ============================================================================


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
# Domain tools
# ============================================================================


@tool(
    name_or_callable="read_current_state",
    description="Read current state of a section: 'assets', 'data_flows', 'trust_boundaries', 'threats', or 'all'.",
)
def read_current_state(
    section: Annotated[str, "Section to read"],
    runtime: ToolRuntime,
) -> str:
    return _format_section(runtime.state, section)


@tool(name_or_callable="create_assets", description="Add assets to the threat model.")
def create_assets(assets: AssetsList, runtime: ToolRuntime) -> Command:
    job_id = runtime.state.get("job_id", "unknown")
    current = runtime.state.get("assets")
    current_list = list(current.assets) if current and current.assets else []
    existing_names = {a.name for a in current_list}

    added, skipped = [], []
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


@tool(name_or_callable="delete_assets", description="Delete assets by name.")
def delete_assets(
    names: Annotated[List[str], "List of asset names to remove"], runtime: ToolRuntime
) -> Command:
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


# --- Shared create handlers ------------------------------------------------


def _handle_create_data_flows(data_flows, runtime: ToolRuntime):
    job_id = runtime.state.get("job_id", "unknown")
    assets = runtime.state.get("assets")
    valid_asset_names = (
        {a.name for a in assets.assets} if assets and assets.assets else set()
    )
    valid_flows, invalid_flows = validate_entity_references(
        data_flows.data_flows, valid_asset_names, "data flow", "flow_description"
    )
    arch = runtime.state.get("system_architecture")
    existing_flows = list(arch.data_flows) if arch and arch.data_flows else []
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
        data_flows=existing_flows + valid_flows,
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
    arch = runtime.state.get("system_architecture")
    existing_tbs = list(arch.trust_boundaries) if arch and arch.trust_boundaries else []
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
        trust_boundaries=existing_tbs + valid_bounds,
        threat_sources=arch.threat_sources if arch else [],
    )
    return Command(
        update={
            "system_architecture": updated_arch,
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


def _handle_create_threats(threats, runtime: ToolRuntime):
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
    return Command(
        update={
            "threat_list": ThreatsList(threats=valid_threats),
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


# --- Static create tools (fallback when dynamic schemas unavailable) --------


@tool(
    name_or_callable="create_data_flows",
    description="Add data flows. Each must reference valid asset names as source_entity and target_entity.",
)
def create_data_flows(data_flows: DataFlowsList, runtime: ToolRuntime) -> Command:
    return _handle_create_data_flows(data_flows, runtime)


@tool(
    name_or_callable="create_trust_boundaries",
    description="Add trust boundaries. Each must reference valid asset names as source_entity and target_entity.",
)
def create_trust_boundaries(
    trust_boundaries: TrustBoundariesList, runtime: ToolRuntime
) -> Command:
    return _handle_create_trust_boundaries(trust_boundaries, runtime)


@tool(name_or_callable="create_threats", description="Add threats to the catalog.")
def create_threats(threats: ThreatsList, runtime: ToolRuntime) -> Command:
    return _handle_create_threats(threats, runtime)


# --- Delete tools -----------------------------------------------------------


@tool(
    name_or_callable="delete_data_flows",
    description="Delete data flows by flow description.",
)
def delete_data_flows(
    flow_descriptions: Annotated[List[str], "List of flow descriptions to remove"],
    runtime: ToolRuntime,
) -> Command:
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
    description="Delete trust boundaries by purpose.",
)
def delete_trust_boundaries(
    boundary_purposes: Annotated[
        List[str], "List of trust boundary purposes to remove"
    ],
    runtime: ToolRuntime,
) -> Command:
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


@tool(name_or_callable="delete_threats", description="Delete threats by name.")
def delete_threats(
    names: Annotated[List[str], "List of threat names to remove"], runtime: ToolRuntime
) -> Command:
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
# Dynamic tool factories (Literal-constrained schemas)
# ============================================================================


def _create_dynamic_create_data_flows_tool(data_flows_list_model: type):
    @tool(
        name_or_callable="create_data_flows",
        description="Add data flows. Each must reference valid asset names as source_entity and target_entity.",
    )
    def dynamic_create_data_flows(
        data_flows: data_flows_list_model, runtime: ToolRuntime
    ) -> Command:
        return _handle_create_data_flows(data_flows, runtime)

    return dynamic_create_data_flows


def _create_dynamic_create_trust_boundaries_tool(trust_boundaries_list_model: type):
    @tool(
        name_or_callable="create_trust_boundaries",
        description="Add trust boundaries. Each must reference valid asset names as source_entity and target_entity.",
    )
    def dynamic_create_trust_boundaries(
        trust_boundaries: trust_boundaries_list_model, runtime: ToolRuntime
    ) -> Command:
        return _handle_create_trust_boundaries(trust_boundaries, runtime)

    return dynamic_create_trust_boundaries


def _create_dynamic_create_threats_tool(threats_list_model: type):
    @tool(name_or_callable="create_threats", description="Add threats to the catalog.")
    def dynamic_create_threats(
        threats: threats_list_model, runtime: ToolRuntime
    ) -> Command:
        return _handle_create_threats(threats, runtime)

    return dynamic_create_threats


# -- Builders called by VersionTaskMiddleware.on_start -----------------------


def _build_dynamic_data_flows_tool(state):
    assets = state.get("assets")
    if not assets or not assets.assets:
        return None
    asset_names = frozenset(a.name for a in assets.assets)
    _, _, DynDataFlowsList, _ = create_constrained_flow_models(asset_names)
    return _create_dynamic_create_data_flows_tool(DynDataFlowsList)


def _build_dynamic_trust_boundaries_tool(state):
    assets = state.get("assets")
    if not assets or not assets.assets:
        return None
    asset_names = frozenset(a.name for a in assets.assets)
    _, _, _, DynTrustBoundariesList = create_constrained_flow_models(asset_names)
    return _create_dynamic_create_trust_boundaries_tool(DynTrustBoundariesList)


def _build_dynamic_threats_tool(state):
    assets = state.get("assets")
    system_architecture = state.get("system_architecture")
    asset_names = (
        frozenset(a.name for a in assets.assets)
        if assets and assets.assets
        else frozenset()
    )
    source_cats = frozenset()
    if system_architecture and system_architecture.threat_sources:
        source_cats = frozenset(s.category for s in system_architecture.threat_sources)
    if not asset_names and not source_cats:
        return None
    _, DynThreatsList = create_constrained_threat_model(asset_names, source_cats)
    return _create_dynamic_create_threats_tool(DynThreatsList)


# ============================================================================
# Middleware factory (fresh per invocation for thread safety)
# ============================================================================


def _build_version_middleware() -> TaskSteeringMiddleware:
    return TaskSteeringMiddleware(
        tasks=[
            Task(
                name="assets",
                instruction="Review and update assets based on the architecture changes.",
                tools=[create_assets, delete_assets, read_current_state],
                middleware=VersionTaskMiddleware(
                    "assets",
                    JobState.VERSION_ASSETS.value,
                    "Assets",
                    trail_field="assets",
                ),
            ),
            Task(
                name="data_flows",
                instruction="Review and update data flows. Entity names must exactly match asset names.",
                tools=[create_data_flows, delete_data_flows, read_current_state],
                middleware=VersionTaskMiddleware(
                    "data_flows",
                    JobState.VERSION_FLOWS.value,
                    "Data Flows",
                    dynamic_tool_builder=_build_dynamic_data_flows_tool,
                ),
            ),
            Task(
                name="trust_boundaries",
                instruction="Review and update trust boundaries. Entity names must exactly match asset names.",
                tools=[
                    create_trust_boundaries,
                    delete_trust_boundaries,
                    read_current_state,
                ],
                middleware=VersionTaskMiddleware(
                    "trust_boundaries",
                    JobState.VERSION_BOUNDARIES.value,
                    "Trust Boundaries",
                    trail_field="flows",
                    dynamic_tool_builder=_build_dynamic_trust_boundaries_tool,
                ),
            ),
            Task(
                name="threats",
                instruction="Review and update threats to reflect the changed attack surface. Apply STRIDE.",
                tools=[create_threats, delete_threats, read_current_state],
                middleware=VersionTaskMiddleware(
                    "threats",
                    JobState.VERSION_THREATS.value,
                    "Threats",
                    trail_field="threats",
                    dynamic_tool_builder=_build_dynamic_threats_tool,
                ),
            ),
        ],
        enforce_order=True,
        required_tasks=[
            "assets",
            "data_flows",
            "trust_boundaries",
            "threats",
        ],
    )


# ============================================================================
# Helpers — shared between the diff node and the versioning agent
# ============================================================================


def _resolve_image_type(state) -> str:
    raw_image_type = state.get("image_type") or "png"
    return raw_image_type if "/" in raw_image_type else f"image/{raw_image_type}"


# ============================================================================
# version_diff_node — standalone diff agent, runs before the versioning agent
# ============================================================================


def version_diff_node(state: AgentState, config: RunnableConfig) -> Command:
    """Compare old and new architecture diagrams via a dedicated LLM call.

    Routes the parent graph to either the versioning agent (``version``
    node) or ``finalize`` when the architectures differ too much for an
    incremental update.  Persists the diff summary to state so the
    downstream versioning agent can reference it.
    """
    job_id = state.get("job_id", "unknown")
    model_diff = config["configurable"].get("model_version_diff")

    old_image = state.get("previous_image_data")
    new_image = state.get("image_data")
    if not old_image or not new_image:
        raise ValueError(
            f"Missing image data for diff: old={'present' if old_image else 'MISSING'}, "
            f"new={'present' if new_image else 'MISSING'}"
        )

    image_type = _resolve_image_type(state)

    state_service.update_job_state(
        job_id, JobState.VERSION_DIFF.value, detail="Analyzing architecture diff"
    )

    diff_messages = [
        SystemMessage(content=version_diff_prompt()),
        HumanMessage(
            content=[
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
        ),
    ]

    diff_result = model_diff.with_structured_output(VersionDiffResult).invoke(
        diff_messages, config
    )
    state_service.update_trail(job_id=job_id, flows=diff_result.diff)
    logger.info(
        "Architecture diff completed", job_id=job_id, proceed=diff_result.proceed
    )

    if not diff_result.proceed:
        state_service.update_job_state(
            job_id,
            JobState.FAILED.value,
            detail="Architecture changes are too extensive for an incremental update. Please create a new threat model instead.",
        )
        logger.info("Version aborted — diff too extensive", job_id=job_id)
        return Command(goto=END)

    return Command(
        goto=WORKFLOW_NODE_VERSION,
        update={"architecture_diff": diff_result.diff},
    )


# ============================================================================
# version_subgraph — task-steered versioning agent
# ============================================================================


def version_subgraph(state, config: RunnableConfig):
    """Run the versioning agent over the pre-computed architecture diff.

    Added to the parent graph as a plain function node.  Returns a
    ``Command(goto="finalize")`` with the updated threat model.
    """
    job_id = state.get("job_id", "unknown")

    # ---- Extract config and image data ------------------------------------

    model = CachePointModel(config["configurable"].get("model_version"))

    old_image = state.get("previous_image_data")
    new_image = state.get("image_data")
    if not old_image or not new_image:
        raise ValueError(
            f"Missing image data for version agent: old={'present' if old_image else 'MISSING'}, "
            f"new={'present' if new_image else 'MISSING'}"
        )

    image_type = _resolve_image_type(state)

    # ---- Build middleware and context message --------------------------------

    middleware = _build_version_middleware()
    system_prompt = create_version_agent_system_prompt()

    description = state.get("description", "")
    assumptions = state.get("assumptions", [])
    application_type = state.get("application_type", "hybrid")
    space_insights = state.get("space_insights")
    architecture_diff = state.get("architecture_diff") or ""

    current_state_text = _format_section(state, "all")
    assumptions_text = (
        "\n".join(f"- {a}" for a in assumptions) if assumptions else "(none)"
    )
    app_type_desc = APPLICATION_TYPE_DESCRIPTIONS.get(
        application_type, APPLICATION_TYPE_DESCRIPTIONS["hybrid"]
    )

    content = []

    if old_image:
        content.extend(
            [
                {"type": "text", "text": "This is the PREVIOUS architecture diagram:"},
                {"type": "text", "text": "<previous_architecture_diagram>"},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": image_type,
                        "data": old_image,
                    },
                },
                {"type": "text", "text": "</previous_architecture_diagram>"},
            ]
        )
    if new_image:
        content.extend(
            [
                {"type": "text", "text": "NEW architecture diagram:"},
                {"type": "text", "text": "<new_architecture_diagram>"},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": image_type,
                        "data": new_image,
                    },
                },
                {"type": "text", "text": "</new_architecture_diagram>"},
            ]
        )

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
            "text": f"""<application_type>
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
<architecture_diff>
{architecture_diff}
</architecture_diff>

<current_threat_model>
{current_state_text}
</current_threat_model>

Use the architecture diff above to update each section of the threat model accordingly.""",
        }
    )

    # ---- Create and run agent -----------------------------------------------

    agent = create_agent(
        model=model,
        middleware=[middleware],
        system_prompt=system_prompt,
        state_schema=VersionState,
    )

    result = agent.invoke(
        {
            "messages": [HumanMessage(content=content)],
            "assets": state.get("assets"),
            "system_architecture": state.get("system_architecture"),
            "threat_list": state.get("threat_list"),
            "description": description,
            "assumptions": assumptions,
            "job_id": job_id,
            "architecture_diff": architecture_diff,
            "application_type": application_type,
            "space_insights": space_insights,
        },
        config,
    )

    threat_list = result.get("threat_list")

    logger.debug(
        "Version completed, routing to finalize",
        job_id=job_id,
        threat_count=len(threat_list.threats) if threat_list else 0,
    )

    return Command(
        goto=WORKFLOW_NODE_FINALIZE,
        update={
            "threat_list": Overwrite(threat_list)
            if threat_list
            else ThreatsList(threats=[]),
            "assets": result.get("assets"),
            "system_architecture": result.get("system_architecture"),
        },
    )
