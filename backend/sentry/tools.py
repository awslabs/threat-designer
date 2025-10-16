from langchain_core.tools import tool
from data_model import Threat
from typing import List
from langgraph.types import interrupt
from pydantic import Field


@tool(
    name_or_callable="add_threats",
    description=""" Used to add new threats to the existing catalog. Add at most 5 threats within a single tool invocation """,
)
def add_threats(threats: List[Threat]):
    response = interrupt(
        {
            "payload": [threat.model_dump() for threat in threats],
            "tool_name": "add_threats",
        }
    )
    errors = response.get("args", {}).get("error", None)
    if response.get("type") == "add_threats" and not errors:
        return [{"name": threat.name} for threat in threats]
    else:
        raise Exception("Failed to add threats")


@tool(
    name_or_callable="edit_threats",
    description=""" Used to update threats from the existing catalog """,
)
def edit_threats(threats: List[Threat]):
    response = interrupt(
        {
            "payload": [threat.model_dump() for threat in threats],
            "tool_name": "edit_threats",
        }
    )
    errors = response.get("args", {}).get("error", None)
    if response["type"] == "edit_threats" and not errors:
        return [{"name": threat.name} for threat in threats]
    else:
        raise Exception("Failed to edit threats")


@tool(
    name_or_callable="delete_threats",
    description=""" Used to delete threats from the  existing catalog """,
)
def delete_threats(threats: List[Threat]):
    response = interrupt(
        {
            "payload": [threat.model_dump() for threat in threats],
            "tool_name": "delete_threats",
        }
    )
    errors = response.get("args", {}).get("error", None)
    if response["type"] == "delete_threats" and not errors:
        return {
            "response": [{"name": threat.name} for threat in threats],
        }
    else:
        raise Exception("Failed to delete threats")
