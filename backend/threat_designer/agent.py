from langchain_core.messages.human import HumanMessage


from langgraph.graph import StateGraph, END
from langgraph.graph import StateGraph
import os
from utils import update_job_state, create_dynamodb_item
import logging
import time
from state import AssetsList, ContinueThreatModeling, FlowsList, ThreatsList, AgentState
from prompts import asset_prompt, flow_prompt, gap_prompt, threats_improve_prompt, threats_prompt, structure_prompt
from typing_extensions import TypedDict
from typing import Any
from datetime import datetime


logger = logging.getLogger()
logger.setLevel(logging.INFO)


AGENT_TABLE = os.environ.get("AGENT_STATE_TABLE")
MODEL = os.environ.get("MODEL")
MAX_RETRY = 15

class ConfigSchema(TypedDict):
    model_main: Any
    model_gap: Any
    model_struct: Any
    start_time: datetime
    reasoning: bool


human_structure = HumanMessage(
        content=[
            {"type": "text", "text": "Convert the <response> into a structured output"},
        ]
    )


def image_to_base64(state: AgentState):
    return {
        "image_data": state["image_data"]
    }

def list_to_string(str_list):
    if not str_list:
        return " "
    return "\n".join(str_list)


def define_assets(state, config):
    model_structured = config["configurable"].get("model_struct")
    model = config["configurable"].get("model_main")
    update_job_state(state["job_id"], "ASSETS")
    assumptions = list_to_string(state.get("assumptions", []))
    tools = [AssetsList]
    
    human_message = HumanMessage(
        content=[
            {"type": "text", "text": "Analyze the following architecture:"},
            {"type": "image_url", "image_url": {
                "url": f"data:image/jpeg;base64,{state['image_data']}"}},
            {"type": "text", "text": f"<description>{state.get('description', '')}</description>"},
            {"type": "text", "text": f"<assumptions>{assumptions}</assumptions>"}
        ]
    )

    if config["configurable"].get("reasoning", True):
        messages = [asset_prompt(), human_message]
        analysis = model.invoke(messages)
        content = analysis.content[1] if isinstance(analysis.content, list) else analysis.content
        struct_message = [structure_prompt(content), human_structure]
    else:
        struct_message = [asset_prompt(), human_message]

    model_with_tools = model_structured.bind_tools(tools, tool_choice="any")
    response = model_with_tools.invoke(struct_message)
    response = AssetsList(**response.tool_calls[0]['args'])

    return {
        "assets": response
    }

def define_flows(state, config):
    model_structured = config["configurable"].get("model_struct")
    model = config["configurable"].get("model_main")
    update_job_state(state["job_id"], "FLOW")
    assumptions = list_to_string(state.get("assumptions", []))
    tools = [FlowsList]

    human_message = HumanMessage(
        content=[
            {"type": "text", "text": "This is the architecture and related information:"},
            {"type": "image_url", "image_url": {
                "url": f"data:image/jpeg;base64,{state['image_data']}"}},
            {"type": "text", "text": f"<description>{state.get('description', '')}</description>"},
            {"type": "text", "text": f"<assumptions>{assumptions}</assumptions>"}
        ]
    )

    if config["configurable"].get("reasoning", True):
        messages = [flow_prompt(state["assets"]), human_message]
        analysis = model.invoke(messages)
        content = analysis.content[1] if isinstance(analysis.content, list) else analysis.content
        struct_message = [structure_prompt(content), human_structure]
    else:
        struct_message = [flow_prompt(state["assets"]), human_message]

    model_with_tools = model_structured.bind_tools(tools, tool_choice="any")
    response = model_with_tools.invoke(struct_message)
    response = FlowsList(**response.tool_calls[0]['args'])

    return {
        "system_architecture": response
    }

def continue_tm(state, config):
    assumptions = list_to_string(state.get("assumptions", []))  
    model = config["configurable"].get("model_gap")
    tools = [ContinueThreatModeling]

    human_message = HumanMessage(
        content=[
            {"type": "text", "text": "There are gaps in the <threats> ??\n"},
            {"type": "text", "text": f"<threats>{state.get('threat_list', '')}</threats>\n"},
            {"type": "image_url", "image_url": {
                "url": f"data:image/jpeg;base64,{state['image_data']}"}},
            {"type": "text", "text": f"<solution_description>{state.get('description', '')}</solution_description>"},
            {"type": "text", "text": f"<assumptions>{assumptions}</assumptions>"}
        ]
    )

    messages = [gap_prompt(state.get("prev_gap", ""), state["assets"], state["system_architecture"]), human_message]
    model_with_tools = model.bind_tools(tools, tool_choice="any")
    response = model_with_tools.invoke(messages)
    response = ContinueThreatModeling(**response.tool_calls[0]['args'])
    return {
        "stop": response.stop,
        "gap": response.gap
    }

def define_threats(state, config):
    model_structured = config["configurable"].get("model_struct")
    model = config["configurable"].get("model_main")
    retry_count = int(state.get("retry", 0))
    retry_count += 1
    if retry_count > MAX_RETRY:
        return {"stop": True}
    iteration = int(state.get('iteration', 0))
    if ((retry_count > iteration) and (iteration != 0)):
        return {"stop": True}
    
    assumptions = list_to_string(state.get("assumptions", []))
    tools = [ThreatsList]
    model_with_tools = model_structured.bind_tools(tools, tool_choice="any")

    def get_threats_response(model_with_tools, gap=""):
        human_message = HumanMessage(
            content=[
                {"type": "text", "text": "Define threats and mitigations for the following solution:"},
                {"type": "image_url", "image_url": {
                    "url": f"data:image/jpeg;base64,{state['image_data']}"}},
                {"type": "text", "text": f"<solution_description>{state.get('description', '')}</solution_description>"},
                {"type": "text", "text": f"<assumptions>{assumptions}</assumptions>"}
            ]
        )

        if state.get("retry", 0) != 0:
            update_job_state(state["job_id"], "THREAT_RETRY", retry_count)
            system_prompt = threats_improve_prompt(gap, state.get("threat_list"), state["assets"], state["system_architecture"])
        else:
            update_job_state(state["job_id"], "THREAT", retry_count)
            system_prompt = threats_prompt(state["assets"], state["system_architecture"])

        new_gaps = f"""
            {state.get("prev_gap", "")} \n\n
            {gap}
            """

        if config["configurable"].get("reasoning", True):
            messages = [system_prompt, human_message]
            analysis = model.invoke(messages)
            content = analysis.content[1] if isinstance(analysis.content, list) else analysis.content
            struct_message = [structure_prompt(content), human_structure]
        else:
            struct_message = [system_prompt, human_message]

        response = model_with_tools.invoke(struct_message)
        threats = ThreatsList(**response.tool_calls[0]['args'])
        return {
            "threat_list": threats,
            "retry": retry_count,
            "prev_gap": new_gaps
        }

    # Handle first iteration retry case
    if iteration == 0 and retry_count > 1:
        continue_state = continue_tm(state, config)
        if continue_state.get("stop", False):
            return {"stop": True}
        return get_threats_response(model_with_tools, continue_state.get("gap", ""))
    
    if iteration == 0:
        iteration += 1

    # Handle normal retry flow
    if retry_count <= iteration:
        return get_threats_response(model_with_tools)
    return {"stop": True}


workflow = StateGraph(AgentState, ConfigSchema)

workflow.add_node("asset", define_assets)
workflow.add_node("image_to_base64", image_to_base64)
workflow.add_node("flows", define_flows)
workflow.add_node("threats_assistant", define_threats)
workflow.set_entry_point("image_to_base64")
workflow.add_edge("asset", "flows")
workflow.add_edge("flows", "threats_assistant")

def route_replay(state):
    if state.get("replay", False):
        try:
            return "replay"
        except Exception as e:
            print(e)
            raise e

    return "full"

workflow.add_conditional_edges(
    "image_to_base64",
    route_replay,
    {
        "replay": "threats_assistant",
        "full": "asset"
    }
)

def route_based_on_llm(state, config):
    start_time = config["configurable"].get("start_time")
    current_time = datetime.now()
    time_limit = False if (current_time - start_time).total_seconds() < 12 * 60 else True
    if state.get("stop") or time_limit:
        try:
            update_job_state(state["job_id"], "FINALIZE")
            create_dynamodb_item(state, AGENT_TABLE)
            time.sleep(3)
            update_job_state(state["job_id"], "COMPLETE")
            return "end"
        except Exception as e:
            print(e)
            update_job_state(state["job_id"], "FAILED")
            raise e

    return "continue"



workflow.add_conditional_edges(
    "threats_assistant",
    route_based_on_llm,
    {
        "continue": "threats_assistant",
        "end": END
    }
)
agent = workflow.compile()
