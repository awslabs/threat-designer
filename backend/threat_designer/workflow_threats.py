"""
Single-agent threats subgraph.

Pipeline: agent_init → agent ⇄ tools → validate → Command(goto="finalize", graph=PARENT)
"""

from config import config as app_config
from constants import (
    DEFAULT_METHODOLOGY,
    MAESTRO_ALWAYS_APPLICABLE,
    JobState,
    Methodology,
    StrideCategory,
)
import json

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import Command, Overwrite
from model_service import ModelService
from monitoring import logger
from partitioner import compute_partitions
from state_tracking_service import StateService
from tools import (
    read_threat_catalog,
    add_threats,
    remove_threat,
    gap_analysis,
    catalog_stats,
    create_dynamic_add_threats_tool,
)
from state import (
    ThreatState,
    ConfigSchema,
    MaestroLayerDetection,
    ThreatsList,
    create_constrained_threat_model,
)
from message_builder import (
    MessageBuilder,
    extract_reasoning_trails,
    inject_bedrock_cache_points,
    list_to_string,
)
from prompt_provider import (
    create_threats_agent_system_prompt,
    maestro_layer_detection_prompt,
)


# Initialize state service for tracking job state and trails
state_service = StateService(app_config.agent_state_table)

# Pre-compute categories for validation checks
ALL_STRIDE = {c.value for c in StrideCategory}

# Shared model service (stateless helper, safe to reuse)
model_service = ModelService()


# ============================================================================
# Coverage gate
# ============================================================================
#
# STRIDE can demand every category because all six apply to any system. MAESTRO
# layers are architectural components, so a system with no training pipeline has
# no Layer 2 and a single-agent system has no Layer 7 — demanding all seven would
# push the agent to invent threats purely to clear the gate.
#
# So the gate requires only the layers the architecture actually contains, as
# determined by _detect_maestro_layers, plus the two that apply unconditionally:
# Layer 6 is vertical and cross-layer threats span whatever exists. When detection
# is unavailable the gate falls back to those two rather than blocking the run.


def _missing_maestro_layers(state, covered: set[str]) -> set[str]:
    """Return MAESTRO layers the catalog must still cover."""
    detected = state.get("applicable_maestro_layers") or set()
    required = MAESTRO_ALWAYS_APPLICABLE | set(detected)
    return required - covered


def _coverage_feedback(state, threat_list) -> str | None:
    """Return gate feedback for the agent, or None when coverage is sufficient."""
    methodology = state.get("methodology") or DEFAULT_METHODOLOGY

    if methodology == Methodology.MAESTRO.value:
        covered = {t.maestro_layer for t in threat_list.threats if t.maestro_layer}
        missing = _missing_maestro_layers(state, covered)
        if missing:
            return (
                f"Missing MAESTRO layers: {', '.join(sorted(missing))}. "
                "Please add threats to cover these gaps."
            )
        return None

    covered = {t.stride_category for t in threat_list.threats if t.stride_category}
    missing = ALL_STRIDE - covered
    if missing:
        return (
            f"Missing STRIDE categories: {', '.join(sorted(missing))}. "
            "Please add threats to cover these gaps."
        )
    return None


# ============================================================================
# Helpers
# ============================================================================


def _build_message_builder(state) -> MessageBuilder:
    """Create a MessageBuilder from state fields."""
    return MessageBuilder(
        state.get("image_data"),
        state.get("description", ""),
        list_to_string(state.get("assumptions", [])),
        state.get("image_type"),
        image_metadata_list=state.get("image_metadata_list"),
    )


def _detect_maestro_layers(state: ThreatState, config: RunnableConfig) -> list[str] | None:
    """Determine which MAESTRO layers the architecture actually contains.

    The coverage gate needs this to avoid demanding threats for layers the system
    does not have. Returns None when detection fails, which leaves the gate on its
    conservative fallback rather than blocking the run on a scoping step.
    """
    assets = state.get("assets")
    system_architecture = state.get("system_architecture")

    architecture = {
        "description": state.get("description", ""),
        "assumptions": state.get("assumptions", []),
        "assets": (
            [a.model_dump() for a in assets.assets] if assets and assets.assets else []
        ),
        "data_flows": (
            [f.model_dump() for f in system_architecture.data_flows]
            if system_architecture
            else []
        ),
        "trust_boundaries": (
            [b.model_dump() for b in system_architecture.trust_boundaries]
            if system_architecture
            else []
        ),
    }

    messages = [
        SystemMessage(content=maestro_layer_detection_prompt()),
        HumanMessage(
            content=f"<architecture>\n{json.dumps(architecture, indent=2, default=str)}\n</architecture>"
        ),
    ]

    try:
        response = model_service.invoke_structured_model(
            messages,
            [MaestroLayerDetection],
            config,
            config["configurable"].get("reasoning", False),
            "model_struct",
        )
        detection = response["structured_response"]
        return list(detection.applicable_layers)
    except Exception as exc:
        logger.warning(
            "MAESTRO layer detection failed, falling back to always-applicable layers",
            node="agent_init",
            job_id=state.get("job_id", "unknown"),
            error=str(exc),
        )
        return None


def _build_tools(state: ThreatState) -> list:
    """Build full-scope tools for the threats agent."""
    assets = state.get("assets")
    system_architecture = state.get("system_architecture")
    methodology = state.get("methodology") or DEFAULT_METHODOLOGY

    asset_names: frozenset[str] = frozenset()
    if assets and assets.assets:
        asset_names = frozenset(a.name for a in assets.assets)

    source_cats: frozenset[str] = frozenset()
    if system_architecture and system_architecture.threat_sources:
        source_cats = frozenset(s.category for s in system_architecture.threat_sources)

    # The static add_threats tool classifies along STRIDE, so it is only a valid
    # shortcut when there is nothing to constrain *and* STRIDE is active.
    nothing_to_constrain = not asset_names and not source_cats
    if nothing_to_constrain and methodology == Methodology.STRIDE.value:
        return [
            add_threats,
            remove_threat,
            read_threat_catalog,
            catalog_stats,
            gap_analysis,
        ]

    try:
        _, DynThreatsList = create_constrained_threat_model(
            asset_names, source_cats, methodology
        )
        dynamic_add = create_dynamic_add_threats_tool(DynThreatsList)
        return [
            dynamic_add,
            remove_threat,
            read_threat_catalog,
            catalog_stats,
            gap_analysis,
        ]
    except Exception:
        return [
            add_threats,
            remove_threat,
            read_threat_catalog,
            catalog_stats,
            gap_analysis,
        ]


# ============================================================================
# agent_init
# ============================================================================


def agent_init(state: ThreatState, config: RunnableConfig) -> Command:
    """Compute partitions, build system+human messages for the threats agent."""
    job_id = state.get("job_id", "unknown")
    assets = state.get("assets")
    system_architecture = state.get("system_architecture")
    instructions = state.get("instructions")
    app_type = state.get("application_type", "hybrid")

    state_service.update_job_state(
        job_id, JobState.THREAT.value, detail="Initializing threat analysis"
    )

    # Compute partition groups for guidance
    asset_names = [a.name for a in assets.assets] if assets and assets.assets else []
    data_flows = system_architecture.data_flows if system_architecture else []
    trust_boundaries = (
        system_architecture.trust_boundaries if system_architecture else []
    )
    partitions = compute_partitions(asset_names, data_flows, trust_boundaries)

    logger.info(
        "Partition guidance computed",
        node="agent_init",
        job_id=job_id,
        num_groups=len(partitions),
        group_sizes=[len(p) for p in partitions],
    )

    # Build system prompt
    system_prompt = create_threats_agent_system_prompt(
        instructions, application_type=app_type
    )

    # Build human message with partition guidance
    msg_builder = _build_message_builder(state)

    # Check for starred threats in replay mode
    starred_threats = None
    threat_list = state.get("threat_list")
    if threat_list and threat_list.threats:
        starred = [t for t in threat_list.threats if t.starred]
        if starred:
            starred_threats = starred

    human_message = msg_builder.create_threats_agent_message(
        assets=assets,
        system_architecture=system_architecture,
        partitions=partitions,
        starred_threats=starred_threats,
    )

    # Inject space insights if present
    space_insights = state.get("space_insights")
    if space_insights and isinstance(human_message.content, list):
        insights_block = msg_builder.space_insights_block(space_insights)
        if insights_block:
            human_message.content.insert(-1, insights_block)

    update = {"messages": [system_prompt, human_message]}

    # Scope which MAESTRO layers the coverage gate should require. Only meaningful
    # under MAESTRO, and skipped on replay where a previous run already scoped it.
    methodology = state.get("methodology") or DEFAULT_METHODOLOGY
    if methodology == Methodology.MAESTRO.value and not state.get(
        "applicable_maestro_layers"
    ):
        state_service.update_job_state(
            job_id, JobState.THREAT.value, detail="Scoping MAESTRO layers"
        )
        detected = _detect_maestro_layers(state, config)
        if detected:
            update["applicable_maestro_layers"] = detected
            logger.info(
                "MAESTRO layers detected",
                node="agent_init",
                job_id=job_id,
                layers=detected,
            )

    return Command(update=update)


# ============================================================================
# agent (ReAct node)
# ============================================================================


def agent_node(state: ThreatState, config: RunnableConfig) -> Command:
    """Single ReAct agent node for threat modeling."""
    job_id = state.get("job_id", "unknown")

    state_service.update_job_state(
        job_id, JobState.THREAT.value, detail="Analyzing threats"
    )

    messages = state["messages"]
    model = config["configurable"].get("model_threats_agent")
    session_tools = _build_tools(state)
    model_with_tools = model_service.get_model_with_tools(
        model=model, tools=session_tools, tool_choice="auto"
    )
    response = model_with_tools.invoke(inject_bedrock_cache_points(messages), config)

    if hasattr(response, "tool_calls") and response.tool_calls:
        first_tool = response.tool_calls[0].get("name", "unknown")
        detail_map = {
            "add_threats": "Adding threats",
            "remove_threat": "Removing threat",
            "read_threat_catalog": "Reviewing catalog",
            "catalog_stats": "Checking coverage",
            "gap_analysis": "Running gap analysis",
        }
        detail = detail_map.get(first_tool, f"Calling {first_tool}")
        state_service.update_job_state(job_id, JobState.THREAT.value, detail=detail)

    return Command(update={"messages": [response]})


def should_continue(state: ThreatState):
    """Route agent to tools or validation."""
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "tools"
    return "validate"


# ============================================================================
# tools
# ============================================================================


def dynamic_tool_node(state: ThreatState) -> Command:
    """Tool node using full-scope dynamic tools."""
    session_tools = _build_tools(state)
    node = ToolNode(session_tools)
    return node.invoke(state)


# ============================================================================
# validate
# ============================================================================


def validate_node(state: ThreatState) -> Command:
    """Validate catalog and route to parent finalize."""
    job_id = state.get("job_id", "unknown")
    threat_list = state.get("threat_list")
    gap_tool_use = state.get("gap_tool_use", 0)

    # Check empty catalog
    if not threat_list or len(threat_list.threats) == 0:
        feedback = HumanMessage(
            content="The threat catalog is empty. You must add threats using the add_threats tool."
        )
        return Command(goto="agent", update={"messages": [feedback]})

    # Check classification coverage for the active methodology
    coverage_feedback = _coverage_feedback(state, threat_list)
    if coverage_feedback:
        return Command(
            goto="agent", update={"messages": [HumanMessage(content=coverage_feedback)]}
        )

    # Check gap analysis was performed
    if gap_tool_use == 0:
        feedback = HumanMessage(
            content="You have not performed gap analysis yet. Please call gap_analysis before finishing."
        )
        return Command(goto="agent", update={"messages": [feedback]})

    # Extract reasoning trails from messages
    messages = state.get("messages", [])
    reasoning_trails = extract_reasoning_trails(messages)

    if reasoning_trails:
        state_service.update_trail(job_id=job_id, threats=reasoning_trails)

    state_service.update_job_state(job_id, JobState.THREAT.value, detail=None)

    logger.debug(
        "Routing to parent finalize",
        node="validate",
        job_id=job_id,
        threat_count=len(threat_list.threats),
    )
    return Command(
        goto="finalize",
        update={"threat_list": Overwrite(threat_list)},
        graph=Command.PARENT,
    )


# ============================================================================
# Build the threats subgraph
# ============================================================================

workflow = StateGraph(ThreatState, ConfigSchema)

# Nodes
workflow.add_node("agent_init", agent_init)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", dynamic_tool_node)
workflow.add_node("validate", validate_node)

# Entry → agent_init → agent
workflow.set_entry_point("agent_init")
workflow.add_edge("agent_init", "agent")

# Agent ReAct loop
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")

# validate routes to parent via Command(graph=Command.PARENT) or loops back to agent

threats_subgraph = workflow.compile()
