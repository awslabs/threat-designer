"""
Single-agent threats subgraph.

Pipeline: agent_init → agent ⇄ tools → validate → Command(goto="finalize", graph=PARENT)
"""

from config import config as app_config
from constants import (
    JobState,
    StrideCategory,
)
from langchain_core.messages import HumanMessage
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
    ThreatsList,
    create_constrained_threat_model,
)
from message_builder import (
    MessageBuilder,
    extract_reasoning_trails,
    inject_bedrock_cache_points,
    list_to_string,
)
from prompt_provider import create_threats_agent_system_prompt


# Initialize state service for tracking job state and trails
state_service = StateService(app_config.agent_state_table)

# Pre-compute STRIDE categories for validation checks
ALL_STRIDE = {c.value for c in StrideCategory}

# Shared model service (stateless helper, safe to reuse)
model_service = ModelService()


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
    )


def _build_tools(state: ThreatState) -> list:
    """Build full-scope tools for the threats agent."""
    assets = state.get("assets")
    system_architecture = state.get("system_architecture")

    asset_names: frozenset[str] = frozenset()
    if assets and assets.assets:
        asset_names = frozenset(a.name for a in assets.assets)

    source_cats: frozenset[str] = frozenset()
    if system_architecture and system_architecture.threat_sources:
        source_cats = frozenset(s.category for s in system_architecture.threat_sources)

    if not asset_names and not source_cats:
        return [
            add_threats,
            remove_threat,
            read_threat_catalog,
            catalog_stats,
            gap_analysis,
        ]

    try:
        _, DynThreatsList = create_constrained_threat_model(asset_names, source_cats)
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

    return Command(update={"messages": [system_prompt, human_message]})


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

    # Check STRIDE coverage
    catalog_stride = {t.stride_category for t in threat_list.threats}
    missing = ALL_STRIDE - catalog_stride
    if missing:
        feedback = HumanMessage(
            content=f"Missing STRIDE categories: {', '.join(sorted(missing))}. Please add threats to cover these gaps."
        )
        return Command(goto="agent", update={"messages": [feedback]})

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
