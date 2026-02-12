"""
Attack Tree Generation Workflow Module

This module defines the LangGraph workflow for generating attack trees using a ReACT pattern.
The workflow guides an LLM agent through creating comprehensive attack trees for identified threats.
"""

import time
from typing import Optional, TypedDict, Annotated
from langchain_core.messages import HumanMessage
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import StateGraph
from langgraph.types import Command
from langgraph.prebuilt import ToolNode

from attack_tree_models import AttackTreeLogical
from attack_tree_prompts import (
    create_attack_tree_system_prompt,
    create_attack_tree_human_message,
)
from config import config as app_config
from constants import JobState
from model_service import ModelService
from monitoring import logger
from state_tracking_service import StateService
from langgraph.graph import MessagesState
from constants import MAX_EXECUTION_TIME_SECONDS


# ============================================================================
# State Definition
# ============================================================================


def _attack_tree_reducer(
    left: Optional[AttackTreeLogical], right: Optional[AttackTreeLogical]
) -> Optional[AttackTreeLogical]:
    """
    Reducer function for attack_tree state to handle concurrent updates.

    All tools modify the same attack_tree object in-place, so this reducer
    typically receives the same object reference twice. It exists to prevent
    LangGraph errors when multiple tools return updates in the same step.

    Args:
        left: Current attack_tree value
        right: New attack_tree value from tool

    Returns:
        The attack_tree object (they should be the same reference)
    """
    # If both are None, return None
    if left is None and right is None:
        return None

    # If only one is provided, use it
    if left is None:
        return right
    if right is None:
        return left

    # Both are provided - return the right (newer) value
    # In practice, they should be the same object since tools modify in-place
    return right


def _counter_reducer(left: int, right: int) -> int:
    """
    Reducer function for counter fields (tool_use, validate_tool_use).

    When multiple tools update counters in parallel, take the maximum value
    to ensure we don't lose any increments.

    Args:
        left: Current counter value
        right: New counter value from tool

    Returns:
        The maximum of the two values
    """
    return max(left, right)


class AttackTreeState(MessagesState):
    """
    State for attack tree generation workflow.

    Attributes:
        attack_tree_id: Unique identifier for this attack tree generation
        threat_model_id: ID of the parent threat model
        threat_name: Name of the threat to generate attack tree for
        threat_description: Detailed description of the threat
        owner: User ID of the threat model owner
        messages: Conversation history between agent and tools
        attack_tree: The generated attack tree structure (logical format)
        tool_use: Counter for total tool invocations
        validate_tool_use: Counter for validate_attack_tree tool calls
        validate_called_since_reset: Flag tracking if validation was called
        start_time: Timestamp when workflow started (for timeout tracking)
    """

    attack_tree_id: str
    threat_model_id: str
    threat_name: str
    threat_description: str
    owner: str
    attack_tree: Annotated[Optional[AttackTreeLogical], _attack_tree_reducer]
    tool_use: Annotated[int, _counter_reducer]
    validate_tool_use: Annotated[int, _counter_reducer]
    validate_called_since_reset: bool
    start_time: Optional[float]


# ============================================================================
# Configuration Schema
# ============================================================================


class AttackTreeConfigSchema(TypedDict):
    """Configuration schema for attack tree workflow."""

    model_attack_tree_agent: object  # ChatBedrockConverse or similar


# Initialize services
state_service = StateService(app_config.agent_state_table)
model_service = ModelService()


# ============================================================================
# Workflow Nodes
# ============================================================================


def agent_node(state: AttackTreeState, config: RunnableConfig) -> Command:
    """
    Agent node that invokes the LLM with tool-calling capabilities.

    This node implements the ReACT pattern where the agent reasons about
    the attack tree generation task and calls tools to build the tree structure.

    Args:
        state: Current AttackTreeState with messages and context
        config: Runtime configuration with model references

    Returns:
        Command with updated messages containing the agent's response
    """
    attack_tree_id = state.get("attack_tree_id", "unknown")
    tool_use = state.get("tool_use", 0)
    validate_tool_use = state.get("validate_tool_use", 0)
    validate_called_since_reset = state.get("validate_called_since_reset", False)
    start_time = state.get("start_time")

    try:
        # Check for timeout (5 minutes max)
        if start_time:
            elapsed_time = time.time() - start_time
            if elapsed_time > MAX_EXECUTION_TIME_SECONDS:
                logger.error(
                    "Attack tree generation exceeded maximum execution time",
                    node="agent",
                    attack_tree_id=attack_tree_id,
                    elapsed_time=elapsed_time,
                    max_time=MAX_EXECUTION_TIME_SECONDS,
                )
                # Update status to failed
                try:
                    state_service.update_job_state(attack_tree_id, "failed")
                except Exception as status_error:
                    logger.error(
                        "Failed to update status to failed after timeout",
                        node="agent",
                        attack_tree_id=attack_tree_id,
                        error=str(status_error),
                    )
                raise RuntimeError(
                    f"Attack tree generation exceeded maximum execution time of {MAX_EXECUTION_TIME_SECONDS} seconds"
                )

        # Initialize messages if empty
        if not state.get("messages"):
            # Record start time
            if not start_time:
                start_time = time.time()
                logger.debug(
                    "Starting attack tree generation timer",
                    node="agent",
                    attack_tree_id=attack_tree_id,
                    start_time=start_time,
                )
            # Update job state to indicate attack tree generation has started
            try:
                state_service.update_job_state(
                    attack_tree_id, JobState.ATTACK_TREE.value
                )
            except Exception as e:
                logger.error(
                    "Failed to update job state",
                    node="agent",
                    attack_tree_id=attack_tree_id,
                    error=str(e),
                )
                # Continue - status update failure shouldn't stop workflow

            logger.debug(
                "Agent node invoked - initializing messages",
                node="agent",
                attack_tree_id=attack_tree_id,
                tool_use=tool_use,
                validate_tool_use=validate_tool_use,
                validate_called_since_reset=validate_called_since_reset,
            )

            # Create initial system prompt
            try:
                system_prompt = create_attack_tree_system_prompt()
            except Exception as e:
                logger.error(
                    "Failed to create system prompt",
                    node="agent",
                    attack_tree_id=attack_tree_id,
                    error=str(e),
                )
                raise RuntimeError(f"Failed to create system prompt: {str(e)}")

            # Fetch threat model context for enriched attack tree generation
            threat_object = None
            threat_model_context = None
            architecture_image = None

            try:
                threat_model_id = state.get("threat_model_id")
                threat_name = state.get("threat_name", "")

                if threat_model_id:
                    import boto3
                    import os
                    from utils import parse_s3_image_to_base64

                    dynamodb = boto3.resource("dynamodb")
                    agent_state_table_name = os.environ.get("AGENT_STATE_TABLE")
                    architecture_bucket = os.environ.get("ARCHITECTURE_BUCKET")

                    if agent_state_table_name:
                        table = dynamodb.Table(agent_state_table_name)
                        response = table.get_item(Key={"job_id": threat_model_id})

                        if "Item" in response:
                            item = response["Item"]
                            context_parts = []

                            # 1. Add threat model description if available
                            if "description" in item and item["description"]:
                                threat_model_description = item["description"]
                                context_parts.append(
                                    f"Threat Model Description:\n{threat_model_description}"
                                )
                                logger.debug(
                                    "✓ Context Element: Threat Model Description",
                                    node="agent",
                                    attack_tree_id=attack_tree_id,
                                    description_length=len(threat_model_description),
                                    description_preview=threat_model_description[:200]
                                    + "..."
                                    if len(threat_model_description) > 200
                                    else threat_model_description,
                                )

                            # 2. Retrieve and format architecture diagram as image
                            if "s3_location" in item and architecture_bucket:
                                try:
                                    architecture_image = parse_s3_image_to_base64(
                                        architecture_bucket, item["s3_location"]
                                    )
                                    if architecture_image:
                                        # Log architecture image details
                                        image_size = (
                                            len(architecture_image)
                                            if architecture_image
                                            else 0
                                        )
                                        logger.debug(
                                            "✓ Context Element: Architecture Diagram",
                                            node="agent",
                                            attack_tree_id=attack_tree_id,
                                            s3_location=item["s3_location"],
                                            image_size_bytes=image_size,
                                            has_image=True,
                                        )
                                except Exception as img_error:
                                    logger.warning(
                                        "Failed to retrieve architecture diagram",
                                        node="agent",
                                        attack_tree_id=attack_tree_id,
                                        error=str(img_error),
                                    )

                            # 3. Extract the full threat object from threat_list
                            if "threat_list" in item:
                                threat_list = item["threat_list"]
                                if (
                                    isinstance(threat_list, dict)
                                    and "threats" in threat_list
                                ):
                                    for threat in threat_list["threats"]:
                                        if threat.get("name") == threat_name:
                                            threat_object = threat
                                            # Log full threat object details
                                            logger.debug(
                                                "✓ Context Element: Threat Object",
                                                node="agent",
                                                attack_tree_id=attack_tree_id,
                                                threat_name=threat.get("name"),
                                                threat_description=threat.get(
                                                    "description", ""
                                                )[:200],  # First 200 chars
                                                threat_target=threat.get("target"),
                                                threat_source=threat.get("source"),
                                                threat_severity=threat.get("severity"),
                                                threat_stride=threat.get("stride"),
                                                has_mitigation=bool(
                                                    threat.get("mitigation")
                                                ),
                                            )
                                            break

                            # 4. Find matching target asset (only the one that matches threat.target)
                            if threat_object and "target" in threat_object:
                                target_name = threat_object["target"]
                                if "assets" in item and item["assets"]:
                                    assets_data = item["assets"]
                                    if (
                                        isinstance(assets_data, dict)
                                        and "assets" in assets_data
                                    ):
                                        for asset in assets_data["assets"]:
                                            if asset.get("name") == target_name:
                                                asset_text = f"Name: {asset.get('name')}\nDescription: {asset.get('description', 'No description')}"
                                                if "data_classification" in asset:
                                                    asset_text += f"\nData Classification: {asset['data_classification']}"
                                                context_parts.append(
                                                    f"Target Asset:\n{asset_text}"
                                                )
                                                # Log target asset details
                                                logger.debug(
                                                    "✓ Context Element: Target Asset",
                                                    node="agent",
                                                    attack_tree_id=attack_tree_id,
                                                    asset_name=asset.get("name"),
                                                    asset_description=asset.get(
                                                        "description", ""
                                                    )[:200],  # First 200 chars
                                                    data_classification=asset.get(
                                                        "data_classification"
                                                    ),
                                                    asset_type=asset.get("type"),
                                                )
                                                break

                            # 5. Find matching threat source (from system_architecture.threat_sources)
                            if threat_object and "source" in threat_object:
                                source_name = threat_object["source"]
                                if (
                                    "system_architecture" in item
                                    and item["system_architecture"]
                                ):
                                    sys_arch = item["system_architecture"]
                                    if (
                                        isinstance(sys_arch, dict)
                                        and "threat_sources" in sys_arch
                                    ):
                                        for threat_source in sys_arch["threat_sources"]:
                                            if (
                                                threat_source.get("category")
                                                == source_name
                                            ):
                                                source_text = f"Category: {threat_source.get('category')}\nDescription: {threat_source.get('description', 'No description')}\nExample: {threat_source.get('example', 'No example')}"
                                                if "capabilities" in threat_source:
                                                    source_text += f"\nCapabilities: {', '.join(threat_source['capabilities'])}"
                                                context_parts.append(
                                                    f"Threat Source:\n{source_text}"
                                                )
                                                # Log threat source details
                                                logger.debug(
                                                    "✓ Context Element: Threat Source",
                                                    node="agent",
                                                    attack_tree_id=attack_tree_id,
                                                    source_category=threat_source.get(
                                                        "category"
                                                    ),
                                                    source_description=threat_source.get(
                                                        "description", ""
                                                    )[:200],  # First 200 chars
                                                    source_example=threat_source.get(
                                                        "example", ""
                                                    )[:100],  # First 100 chars
                                                    capabilities_count=len(
                                                        threat_source.get(
                                                            "capabilities", []
                                                        )
                                                    ),
                                                    capabilities=threat_source.get(
                                                        "capabilities", []
                                                    ),
                                                )
                                                break

                            if context_parts:
                                threat_model_context = "\n\n".join(context_parts)
                                # Log complete context summary
                                logger.debug(
                                    "✓ Context Extraction Complete",
                                    node="agent",
                                    attack_tree_id=attack_tree_id,
                                    threat_model_id=threat_model_id,
                                    has_architecture_image=architecture_image
                                    is not None,
                                    has_threat_object=threat_object is not None,
                                    context_parts_count=len(context_parts),
                                    context_length=len(threat_model_context),
                                    context_preview=threat_model_context[:300] + "..."
                                    if len(threat_model_context) > 300
                                    else threat_model_context,
                                )
                            else:
                                logger.warning(
                                    "✗ No context parts extracted",
                                    node="agent",
                                    attack_tree_id=attack_tree_id,
                                    threat_model_id=threat_model_id,
                                )
            except Exception as e:
                logger.warning(
                    "Failed to fetch threat model context, continuing without it",
                    node="agent",
                    attack_tree_id=attack_tree_id,
                    error=str(e),
                    exc_info=True,
                )
                # Continue without context - not critical

            # Create initial human message with full threat context
            try:
                # Use threat object if available, otherwise create fallback object from state
                if not threat_object:
                    threat_object = {
                        "name": state.get("threat_name", ""),
                        "description": state.get("threat_description", ""),
                    }
                    logger.warning(
                        "Threat object not found in threat_list, using fallback from state",
                        node="agent",
                        attack_tree_id=attack_tree_id,
                    )

                human_message = create_attack_tree_human_message(
                    threat_object=threat_object,
                    threat_model_context=threat_model_context,
                    architecture_image=architecture_image,
                )
            except Exception as e:
                logger.error(
                    "Failed to create human message",
                    node="agent",
                    attack_tree_id=attack_tree_id,
                    error=str(e),
                )
                raise RuntimeError(f"Failed to create human message: {str(e)}")

            messages = [system_prompt, human_message]
        else:
            logger.debug(
                "Agent node invoked - continuing conversation",
                node="agent",
                attack_tree_id=attack_tree_id,
                message_count=len(state["messages"]),
                tool_use=tool_use,
                validate_tool_use=validate_tool_use,
                validate_called_since_reset=validate_called_since_reset,
            )
            messages = state["messages"]

        # Update status while agent is reasoning
        try:
            state_service.update_job_state(attack_tree_id, JobState.ATTACK_TREE.value)
        except Exception as e:
            logger.error(
                "Failed to update job state to thinking",
                node="agent",
                attack_tree_id=attack_tree_id,
                error=str(e),
            )
            # Continue - status update failure shouldn't stop workflow

        # Get model from config
        model = config["configurable"].get("model_attack_tree_agent")
        if not model:
            logger.error(
                "Model not found in config",
                node="agent",
                attack_tree_id=attack_tree_id,
            )
            raise RuntimeError("Model not configured for attack tree agent")

        # Import tools here to avoid circular dependency
        from attack_tree_tools import (
            create_attack_tree,
            read_attack_tree,
            add_attack_node,
            update_attack_node,
            delete_attack_node,
            validate_attack_tree,
        )

        tools = [
            create_attack_tree,
            read_attack_tree,
            add_attack_node,
            update_attack_node,
            delete_attack_node,
            validate_attack_tree,
        ]

        # Bind tools to model with "auto" tool choice
        try:
            model_with_tools = model_service.get_model_with_tools(
                model=model, tools=tools, tool_choice="auto"
            )
        except Exception as e:
            logger.error(
                "Failed to bind tools to model",
                node="agent",
                attack_tree_id=attack_tree_id,
                error=str(e),
            )
            raise RuntimeError(f"Failed to configure model with tools: {str(e)}")

        # Invoke model
        try:
            response = model_with_tools.invoke(messages, config)
        except Exception as e:
            logger.error(
                "Model invocation failed",
                node="agent",
                attack_tree_id=attack_tree_id,
                error=str(e),
                exc_info=True,
            )
            # Update status to failed
            try:
                state_service.update_job_state(
                    attack_tree_id,
                    "failed",
                    detail=f"Model invocation failed: {str(e)}",
                )
            except Exception as status_error:
                logger.error(
                    "Failed to update status to failed",
                    node="agent",
                    attack_tree_id=attack_tree_id,
                    error=str(status_error),
                )
            raise RuntimeError(f"Model invocation failed: {str(e)}")

        # Update status based on tool calls
        if hasattr(response, "tool_calls") and response.tool_calls:
            # Update status
            try:
                state_service.update_job_state(
                    attack_tree_id, JobState.ATTACK_TREE.value
                )
            except Exception as e:
                logger.error(
                    "Failed to update job state with tool call",
                    node="agent",
                    attack_tree_id=attack_tree_id,
                    error=str(e),
                )
                # Continue - status update failure shouldn't stop workflow

            logger.debug(
                "Agent made tool calls",
                node="agent",
                attack_tree_id=attack_tree_id,
                tool_calls=[tc.get("name", "unknown") for tc in response.tool_calls],
                tool_call_count=len(response.tool_calls),
            )
        else:
            logger.debug(
                "Agent completed without tool calls",
                node="agent",
                attack_tree_id=attack_tree_id,
            )

        # Update start_time in state if it was just initialized
        update_dict = {"messages": [response]}
        if start_time and not state.get("start_time"):
            update_dict["start_time"] = start_time

        return Command(update=update_dict)

    except Exception as e:
        logger.error(
            "Unexpected error in agent node",
            node="agent",
            attack_tree_id=attack_tree_id,
            error=str(e),
            exc_info=True,
        )
        # Update status to failed
        try:
            state_service.update_job_state(
                attack_tree_id, "failed", detail=f"Agent error: {str(e)}"
            )
        except Exception as status_error:
            logger.error(
                "Failed to update status to failed after agent error",
                node="agent",
                attack_tree_id=attack_tree_id,
                error=str(status_error),
            )
        # Re-raise to stop workflow
        raise


def should_continue(state: AttackTreeState) -> str:
    """
    Route to tools or continue based on LLM decision.

    Args:
        state: Current AttackTreeState with messages

    Returns:
        str: "tools" if tool calls exist, "continue" if agent is done
    """
    attack_tree_id = state.get("attack_tree_id", "unknown")
    messages = state["messages"]
    last_message = messages[-1]

    # Check if agent wants to continue with tool calls
    if last_message.tool_calls:
        logger.debug(
            "Routing to tools node",
            node="should_continue",
            attack_tree_id=attack_tree_id,
            route="tools",
        )
        return "tools"

    # No tool calls means the agent is done - route to continue for validation
    logger.debug(
        "Agent completed without tool calls - routing to continue node",
        node="should_continue",
        attack_tree_id=attack_tree_id,
        route="continue",
    )
    return "continue"


def _save_message_trail(state: AttackTreeState, attack_tree_id: str) -> None:
    """
    Save all messages from the conversation to the trail table.

    This function extracts all messages (not just reasoning) and saves them
    to the trail table for debugging and analysis purposes.

    Can be easily commented out if not needed.

    Args:
        state: Current AttackTreeState containing messages
        attack_tree_id: ID of the attack tree job
    """
    try:
        import json

        messages = state.get("messages", [])
        message_trail = []

        for msg in messages:
            # Skip system messages
            msg_type = type(msg).__name__
            if msg_type == "SystemMessage":
                continue

            # Convert message to a serializable format
            msg_dict = {}

            # Get message type
            msg_dict["type"] = msg_type

            # Get content
            if hasattr(msg, "content"):
                if isinstance(msg.content, str):
                    msg_dict["content"] = msg.content
                elif isinstance(msg.content, list):
                    msg_dict["content"] = msg.content
                else:
                    msg_dict["content"] = str(msg.content)

            # Get tool calls if present
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                msg_dict["tool_calls"] = [
                    {
                        "name": tc.get("name"),
                        "id": tc.get("id"),
                        "args": tc.get("args"),
                    }
                    for tc in msg.tool_calls
                ]

            # Get tool call id if present (for ToolMessage)
            if hasattr(msg, "tool_call_id"):
                msg_dict["tool_call_id"] = msg.tool_call_id

            message_trail.append(msg_dict)

        # Save to trail table if we have messages
        if message_trail:
            # Convert to JSON string for storage
            trail_json = json.dumps(message_trail, indent=2)

            logger.debug(
                "Saving message trail to trail table",
                node="continue",
                attack_tree_id=attack_tree_id,
                message_count=len(message_trail),
            )

            # Save using the state service
            # Using 'threats' field as a generic storage for attack tree messages
            state_service.update_trail(job_id=attack_tree_id, threats=[trail_json])

    except Exception as e:
        # Don't fail the workflow if trail saving fails
        logger.error(
            "Failed to save message trail",
            node="continue",
            attack_tree_id=attack_tree_id,
            error=str(e),
            exc_info=True,
        )


def continue_or_finish(state: AttackTreeState) -> Command:
    """
    Validate attack tree completeness and route to agent or finish.

    This function checks if the attack tree is complete and valid. If incomplete,
    it injects a human feedback message and routes back to the agent node. If
    complete and validated, it stores the attack tree and finishes the workflow.

    Args:
        state: Current AttackTreeState containing the attack_tree and messages

    Returns:
        Command: Routing command to either agent node or END
    """
    attack_tree_id = state.get("attack_tree_id", "unknown")
    attack_tree = state.get("attack_tree")
    validate_tool_use = state.get("validate_tool_use", 0)

    try:
        # Check if attack tree is empty or missing
        if not attack_tree:
            logger.warning(
                "Continue node detected empty attack tree - routing back to agent",
                node="continue",
                attack_tree_id=attack_tree_id,
                route="agent",
            )
            # Inject feedback message instructing agent to build the tree
            feedback_message = HumanMessage(
                content="The attack tree is empty. You must use the add_attack_node tool to create the attack tree structure, starting with the root goal and building out attack paths."
            )
            return Command(goto="agent", update={"messages": [feedback_message]})

        # Check if attack tree has at least one child (at least one attack path)
        if not attack_tree.children or len(attack_tree.children) == 0:
            logger.warning(
                "Continue node detected attack tree with no children - routing back to agent",
                node="continue",
                attack_tree_id=attack_tree_id,
                route="agent",
            )
            feedback_message = HumanMessage(
                content="The attack tree has a root goal but no attack paths. You must add child nodes (logic gates or attack techniques) to create at least one complete attack path."
            )
            return Command(goto="agent", update={"messages": [feedback_message]})

        # Check if validation was performed
        if validate_tool_use == 0:
            logger.debug(
                "Validation not performed - routing back to agent",
                node="continue",
                attack_tree_id=attack_tree_id,
                route="agent",
                validate_tool_use=validate_tool_use,
            )
            # Inject feedback message requesting validation
            feedback_message = HumanMessage(
                content="You have not performed validation yet. Please use the validate_attack_tree tool to check the completeness and correctness of the attack tree before finishing."
            )
            return Command(goto="agent", update={"messages": [feedback_message]})

        # Store the attack tree in DynamoDB
        try:
            from attack_tree_models import AttackTreeConverter
            import boto3
            from datetime import datetime
            import os

            # Convert logical structure to React Flow format
            converter = AttackTreeConverter()
            react_flow_data = converter.convert(attack_tree)

            # Save to attack-tree-data table
            dynamodb = boto3.resource("dynamodb")
            attack_tree_table_name = os.environ.get("ATTACK_TREE_TABLE")

            if not attack_tree_table_name:
                raise ValueError("ATTACK_TREE_TABLE environment variable not set")

            attack_tree_table = dynamodb.Table(attack_tree_table_name)

            attack_tree_table.put_item(
                Item={
                    "attack_tree_id": attack_tree_id,
                    "threat_model_id": state.get("threat_model_id"),
                    "threat_name": state.get("threat_name"),
                    "owner": state.get("owner"),
                    "created_at": datetime.utcnow().isoformat(),
                    "attack_tree_data": react_flow_data,
                }
            )

            logger.debug(
                "Successfully saved attack tree to DynamoDB",
                node="continue",
                attack_tree_id=attack_tree_id,
                node_count=len(react_flow_data.get("nodes", [])),
                edge_count=len(react_flow_data.get("edges", [])),
            )
        except Exception as e:
            logger.error(
                "Failed to save attack tree to DynamoDB",
                node="continue",
                attack_tree_id=attack_tree_id,
                error=str(e),
                exc_info=True,
            )
            # Update status to failed
            try:
                state_service.update_job_state(
                    attack_tree_id,
                    "failed",
                    detail=f"Failed to save attack tree: {str(e)}",
                )
            except Exception as status_error:
                logger.error(
                    "Failed to update status to failed after save error",
                    node="continue",
                    attack_tree_id=attack_tree_id,
                    error=str(status_error),
                )
            # Re-raise to stop workflow
            raise

        # Save message trail (can be commented out if not needed)
        # _save_message_trail(state, attack_tree_id)

        # Update status to completed
        try:
            state_service.update_job_state(
                attack_tree_id, "completed", detail="Attack tree generation completed"
            )
        except Exception as e:
            logger.error(
                "Failed to update job state to completed",
                node="continue",
                attack_tree_id=attack_tree_id,
                error=str(e),
            )
            # Continue - status update failure shouldn't stop workflow

        # Finish the workflow
        logger.debug(
            "Continue node finishing workflow",
            node="continue",
            attack_tree_id=attack_tree_id,
            route="END",
        )

        # Return Command to end the workflow
        # The attack_tree will be persisted by the service layer
        return Command(goto="__end__")

    except Exception as e:
        logger.error(
            "Unexpected error in continue node",
            node="continue",
            attack_tree_id=attack_tree_id,
            error=str(e),
            exc_info=True,
        )
        # Update status to failed
        try:
            state_service.update_job_state(
                attack_tree_id, "failed", detail=f"Validation error: {str(e)}"
            )
        except Exception as status_error:
            logger.error(
                "Failed to update status to failed after continue error",
                node="continue",
                attack_tree_id=attack_tree_id,
                error=str(status_error),
            )
        # Re-raise to stop workflow
        raise


# ============================================================================
# Workflow Graph Construction
# ============================================================================


# Import tools for ToolNode
# Note: Import happens here to avoid circular dependencies
# The actual tool implementations will be in attack_tree_tools.py
def create_attack_tree_workflow():
    """
    Create and compile the attack tree generation workflow.

    Returns:
        Compiled LangGraph workflow
    """
    # Import tools here to avoid circular dependency
    from attack_tree_tools import (
        create_attack_tree,
        read_attack_tree,
        add_attack_node,
        update_attack_node,
        delete_attack_node,
        validate_attack_tree,
    )

    tools = [
        create_attack_tree,
        read_attack_tree,
        add_attack_node,
        update_attack_node,
        delete_attack_node,
        validate_attack_tree,
    ]

    # Create tool node
    tool_node = ToolNode(tools)

    # Create workflow graph
    workflow = StateGraph(AttackTreeState, AttackTreeConfigSchema)

    # Add nodes
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", tool_node)
    workflow.add_node("continue", continue_or_finish)

    # Set entry point to agent
    workflow.set_entry_point("agent")

    # Add conditional edge from agent using should_continue
    # Routes to "tools" if tool calls exist, "continue" if no tool calls
    workflow.add_conditional_edges("agent", should_continue)

    # Add edge from tools back to agent
    workflow.add_edge("tools", "agent")

    # Conditional routing from continue node is handled by the continue_or_finish function
    # which returns Command with goto="agent" or goto="__end__"

    # Compile the workflow
    return workflow.compile()


# Create the compiled workflow
attack_tree_workflow = create_attack_tree_workflow()
