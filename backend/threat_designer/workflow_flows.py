"""
This module defines the flows sub-graph that orchestrates the agentic flow definition workflow.
Follows the same ReAct pattern as workflow_threats.py.
"""

from config import config as app_config
from constants import (
    JobState,
    WORKFLOW_NODE_THREATS_AGENTIC,
    WORKFLOW_NODE_THREATS_TRADITIONAL,
)
from langchain_core.messages import HumanMessage
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import StateGraph
from langgraph.types import Command
from langgraph.prebuilt import ToolNode
from model_service import ModelService
from monitoring import logger
from state_tracking_service import StateService
from tools import (
    add_data_flows,
    add_trust_boundaries,
    add_threat_sources,
    create_dynamic_add_data_flows_tool,
    create_dynamic_add_trust_boundaries_tool,
    delete_data_flows,
    delete_trust_boundaries,
    delete_threat_sources,
    flows_stats,
)
from state import FlowsState, ConfigSchema, create_constrained_flow_models
from message_builder import MessageBuilder, inject_bedrock_cache_points, list_to_string
from prompt_provider import create_flows_agent_system_prompt


# Flow tools list (static fallback)
tools = [
    add_data_flows,
    add_trust_boundaries,
    add_threat_sources,
    delete_data_flows,
    delete_trust_boundaries,
    delete_threat_sources,
    flows_stats,
]

# Initialize state service for tracking job state and trails
state_service = StateService(app_config.agent_state_table)


def _build_session_tools(state: FlowsState) -> list:
    """Build session-specific tools with dynamic add tools if asset names are available.

    Extracts asset names from state, creates constrained DataFlow/TrustBoundary
    models with Literal entity fields, and returns a tools list with dynamic
    add tools replacing the static ones. Falls back to static tools on failure.
    """
    assets = state.get("assets")

    asset_names: set[str] = set()
    if assets and assets.assets:
        asset_names = {a.name for a in assets.assets}

    if not asset_names:
        return tools

    try:
        _, _, DynDataFlowsList, DynTrustBoundariesList = create_constrained_flow_models(
            asset_names
        )
        dynamic_add_flows = create_dynamic_add_data_flows_tool(DynDataFlowsList)
        dynamic_add_boundaries = create_dynamic_add_trust_boundaries_tool(
            DynTrustBoundariesList
        )
        session_tools = [
            dynamic_add_flows,
            dynamic_add_boundaries,
            add_threat_sources,
            delete_data_flows,
            delete_trust_boundaries,
            delete_threat_sources,
            flows_stats,
        ]
        logger.debug(
            "Dynamic flow tools created",
            asset_count=len(asset_names),
        )
        return session_tools
    except Exception as e:
        logger.warning(
            "Failed to create dynamic flow models, falling back to static tools",
            error=str(e),
        )
        return tools


def dynamic_tool_node(state: FlowsState) -> Command:
    """Tool node that uses session-specific dynamic tools."""
    session_tools = _build_session_tools(state)
    node = ToolNode(session_tools)
    return node.invoke(state)


def create_agent_human_message(state: FlowsState) -> HumanMessage:
    """Create initial human message with architecture context for the flows agent.

    Builds a HumanMessage containing the architecture diagram, description,
    assumptions, and identified assets using MessageBuilder.

    Args:
        state: Current FlowsState containing assets, image_data, description, assumptions

    Returns:
        HumanMessage with architecture context for the flows agent
    """
    msg_builder = MessageBuilder(
        state.get("image_data"),
        state.get("description", ""),
        list_to_string(state.get("assumptions", [])),
        state.get("image_type"),
    )

    # Start with base message (architecture diagram, description, assumptions) with caching
    base_message = msg_builder.base_msg(caching=True, details=True)

    # Add identified assets context
    assets = state.get("assets")
    if assets:
        base_message.append(
            {
                "type": "text",
                "text": f"<identified_assets_and_entities>{str(assets)}</identified_assets_and_entities>",
            }
        )

    # Inject space insights if present
    space_insights = state.get("space_insights")
    if space_insights:
        insights_block = msg_builder.space_insights_block(space_insights)
        if insights_block:
            base_message.append(insights_block)

    # Add instruction to define flows
    base_message.append(
        {
            "type": "text",
            "text": "Analyze the architecture and define data flows, trust boundaries, and threat sources using the provided tools.",
        }
    )

    return HumanMessage(content=base_message)


def agent_node(state: FlowsState, config: RunnableConfig) -> Command:
    """Agent node that invokes the LLM with tool-calling capabilities for flow definition.

    Initializes messages on first call with system prompt and human message.
    Continues conversation on subsequent calls. Binds flow tools with tool_choice="auto".

    Args:
        state: Current FlowsState with messages and context
        config: Runtime configuration with model references

    Returns:
        Command with updated messages containing the agent's response
    """
    job_id = state.get("job_id", "unknown")
    tool_use = state.get("tool_use", 0)

    # Initialize messages if empty
    if not state.get("messages"):
        # Update job state to indicate flow definition has started
        state_service.update_job_state(job_id, JobState.FLOW.value, 0)

        logger.debug(
            "Flows agent node invoked - initializing messages",
            node="agent",
            job_id=job_id,
            job_state=JobState.FLOW.value,
            tool_use=tool_use,
        )

        # Create initial system prompt with optional instructions
        instructions = state.get("instructions")
        app_type = state.get("application_type", "hybrid")
        system_prompt = create_flows_agent_system_prompt(
            instructions, application_type=app_type
        )

        # Create initial human message with context
        human_message = create_agent_human_message(state)

        messages = [system_prompt, human_message]
    else:
        logger.debug(
            "Flows agent node invoked - continuing conversation",
            node="agent",
            job_id=job_id,
            message_count=len(state["messages"]),
            tool_use=tool_use,
        )
        messages = state["messages"]

    # Update status to "Thinking" while agent is reasoning
    state_service.update_job_state(job_id, JobState.FLOW.value, detail="Thinking")

    # Get model from config
    model = config["configurable"].get("model_flows")

    # Build session-specific tools with dynamic constraints
    session_tools = _build_session_tools(state)

    # Bind tools to model with "auto" tool choice
    model_service = ModelService()
    model_with_tools = model_service.get_model_with_tools(
        model=model, tools=session_tools, tool_choice="auto"
    )

    # Invoke model with cache breakpoints for ReAct loop efficiency
    response = model_with_tools.invoke(inject_bedrock_cache_points(messages), config)

    # Update status based on tool calls
    if hasattr(response, "tool_calls") and response.tool_calls:
        first_tool = response.tool_calls[0].get("name", "unknown")

        # Set status message based on tool being called
        tool_detail_map = {
            "add_data_flows": "Adding data flows",
            "add_trust_boundaries": "Adding trust boundaries",
            "add_threat_sources": "Adding threat sources",
            "delete_data_flows": "Deleting data flows",
            "delete_trust_boundaries": "Deleting trust boundaries",
            "delete_threat_sources": "Deleting threat sources",
            "flows_stats": "Checking stats",
        }
        detail = tool_detail_map.get(first_tool, f"Calling {first_tool} tool")

        state_service.update_job_state(job_id, JobState.FLOW.value, detail=detail)

        logger.debug(
            "Flows agent made tool calls",
            node="agent",
            job_id=job_id,
            tool_calls=[tc.get("name", "unknown") for tc in response.tool_calls],
            tool_call_count=len(response.tool_calls),
        )
    else:
        logger.debug(
            "Flows agent completed without tool calls",
            node="agent",
            job_id=job_id,
        )

    return Command(update={"messages": [response]})


def should_continue(state: FlowsState):
    """Route to tools or continue based on LLM decision.

    Args:
        state: Current FlowsState with messages

    Returns:
        str: "tools" if tool calls exist, "continue" if agent is done
    """
    job_id = state.get("job_id", "unknown")
    messages = state["messages"]
    last_message = messages[-1]

    if last_message.tool_calls:
        logger.debug(
            "Routing to tools node",
            node="should_continue",
            job_id=job_id,
            route="tools",
        )
        return "tools"

    logger.debug(
        "Flows agent completed without tool calls - routing to continue node",
        node="should_continue",
        job_id=job_id,
        route="continue",
    )
    return "continue"


def continue_or_finish(state: FlowsState) -> Command:
    """Validate FlowsList completeness and route to agent or parent graph.

    Checks that the FlowsList contains at least 1 data flow, 1 trust boundary,
    and 4 threat sources. If incomplete, injects a HumanMessage and routes back
    to the agent. If complete, extracts reasoning trails and routes to the parent
    graph with the FlowsList as system_architecture.

    Args:
        state: Current FlowsState containing the flows_list and messages

    Returns:
        Command: Routing command to either agent node or parent graph
    """
    job_id = state.get("job_id", "unknown")
    flows_list = state.get("flows_list")

    data_flow_count = len(flows_list.data_flows) if flows_list else 0
    trust_boundary_count = len(flows_list.trust_boundaries) if flows_list else 0
    threat_source_count = len(flows_list.threat_sources) if flows_list else 0

    total = data_flow_count + trust_boundary_count + threat_source_count

    # If completely empty, instruct agent to use tools
    if total == 0:
        logger.warning(
            "Continue node detected empty FlowsList - routing back to agent",
            node="continue",
            job_id=job_id,
            route="agent",
        )
        feedback_message = HumanMessage(
            content="The FlowsList is empty. You must use the add_data_flows, add_trust_boundaries, and add_threat_sources tools to build the FlowsList."
        )
        return Command(goto="agent", update={"messages": [feedback_message]})

    # Check completeness thresholds
    missing = []
    if data_flow_count < 1:
        missing.append("data flows (need at least 1)")
    if trust_boundary_count < 1:
        missing.append("trust boundaries (need at least 1)")
    if threat_source_count < 4:
        missing.append(f"threat sources (have {threat_source_count}, need at least 4)")

    if missing:
        missing_str = ", ".join(missing)
        logger.warning(
            "FlowsList incomplete - routing back to agent",
            node="continue",
            job_id=job_id,
            route="agent",
            missing=missing,
            data_flows=data_flow_count,
            trust_boundaries=trust_boundary_count,
            threat_sources=threat_source_count,
        )
        feedback_message = HumanMessage(
            content=f"The FlowsList is incomplete. Missing categories: {missing_str}. Please add the missing entries using the appropriate tools."
        )
        return Command(goto="agent", update={"messages": [feedback_message]})

    # FlowsList is complete — extract reasoning trails
    reasoning_trails = []
    messages = state.get("messages", [])
    for msg in messages:
        if hasattr(msg, "content") and isinstance(msg.content, list):
            for content_block in msg.content:
                if isinstance(content_block, dict):
                    # Bedrock format
                    if content_block.get("type") == "thinking":
                        reasoning_trails.append(content_block.get("thinking", ""))
                    elif content_block.get("type") == "reasoning_content":
                        reasoning_content = content_block.get("reasoning_content", {})
                        if isinstance(reasoning_content, dict):
                            text = reasoning_content.get("text", "")
                            if text:
                                reasoning_trails.append(text)
                    # OpenAI format
                    elif content_block.get("type") == "reasoning":
                        summary = content_block.get("summary", [])
                        if isinstance(summary, list):
                            summary_texts = []
                            for summary_item in summary:
                                if (
                                    isinstance(summary_item, dict)
                                    and summary_item.get("type") == "summary_text"
                                ):
                                    text = summary_item.get("text", "")
                                    if text:
                                        summary_texts.append(text.strip())
                            if summary_texts:
                                reasoning_trails.append("\n\n".join(summary_texts))
        elif hasattr(msg, "additional_kwargs"):
            thinking = msg.additional_kwargs.get("reasoning_content")
            if thinking:
                reasoning_trails.append(thinking)

    # Update trail with reasoning if any was found
    if reasoning_trails:
        logger.debug(
            "Extracted reasoning trails from flows agent messages",
            node="continue",
            job_id=job_id,
            reasoning_count=len(reasoning_trails),
        )
        state_service.update_trail(job_id=job_id, flows="\n\n".join(reasoning_trails))

    # Reset status detail before routing to parent
    state_service.update_job_state(job_id, JobState.FLOW.value, detail=None)

    # Route to the correct threats node based on iteration parameter
    iteration = state.get("iteration", 0)
    threats_node = (
        WORKFLOW_NODE_THREATS_AGENTIC
        if iteration == 0
        else WORKFLOW_NODE_THREATS_TRADITIONAL
    )

    logger.debug(
        "Continue node routing to parent graph",
        node="continue",
        job_id=job_id,
        route=threats_node,
        data_flows=data_flow_count,
        trust_boundaries=trust_boundary_count,
        threat_sources=threat_source_count,
    )

    parent_update = {"system_architecture": flows_list}
    space_insights = state.get("space_insights")
    if space_insights is not None:
        parent_update["space_insights"] = space_insights

    return Command(
        goto=threats_node,
        update=parent_update,
        graph=Command.PARENT,
    )


# Create workflow graph for agentic flows subgraph
workflow = StateGraph(FlowsState, ConfigSchema)

# Add agent node
workflow.add_node("agent", agent_node)

# Add tools node with dynamic tool support
workflow.add_node("tools", dynamic_tool_node)

# Add continue node for FlowsList validation
workflow.add_node("continue", continue_or_finish)

# Set entry point to agent
workflow.set_entry_point("agent")

# Add conditional edge from agent using should_continue
# Routes to "tools" if tool calls exist, "continue" if no tool calls
workflow.add_conditional_edges("agent", should_continue)

# Add edge from tools back to agent
workflow.add_edge("tools", "agent")

# Conditional routing from continue node is handled by the continue_or_finish function
# which returns Command with goto="agent" or goto="flows" with graph=Command.PARENT

# Compile the subgraph
flows_subgraph = workflow.compile()
