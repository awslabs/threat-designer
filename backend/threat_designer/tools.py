from langchain.tools import tool, ToolRuntime
from langchain_core.messages import ToolMessage
from langchain_core.messages import SystemMessage
from state import ThreatsList, ContinueThreatModeling
from langgraph.types import Command, Overwrite
from typing import List, Annotated
from message_builder import MessageBuilder, list_to_string
from model_service import ModelService
from prompts import gap_prompt
from constants import MAX_GAP_ANALYSIS_USES, MAX_ADD_THREATS_USES, JobState
from monitoring import logger
from config import config as app_config
from state_tracking_service import StateService
import json
import time

# Initialize state service for status updates
state_service = StateService(app_config.agent_state_table)


@tool(
    name_or_callable="add_threats",
    description=""" Used to add new threats to the existing catalog""",
)
def add_threats(threats: ThreatsList, runtime: ToolRuntime):
    tool_use = runtime.state.get("tool_use", 0)
    job_id = runtime.state.get("job_id", "unknown")

    # Check limit
    if tool_use >= MAX_ADD_THREATS_USES:
        error_msg = f"Tool usage limit reached. Cannot add more threats. You have reached the maximum of {MAX_ADD_THREATS_USES} add_threats invocations."
        logger.warning(
            "Tool usage limit exceeded",
            tool="add_threats",
            current_usage=tool_use,
            max_usage=MAX_ADD_THREATS_USES,
            job_id=job_id,
        )
        return error_msg

    # Update status
    threat_count = len(threats.threats)
    state_service.update_job_state(
        job_id, JobState.THREAT.value, detail=f"{threat_count} threats added to catalog"
    )

    # Ensure all threats have starred=False (only users can star threats)
    for threat in threats.threats:
        threat.starred = False

    new_tool_use = tool_use + 1

    logger.info(
        "Tool invoked successfully",
        tool="add_threats",
        usage_count=new_tool_use,
        max_usage=MAX_ADD_THREATS_USES,
        threats_added=threat_count,
        job_id=job_id,
    )
    time.sleep(5)

    return Command(
        update={
            "threat_list": threats,
            "tool_use": new_tool_use,
            "messages": [
                ToolMessage(
                    f"""Successfully added: {len(threats.threats)} threats. \n
                    You have {MAX_ADD_THREATS_USES - new_tool_use} more add_threats invocations left""",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


@tool(
    name_or_callable="delete_threats",
    description="Used to delete threats from the existing catalog",
)
def remove_threat(
    threats: Annotated[List[str], "List of threat names to remove from the catalog"],
    runtime: ToolRuntime,
) -> Command:
    """Remove multiple threats from the threat list by name."""

    # Get current state
    current_threat_list = runtime.state.get("threat_list")
    tool_use = runtime.state.get("tool_use", 0)
    job_id = runtime.state.get("job_id", "unknown")

    # Update status
    threat_count = len(threats)
    state_service.update_job_state(
        job_id,
        JobState.THREAT.value,
        detail=f"{threat_count} threats deleted from catalog",
    )

    # Apply remove method for each threat name
    updated_threat_list = current_threat_list
    for threat_name in threats:
        updated_threat_list = updated_threat_list.remove(threat_name)

    new_tool_use = tool_use + 1

    time.sleep(5)

    return Command(
        update={
            "threat_list": Overwrite(updated_threat_list),
            "tool_use": new_tool_use,
            "messages": [
                ToolMessage(
                    "Successfully removed threats", tool_call_id=runtime.tool_call_id
                )
            ],
        },
    )


@tool(
    name_or_callable="read_threat_catalog",
    description="Read and retrieve the current list of threats from the catalog",
)
def read_threat_catalog(
    runtime: ToolRuntime,
    verbose: Annotated[
        bool, "Whether to include detailed threat information in the output"
    ] = False,
) -> str:
    """Read and return the current threat catalog."""

    # Get current state
    current_threat_list = runtime.state.get("threat_list")
    job_id = runtime.state.get("job_id", "unknown")

    # Update status
    state_service.update_job_state(
        job_id, JobState.THREAT.value, detail="Reviewing catalog"
    )

    time.sleep(5)

    # Check if there are any threats
    if not current_threat_list or not current_threat_list.threats:
        return "No threats found in the catalog."

    # Format the output
    output = f"Total threats: {len(current_threat_list.threats)}\n\n"

    if verbose:
        output += json.dumps(
            [threat.model_dump() for threat in current_threat_list.threats],
            indent=2,
        )
    else:
        for i, threat in enumerate(current_threat_list.threats, 1):
            output += f"{i}. {threat.name}\n"
            output += f"   Likelihood: {threat.likelihood}\n"
            output += f"   Stride category: {threat.stride_category}\n"
            output += "\n"

    return output


@tool(
    name_or_callable="gap_analysis",
    description="Analyze the current threat catalog for gaps and completeness. Maximum 3 invocations allowed. Returns identified gaps or confirmation of completeness.",
)
def gap_analysis(runtime: ToolRuntime) -> str:
    """Perform gap analysis on the current threat catalog."""

    # Get current gap_tool_use counter
    gap_tool_use = runtime.state.get("gap_tool_use", 0)
    job_id = runtime.state.get("job_id", "unknown")

    # Check limit
    if gap_tool_use >= MAX_GAP_ANALYSIS_USES:
        error_msg = f"Tool usage limit reached. Cannot perform more gap analyses. You have reached the maximum of {MAX_GAP_ANALYSIS_USES} gap_analysis invocations."
        logger.warning(
            "Tool usage limit exceeded",
            tool="gap_analysis",
            current_usage=gap_tool_use,
            max_usage=MAX_GAP_ANALYSIS_USES,
            job_id=job_id,
        )
        return error_msg

    # Update status
    state_service.update_job_state(
        job_id, JobState.THREAT.value, detail="Reviewing for gaps"
    )

    # Get current state
    state = runtime.state

    # Prepare gap analysis messages using MessageBuilder
    msg_builder = MessageBuilder(
        state.get("image_data"),
        state.get("description", ""),
        list_to_string(state.get("assumptions", [])),
    )

    # Convert threat_list to string for message
    threat_list = state.get("threat_list")
    threat_list_str = ""
    if threat_list and threat_list.threats:
        threat_list_str = json.dumps(
            [threat.model_dump() for threat in threat_list.threats],
            indent=2,
        )

    # Get previous gap analysis results
    gap = state.get("gap", [])
    gap_str = "\n".join(gap) if gap else ""

    # Create gap analysis message
    human_message = msg_builder.create_gap_analysis_message(
        json.dumps(
            [asset.model_dump() for asset in state.get("assets").assets], indent=2
        )
        if state.get("assets")
        else "",
        json.dumps(
            [flow.model_dump() for flow in state.get("system_architecture").data_flows],
            indent=2,
        )
        if state.get("system_architecture")
        else "",
        threat_list_str,
        gap_str,
    )

    # Create system prompt
    if state.get("instructions"):
        system_prompt = SystemMessage(content=gap_prompt(state.get("instructions")))
    else:
        system_prompt = SystemMessage(content=gap_prompt())

    messages = [system_prompt, human_message]

    # Invoke gap analysis model
    model_service = ModelService()
    config = runtime.config
    reasoning = config["configurable"].get("reasoning", False)

    try:
        logger.info(
            "Invoking gap analysis model",
            tool="gap_analysis",
            usage_count=gap_tool_use + 1,
            max_usage=MAX_GAP_ANALYSIS_USES,
            job_id=job_id,
        )

        response = model_service.invoke_structured_model(
            messages, [ContinueThreatModeling], config, reasoning, "model_gaps"
        )

        # Extract gap result
        gap_result = response["structured_response"]

        # Update gap_tool_use counter
        new_gap_tool_use = gap_tool_use + 1

        # Prepare update dictionary
        update_dict = {"gap_tool_use": new_gap_tool_use}

        # Update gap in state
        if not gap_result.stop and gap_result.gap:
            update_dict["gap"] = [gap_result.gap]

        # Format result message
        if gap_result.stop:
            update_dict["messages"] = [
                ToolMessage(
                    "Gap Analysis: The threat catalog is comprehensive and complete. No actionable gaps identified.",
                    tool_call_id=runtime.tool_call_id,
                )
            ]
            logger.info(
                "Gap analysis completed - catalog is comprehensive",
                tool="gap_analysis",
                usage_count=new_gap_tool_use,
                job_id=job_id,
            )
        else:
            update_dict["messages"] = [
                ToolMessage(
                    f"""
                    You have {MAX_GAP_ANALYSIS_USES - new_gap_tool_use} more gap_analysis invocations left \n\n
                    Gap identified: {gap_result.gap}""",
                    tool_call_id=runtime.tool_call_id,
                )
            ]
            logger.info(
                "Gap analysis completed - gaps identified",
                tool="gap_analysis",
                usage_count=new_gap_tool_use,
                gaps_found=True,
                job_id=job_id,
            )

        # Return Command with state updates and result message
        return Command(
            update=update_dict,
        )

    except Exception as e:
        # Log error with full context
        logger.error(
            "Gap analysis model invocation failed",
            tool="gap_analysis",
            usage_count=gap_tool_use,
            error=str(e),
            job_id=job_id,
            exc_info=True,
        )
        # Return user-friendly message as Command result
        error_msg = f"Gap analysis failed due to a model error. Please try again or proceed without gap analysis. Error: {str(e)}"
        return error_msg
