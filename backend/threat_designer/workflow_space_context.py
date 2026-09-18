"""
Space context subgraph — ReAct agent that queries a Bedrock Knowledge Base
and captures relevant security insights before the main threat modeling workflow.

Skipped entirely when no space_id is attached to the job and no system space is configured.
"""

import os
from typing import Any, List

import boto3
from constants import KB_QUERY_BUDGET, MAX_SPACE_INSIGHTS, SPACES_TABLE, JobState
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.runnables.config import RunnableConfig
from langchain_core.tools import tool
from langgraph.graph import StateGraph
from langgraph.types import Command
from message_builder import (
    MessageBuilder,
    extract_reasoning_trails,
    inject_bedrock_cache_points,
    list_to_string,
)
from monitoring import logger
from prompt_provider import create_space_context_system_prompt
from state import CaptureInsight, SpaceContextState, SpaceInsightsList, ConfigSchema
from state_tracking_service import StateService

from config import config as app_config

state_service = StateService(app_config.agent_state_table)

from model_service import ModelService

_model_service = ModelService()

KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
_bedrock_agent_client = None
_dynamodb_resource = None
_system_space_ids_cache = None
# Set when the last system-space discovery raised. Surfaced in the trail so a
# run whose purpose is "org standards always applied" does not silently proceed
# without them. Not cached alongside the ids: a transient failure must be
# retryable, not sticky for the container's lifetime.
_system_space_discovery_failed = False


def _get_bedrock_agent_client():
    global _bedrock_agent_client
    if _bedrock_agent_client is None:
        _bedrock_agent_client = boto3.client("bedrock-agent-runtime")
    return _bedrock_agent_client


def _get_dynamodb_resource():
    global _dynamodb_resource
    if _dynamodb_resource is None:
        _dynamodb_resource = boto3.resource("dynamodb")
    return _dynamodb_resource


def get_system_space_ids() -> List[str]:
    """Return the space_ids of all system spaces (governance-managed org-wide
    KBs), scanning the spaces table for records flagged system=True.

    Cached for the lifetime of the warm Lambda/runtime container: the set
    changes rarely and a per-job scan would be wasteful. Returns [] when no
    spaces table is configured so the feature is inert by default.
    """
    global _system_space_ids_cache
    if _system_space_ids_cache is not None:
        return _system_space_ids_cache
    if not SPACES_TABLE:
        _system_space_ids_cache = []
        return _system_space_ids_cache

    from boto3.dynamodb.conditions import Attr

    global _system_space_discovery_failed
    ids: List[str] = []
    try:
        table = _get_dynamodb_resource().Table(SPACES_TABLE)
        scan_kwargs = {
            "FilterExpression": Attr("system").eq(True),
            "ProjectionExpression": "space_id",
        }
        while True:
            resp = table.scan(**scan_kwargs)
            ids.extend(
                item["space_id"] for item in resp.get("Items", []) if "space_id" in item
            )
            last_key = resp.get("LastEvaluatedKey")
            if not last_key:
                break
            scan_kwargs["ExclusiveStartKey"] = last_key
    except Exception as e:
        # Do NOT cache: a transient scan failure must not permanently strand the
        # feature for this container. Latch the flag so the trail records that
        # org KBs could not be consulted; it is reset once per run at the start
        # of agent_node, never by a later success, so a fail-then-succeed
        # sequence within one run still surfaces the warning (the early queries
        # did run without org context).
        _system_space_discovery_failed = True
        logger.warning("Failed to discover system spaces", error=str(e))
        return []

    _system_space_ids_cache = ids
    return _system_space_ids_cache


def _do_retrieve(query: str, space_id: str, max_results: int = 5) -> list:
    """Raw KB retrieve call, returns list of result dicts."""
    if not KNOWLEDGE_BASE_ID or not space_id:
        return []
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
        return response.get("retrievalResults", [])
    except Exception as e:
        logger.warning("KB retrieve failed", error=str(e), space_id=space_id)
        return []


def _format_results(results: list) -> str:
    """Format retrieval results into readable text, split by source.

    Results carry a "_source" tag ("system" | "user") added by _retrieve_from_kb
    so the model can tell org-managed standards from team docs and label each
    captured insight accordingly. Numbering restarts per block.
    """
    if not results:
        return "No relevant results found for this query."

    def _block(tag: str, label: str, rows: list) -> str:
        parts = []
        for i, r in enumerate(rows, 1):
            content = r.get("content", {}).get("text", "")
            score = r.get("score", 0)
            if content:
                parts.append(f"[{label} {i} | relevance={score:.2f}]\n{content.strip()}")
        if not parts:
            return ""
        body = "\n\n---\n\n".join(parts)
        return f"<{tag}>\n{body}\n</{tag}>"

    system_rows = [r for r in results if r.get("_source") == "system"]
    user_rows = [r for r in results if r.get("_source") != "system"]

    blocks = [
        b
        for b in (
            _block("system_space_insights", "System result", system_rows),
            _block("user_space_insights", "Team result", user_rows),
        )
        if b
    ]
    return "\n\n".join(blocks) if blocks else "No relevant results found."


def _retrieve_from_kb(query: str, space_id: str, max_results: int = 5) -> str:
    """Call Bedrock KB Retrieve for the attached space plus every system space.

    System spaces (governance-managed, org-wide) are always included so
    mandatory organization standards apply to every threat model. The attached
    space_id may itself be a system space (system-only runs), so it is removed
    from the system set to avoid a duplicate retrieve. Results are tagged with
    their origin so _format_results and the captured insights can distinguish
    org standards from team docs.

    ponytail: fan-out is 1 + N Retrieve calls at max_results each (N = number of
    system spaces), serial. Fine while orgs keep a handful of system spaces; if
    that grows, batch/parallelize the system retrieves or merge them behind a
    single metadata filter.
    """
    system_ids = get_system_space_ids()
    user_results = []
    if space_id not in system_ids:
        for r in _do_retrieve(query, space_id, max_results):
            r["_source"] = "user"
            user_results.append(r)

    system_results = []
    for sid in system_ids:
        for r in _do_retrieve(query, sid, max_results):
            r["_source"] = "system"
            system_results.append(r)

    return _format_results(system_results + user_results)


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
    def capture_insight(insight: str, source: str = "user") -> str:
        """Record one insight from the space knowledge base that is relevant to this architecture.
        Call this once per insight. If nothing is relevant, do not call this tool.

        Args:
            insight: A concise description of what is relevant from the space knowledge base
                     for threat modeling this architecture.
            source: "system" if the insight came from a <system_space_insights> block
                    (org-managed, mandatory standards), "user" if from <user_space_insights>.

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


def _extract_insights_from_messages(messages: list) -> List["SpaceInsight"]:
    """Extract insights (text + source) from all capture_insight tool calls."""
    from state import SpaceInsight

    insights: List[SpaceInsight] = []
    for msg in messages:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                if tc.get("name") == "capture_insight":
                    args = tc.get("args", {})
                    text = args.get("insight", "").strip()
                    if text:
                        source = args.get("source", "user")
                        if source not in ("system", "user"):
                            source = "user"
                        insights.append(SpaceInsight(text=text, source=source))
    return insights


def agent_node(state: SpaceContextState, config: RunnableConfig) -> Command:
    """Agent node: invokes the LLM with space context tools."""
    job_id = state.get("job_id", "unknown")
    space_id = state.get("space_id", "")
    kb_query_count = state.get("kb_query_count", 0)

    tools = _build_tools(space_id, job_id)

    is_first_call = not state.get("messages")

    if is_first_call:
        # Reset the per-container discovery-failure latch at the start of each
        # run so a prior run's failure in this warm container is not attributed
        # to this one. It only ever gets set (never cleared) again during the
        # run, so any failure while querying survives to finish_node's trail.
        global _system_space_discovery_failed
        _system_space_discovery_failed = False
        state_service.update_job_state(
            job_id, JobState.SPACE_CONTEXT.value, detail="Querying knowledge base"
        )

        system_prompt = create_space_context_system_prompt()

        msg_builder = MessageBuilder(
            state.get("image_data"),
            state.get("description", ""),
            list_to_string(state.get("assumptions", [])),
            state.get("image_type"),
            image_metadata_list=state.get("image_metadata_list"),
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

    model = config["configurable"].get("model_space_context")
    model_with_tools = _model_service.get_model_with_tools(
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

    trail_parts = extract_reasoning_trails(messages)
    if _system_space_discovery_failed:
        trail_parts.append(
            "WARNING: organization-managed system spaces could not be discovered "
            "for this run (knowledge base lookup failed). Mandatory org standards "
            "were NOT consulted. Re-run once the issue is resolved to apply them."
        )
    if insights:
        trail_parts.append(
            "\n".join(
                f"- [{'org standard' if i.source == 'system' else 'team'}] {i.text}"
                for i in insights
            )
        )
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
