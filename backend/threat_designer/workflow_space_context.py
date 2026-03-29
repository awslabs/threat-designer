"""
Space context subgraph — ReAct agent that queries a Bedrock Knowledge Base
and captures relevant security insights before the main threat modeling workflow.

Skipped entirely when no space_id is attached to the job.
"""

import os
from typing import Any, List

import boto3
from constants import KB_QUERY_BUDGET, MAX_SPACE_INSIGHTS, JobState
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.runnables.config import RunnableConfig
from langchain_core.tools import tool
from langgraph.graph import StateGraph
from langgraph.types import Command
from message_builder import MessageBuilder, inject_bedrock_cache_points, list_to_string
from monitoring import logger
from prompt_provider import create_space_context_system_prompt
from state import CaptureInsight, SpaceContextState, SpaceInsightsList, ConfigSchema
from state_tracking_service import StateService

from config import config as app_config

state_service = StateService(app_config.agent_state_table)

KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
_bedrock_agent_client = None


def _get_bedrock_agent_client():
    global _bedrock_agent_client
    if _bedrock_agent_client is None:
        _bedrock_agent_client = boto3.client("bedrock-agent-runtime")
    return _bedrock_agent_client


def _retrieve_from_kb(query: str, space_id: str, max_results: int = 5) -> str:
    """Call Bedrock KB Retrieve API filtered to a specific space_id."""
    if not KNOWLEDGE_BASE_ID:
        return "Knowledge base not configured."
    try:
        client = _get_bedrock_agent_client()
        response = client.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={"text": query},
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": max_results,
                    "filter": {
                        "equals": {
                            "key": "space_id",
                            "value": space_id,
                        }
                    },
                }
            },
        )
        results = response.get("retrievalResults", [])
        if not results:
            return "No relevant results found for this query."

        parts = []
        for i, r in enumerate(results, 1):
            content = r.get("content", {}).get("text", "")
            score = r.get("score", 0)
            if content:
                parts.append(f"[Result {i} | relevance={score:.2f}]\n{content.strip()}")

        return "\n\n---\n\n".join(parts) if parts else "No relevant results found."
    except Exception as e:
        logger.warning("KB retrieve failed", error=str(e))
        return f"Knowledge base query failed: {str(e)}"


def _build_tools(space_id: str, job_id: str):
    """Build space-context tools closing over space_id and job_id."""

    @tool("query_knowledge_base")
    def query_knowledge_base(query: str) -> str:
        """Search the space knowledge base for information relevant to threat modeling this architecture.
        Use focused, specific queries.

        Args:
            query: A specific search query targeting security-relevant information.

        Returns:
            Formatted excerpts from matching documents.
        """
        return _retrieve_from_kb(query, space_id)

    @tool("capture_insight", args_schema=CaptureInsight)
    def capture_insight(insight: str) -> str:
        """Record one insight from the space knowledge base that is relevant to this architecture.
        Call this once per insight. If nothing is relevant, do not call this tool.

        Args:
            insight: A concise description of what is relevant from the space knowledge base
                     for threat modeling this architecture.

        Returns:
            Confirmation message.
        """
        return "Insight recorded."

    return [query_knowledge_base, capture_insight]


def _count_insights_from_messages(messages: list) -> int:
    """Count how many capture_insight tool calls have been made in the message history."""
    count = 0
    for msg in messages:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                if tc.get("name") == "capture_insight":
                    count += 1
    return count


def _extract_insights_from_messages(messages: list) -> List[str]:
    """Extract insight strings from all capture_insight tool calls in message history."""
    insights = []
    for msg in messages:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                if tc.get("name") == "capture_insight":
                    args = tc.get("args", {})
                    text = args.get("insight", "").strip()
                    if text:
                        insights.append(text)
    return insights


def agent_node(state: SpaceContextState, config: RunnableConfig) -> Command:
    """Agent node: invokes the LLM with space context tools."""
    job_id = state.get("job_id", "unknown")
    space_id = state.get("space_id", "")
    kb_query_count = state.get("kb_query_count", 0)

    tools = _build_tools(space_id, job_id)

    is_first_call = not state.get("messages")

    if is_first_call:
        state_service.update_job_state(
            job_id, JobState.SPACE_CONTEXT.value, detail="Querying knowledge base"
        )

        system_prompt = create_space_context_system_prompt()

        msg_builder = MessageBuilder(
            state.get("image_data"),
            state.get("description", ""),
            list_to_string(state.get("assumptions", [])),
            state.get("image_type"),
        )
        base = msg_builder.base_msg(caching=True, details=True)
        if state.get("summary"):
            base.append(
                {
                    "type": "text",
                    "text": f"<architecture_summary>{state['summary']}</architecture_summary>",
                }
            )
        base.append(
            {
                "type": "text",
                "text": "Analyze this architecture and query the knowledge base to find relevant security context.",
            }
        )

        messages = [system_prompt, HumanMessage(content=base)]
    else:
        messages = state["messages"]

    # Budget enforcement: if at limit, only allow capture_insight
    if kb_query_count >= KB_QUERY_BUDGET:
        budget_msg = HumanMessage(
            content=f"You have reached the maximum of {KB_QUERY_BUDGET} knowledge base queries. "
            "If you have additional insights to capture from what you have already retrieved, "
            "call capture_insight for each one now. Otherwise, finish without calling any tools."
        )
        messages = list(messages) + [budget_msg]
        # Bind only capture_insight
        capture_only = [t for t in tools if t.name == "capture_insight"]
        bound_tools = capture_only
    else:
        bound_tools = tools

    from model_service import ModelService

    model = config["configurable"].get("model_space_context")
    model_service = ModelService()
    model_with_tools = model_service.get_model_with_tools(
        model=model, tools=bound_tools, tool_choice="auto"
    )

    response = model_with_tools.invoke(inject_bedrock_cache_points(messages), config)

    # Track query count delta
    query_delta = 0
    if hasattr(response, "tool_calls") and response.tool_calls:
        for tc in response.tool_calls:
            if tc.get("name") == "query_knowledge_base":
                query_delta += 1

        # Update detail with insight count
        insight_count = _count_insights_from_messages(list(messages) + [response])
        if insight_count > 0:
            state_service.update_job_state(
                job_id,
                JobState.SPACE_CONTEXT.value,
                detail=f"{insight_count} insights extracted",
            )

    # On the first call, persist the initial system + human messages so subsequent
    # iterations have full context (MessagesState reducer appends, not replaces)
    new_messages = messages + [response] if is_first_call else [response]
    updates: dict[str, Any] = {"messages": new_messages}
    if query_delta > 0:
        updates["kb_query_count"] = query_delta

    return Command(update=updates)


def tool_node(state: SpaceContextState) -> Command:
    """Execute tool calls from the last message."""
    space_id = state.get("space_id", "")
    job_id = state.get("job_id", "unknown")
    tools_list = _build_tools(space_id, job_id)
    tools_by_name = {t.name: t for t in tools_list}

    messages = state["messages"]
    last_message = messages[-1]
    tool_messages = []

    for tc in last_message.tool_calls:
        tool_name = tc.get("name")
        tool_args = tc.get("args", {})
        tool_id = tc.get("id", tool_name)

        t = tools_by_name.get(tool_name)
        if t:
            result = t.invoke(tool_args)
        else:
            result = f"Unknown tool: {tool_name}"

        result_str = str(result)

        tool_messages.append(
            ToolMessage(content=result_str, tool_call_id=tool_id, name=tool_name)
        )

    return Command(update={"messages": tool_messages})


def should_continue(state: SpaceContextState) -> str:
    """Route to tools or finish based on LLM decision."""
    messages = state["messages"]
    last_message = messages[-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        # Cap: if already at max insights, skip to finish
        if _count_insights_from_messages(messages) >= MAX_SPACE_INSIGHTS:
            return "finish"
        return "tools"
    return "finish"


def _extract_reasoning_trails(messages: list) -> List[str]:
    """Extract thinking/reasoning content blocks from agent messages (same pattern as other nodes)."""
    trails = []
    for msg in messages:
        if hasattr(msg, "content") and isinstance(msg.content, list):
            for block in msg.content:
                if isinstance(block, dict):
                    if block.get("type") == "thinking":
                        trails.append(block.get("thinking", ""))
                    elif block.get("type") == "reasoning_content":
                        reasoning_content = block.get("reasoning_content", {})
                        if isinstance(reasoning_content, dict):
                            text = reasoning_content.get("text", "")
                            if text:
                                trails.append(text)
                    elif block.get("type") == "reasoning":
                        summary = block.get("summary", [])
                        if isinstance(summary, list):
                            texts = [
                                s.get("text", "").strip()
                                for s in summary
                                if isinstance(s, dict)
                                and s.get("type") == "summary_text"
                            ]
                            if texts:
                                trails.append("\n\n".join(texts))
        elif hasattr(msg, "additional_kwargs"):
            thinking = msg.additional_kwargs.get("reasoning_content")
            if thinking:
                trails.append(thinking)
    return trails


def finish_node(state: SpaceContextState) -> Command:
    """Extract insights from message history and return to parent graph."""
    job_id = state.get("job_id", "unknown")
    messages = state.get("messages", [])

    insights = _extract_insights_from_messages(messages)
    space_insights = SpaceInsightsList(insights=insights) if insights else None

    insight_count = len(insights)
    final_detail = (
        f"{insight_count} insights extracted"
        if insight_count > 0
        else "No relevant insights found"
    )
    state_service.update_job_state(
        job_id, JobState.SPACE_CONTEXT.value, detail=final_detail
    )

    trail_parts = _extract_reasoning_trails(messages)
    if insights:
        trail_parts.append("\n".join(f"- {i}" for i in insights))
    else:
        trail_parts.append(
            "No relevant insights found in the knowledge base for this architecture."
        )

    try:
        state_service.update_trail(
            job_id=job_id,
            space_context="\n\n".join(trail_parts),
        )
    except Exception as e:
        logger.warning(
            "Failed to write space context trail", job_id=job_id, error=str(e)
        )

    from constants import WORKFLOW_NODE_ASSET

    return Command(
        goto=WORKFLOW_NODE_ASSET,
        update={"space_insights": space_insights},
        graph=Command.PARENT,
    )


workflow = StateGraph(SpaceContextState, ConfigSchema)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", tool_node)
workflow.add_node("finish", finish_node)
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")

space_context_subgraph = workflow.compile()
