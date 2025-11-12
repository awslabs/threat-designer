"""
This module defines the state sub-graph and orchestrates the threat generation logic in auto mode
"""

from config import config as app_config
from constants import (
    JobState,
    StrideCategory,
)
from langchain_core.messages import HumanMessage
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import StateGraph
from langgraph.types import Command, Overwrite
from langgraph.prebuilt import ToolNode
from model_service import ModelService
from monitoring import logger
from state_tracking_service import StateService
from tools import read_threat_catalog, add_threats, remove_threat, gap_analysis
from state import ThreatState, ConfigSchema
from message_builder import MessageBuilder, list_to_string
from prompts import create_agent_system_prompt


tools = [add_threats, remove_threat, read_threat_catalog, gap_analysis]
tool_node = ToolNode(tools)

# Initialize state service for tracking job state and trails
state_service = StateService(app_config.agent_state_table)


def create_agent_human_message(state: ThreatState) -> HumanMessage:
    """Create initial human message with architecture context for the agent.

    Args:
        state: Current ThreatState containing assets, flows, and threat list

    Returns:
        HumanMessage with architecture context and starred threats if in replay mode
    """
    msg_builder = MessageBuilder(
        state.get("image_data"),
        state.get("description", ""),
        list_to_string(state.get("assumptions", [])),
    )

    # Check for starred threats in replay mode
    starred_threats = []
    threat_list = state.get("threat_list")
    if threat_list and threat_list.threats:
        starred_threats = [t for t in threat_list.threats if t.starred]

    # Get assets and system architecture from state
    assets = state.get("assets")
    system_architecture = state.get("system_architecture")

    # Delegate all enrichment to MessageBuilder
    human_msg = msg_builder.create_threat_agent_message(
        assets=assets,
        system_architecture=system_architecture,
        starred_threats=starred_threats if starred_threats else None,
        threats=bool(threat_list and threat_list.threats)
    )
    return human_msg


def agent_node(state: ThreatState, config: RunnableConfig) -> Command:
    """Agent node that invokes the LLM with tool-calling capabilities.

    This node implements the ReAct pattern where the agent reasons about
    the threat modeling task and calls tools to build the threat catalog.

    Args:
        state: Current ThreatState with messages and context
        config: Runtime configuration with model references

    Returns:
        Command with updated messages containing the agent's response
    """
    job_id = state.get("job_id", "unknown")
    tool_use = state.get("tool_use", 0)
    gap_tool_use = state.get("gap_tool_use", 0)
    gap_called_since_reset = state.get("gap_called_since_reset", False)

    # Initialize messages if empty
    if not state.get("messages"):
        # Update job state to indicate threat generation has started
        state_service.update_job_state(job_id, JobState.THREAT.value, 0)

        logger.info(
            "Agent node invoked - initializing messages and updated job state",
            node="agent",
            job_id=job_id,
            job_state=JobState.THREAT.value,
            tool_use=tool_use,
            gap_tool_use=gap_tool_use,
            gap_called_since_reset=gap_called_since_reset,
        )

        # Create initial system prompt with optional instructions
        instructions = state.get("instructions")
        system_prompt = create_agent_system_prompt(instructions)

        # Create initial human message with context
        human_message = create_agent_human_message(state)

        messages = [system_prompt, human_message]
    else:
        logger.info(
            "Agent node invoked - continuing conversation",
            node="agent",
            job_id=job_id,
            message_count=len(state["messages"]),
            tool_use=tool_use,
            gap_tool_use=gap_tool_use,
            gap_called_since_reset=gap_called_since_reset,
        )
        messages = state["messages"]

    # Update status to "Thinking" while agent is reasoning
    state_service.update_job_state(job_id, JobState.THREAT.value, detail="Thinking")

    # Get model from config
    model = config["configurable"].get("model_threats_agent")

    # Bind tools to model with "auto" tool choice
    model_service = ModelService()
    model_with_tools = model_service.get_model_with_tools(
        model=model, tools=tools, tool_choice="auto"
    )

    # Invoke model
    response = model_with_tools.invoke(messages, config)

    # Update status based on tool calls
    if hasattr(response, "tool_calls") and response.tool_calls:
        # Get the first tool call to set appropriate status
        first_tool = response.tool_calls[0].get("name", "unknown")

        # Set status message based on tool being called
        if first_tool == "add_threats":
            detail = "Adding threats"
        elif first_tool == "delete_threats":
            detail = "Deleting threats"
        elif first_tool == "read_threat_catalog":
            detail = "Reviewing catalog"
        elif first_tool == "gap_analysis":
            detail = "Reviewing for gaps"
        else:
            detail = f"Calling {first_tool} tool"

        state_service.update_job_state(job_id, JobState.THREAT.value, detail=detail)

        logger.info(
            "Agent made tool calls",
            node="agent",
            job_id=job_id,
            tool_calls=[tc.get("name", "unknown") for tc in response.tool_calls],
            tool_call_count=len(response.tool_calls),
        )
    else:
        logger.info("Agent completed without tool calls", node="agent", job_id=job_id)

    return Command(update={"messages": [response]})


def should_continue(state: ThreatState):
    """Route to tools or continue based on LLM decision.

    Args:
        state: Current ThreatState with messages

    Returns:
        str: "tools" if tool calls exist, "continue" if agent is done
    """
    job_id = state.get("job_id", "unknown")
    messages = state["messages"]
    last_message = messages[-1]

    # Check if agent wants to continue with tool calls
    if last_message.tool_calls:
        logger.info(
            "Routing to tools node",
            node="should_continue",
            job_id=job_id,
            route="tools",
        )
        return "tools"

    # No tool calls means the agent is done - route to continue for validation
    logger.info(
        "Agent completed without tool calls - routing to continue node",
        node="should_continue",
        job_id=job_id,
        route="continue",
    )
    return "continue"


def continue_or_finish(state: ThreatState) -> Command:
    """Validate catalog completeness and route to agent or parent finalize.

    This function checks if the threat catalog is empty. If empty, it injects
    a human feedback message and routes back to the agent node to continue
    threat generation. It also checks if gap analysis was performed. If the catalog
    has threats and gap analysis was done, it extracts reasoning trails and routes
    to the parent graph's finalize node.

    Args:
        state: Current ThreatState containing the threat_list and messages

    Returns:
        Command: Routing command to either agent node or parent finalize node
    """
    job_id = state.get("job_id", "unknown")
    threat_list = state.get("threat_list")
    gap_tool_use = state.get("gap_tool_use", 0)

    # Check if catalog is empty or has zero threats
    if not threat_list or len(threat_list.threats) == 0:
        logger.warning(
            "Continue node detected empty catalog - routing back to agent",
            node="continue",
            job_id=job_id,
            route="agent",
            threat_count=0,
        )
        # Inject feedback message instructing agent to add threats
        feedback_message = HumanMessage(
            content="The threat catalog is empty. You must add threats to the catalog using the add_threats tool."
        )
        return Command(goto="agent", update={"messages": [feedback_message]})

    # Check STRIDE coverage
    all_stride_categories = {category.value for category in StrideCategory}
    catalog_stride_categories = {
        threat.stride_category for threat in threat_list.threats
    }
    missing_stride_categories = all_stride_categories - catalog_stride_categories

    # Combine coverage feedback if gaps exist
    if missing_stride_categories:
        feedback_parts = ["Coverage gaps detected:"]

        if missing_stride_categories:
            feedback_parts.append(
                f"- Missing STRIDE categories: {', '.join(sorted(missing_stride_categories))}"
            )

        feedback_parts.append("\nPlease add threats to address these gaps.")

        feedback_content = "\n".join(feedback_parts)

        logger.warning(
            "Coverage gaps detected - routing back to agent",
            node="continue",
            job_id=job_id,
            route="agent",
            missing_stride_categories=list(missing_stride_categories)
            if missing_stride_categories
            else None,
        )

        # Inject feedback message requesting threats for missing coverage
        feedback_message = HumanMessage(content=feedback_content)
        return Command(goto="agent", update={"messages": [feedback_message]})

    # Check if gap analysis was never performed
    if gap_tool_use == 0:
        logger.info(
            "Gap analysis not performed - routing back to agent",
            node="continue",
            job_id=job_id,
            route="agent",
            gap_tool_use=gap_tool_use,
        )
        # Inject feedback message requesting gap analysis
        feedback_message = HumanMessage(
            content="You have not performed gap analysis yet. Please use the gap_analysis tool to validate the completeness of the threat catalog before finishing."
        )
        return Command(goto="agent", update={"messages": [feedback_message]})

    # Extract reasoning trails from messages (oldest to latest)
    reasoning_trails = []
    messages = state.get("messages", [])
    for msg in messages:
        # Check if message has reasoning content in content list
        if hasattr(msg, "content") and isinstance(msg.content, list):
            for content_block in msg.content:
                if isinstance(content_block, dict):
                    # Anthropic/Bedrock format: {"type": "thinking", "thinking": "..."}
                    if content_block.get("type") == "thinking":
                        reasoning_trails.append(content_block.get("thinking", ""))
                    # Anthropic extended thinking format: {"type": "reasoning_content", "reasoning_content": {"text": "..."}}
                    elif content_block.get("type") == "reasoning_content":
                        reasoning_content = content_block.get("reasoning_content", {})
                        if isinstance(reasoning_content, dict):
                            text = reasoning_content.get("text", "")
                            if text:
                                reasoning_trails.append(text)
                    # OpenAI format: {"type": "reasoning", "summary": [{"type": "summary_text", "text": "..."}]}
                    elif content_block.get("type") == "reasoning":
                        summary = content_block.get("summary", [])
                        if isinstance(summary, list):
                            # Collect all summary texts from this message
                            summary_texts = []
                            for summary_item in summary:
                                if (
                                    isinstance(summary_item, dict)
                                    and summary_item.get("type") == "summary_text"
                                ):
                                    text = summary_item.get("text", "")
                                    if text:
                                        # Strip whitespace from each text to ensure clean joining
                                        summary_texts.append(text.strip())
                            # Combine all summary texts into one reasoning trail item
                            # Use double newlines for better rendering in UI
                            if summary_texts:
                                combined_reasoning = "\n\n".join(summary_texts)
                                reasoning_trails.append(combined_reasoning)
        # Check for reasoning in additional_kwargs (alternative OpenAI format)
        elif hasattr(msg, "additional_kwargs"):
            thinking = msg.additional_kwargs.get("reasoning_content")
            if thinking:
                reasoning_trails.append(thinking)

    # Update trail with reasoning if any was found
    if reasoning_trails:
        logger.info(
            "Extracted reasoning trails from agent messages",
            node="continue",
            job_id=job_id,
            reasoning_count=len(reasoning_trails),
        )
        state_service.update_trail(job_id=job_id, threats=reasoning_trails)

    # Reset status detail before routing to finalize
    state_service.update_job_state(job_id, JobState.THREAT.value, detail=None)

    # Route to parent finalize node when catalog has threats
    logger.info(
        "Continue node routing to parent finalize",
        node="continue",
        job_id=job_id,
        route="finalize",
        graph="parent",
        threat_count=len(threat_list.threats),
    )
    # Use Overwrite to bypass the reducer (operator.add) for threat_list
    return Command(
        goto="finalize",
        update={"threat_list": Overwrite(threat_list)},
        graph=Command.PARENT,
    )


# Create workflow graph for agentic threats subgraph
workflow = StateGraph(ThreatState, ConfigSchema)

# Add agent node for agentic workflow
workflow.add_node("agent", agent_node)

# Add tools node with ToolNode for tool execution
workflow.add_node("tools", tool_node)

# Add continue node for catalog validation
workflow.add_node("continue", continue_or_finish)

# Set entry point to agent
workflow.set_entry_point("agent")

# Add conditional edge from agent using should_continue
# Routes to "tools" if tool calls exist, "continue" if no tool calls
workflow.add_conditional_edges("agent", should_continue)

# Add edge from tools back to agent
workflow.add_edge("tools", "agent")

# Conditional routing from continue node is handled by the continue_or_finish function
# which returns Command with goto="agent" or goto="finalize" with graph=Command.PARENT

# Compile the subgraph
threats_subgraph = workflow.compile()
