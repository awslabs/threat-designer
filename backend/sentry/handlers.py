from typing import Dict, Any, Optional
from fastapi.responses import JSONResponse
from models import InvocationRequest
from agent_manager import agent_manager
from utils import (
    extract_tool_preferences,
    extract_context,
    extract_diagram_path,
    logger,
)
from history_manager import get_history, delete_bedrock_session
from config import ALL_AVAILABLE_TOOLS


def to_friendly_name(tool_name: str) -> str:
    """Convert tool name to friendly display name"""
    return tool_name.replace("-", " ").replace("_", " ").capitalize()


def extract_budget_level(input_data: Dict[str, Any]) -> Optional[int]:
    """Extract budget level from input data"""
    budget_level = input_data.get("budget_level")
    return int(budget_level) if budget_level is not None else None


class RequestHandlers:
    @staticmethod
    def handle_ping() -> JSONResponse:
        """Handle ping requests"""
        return JSONResponse(
            {"type": "pong", "message": "pong"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        )

    @staticmethod
    async def handle_tools() -> JSONResponse:
        """Handle tools list requests"""
        return JSONResponse(
            {
                "available_tools": [
                    {"id": tool.name, "tool_name": to_friendly_name(tool.name)}
                    for tool in ALL_AVAILABLE_TOOLS
                ]
            },
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        )

    @staticmethod
    async def handle_history(session_id: str) -> JSONResponse:
        response = await get_history(agent_manager.cached_agent, session_id)
        """Handle history requests"""
        return JSONResponse(
            response,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        )

    @staticmethod
    def handle_delete_history(session_header: str, session_id: str) -> JSONResponse:
        """Handle deletion of history"""
        try:
            success = delete_bedrock_session(session_header, session_id)
            return JSONResponse(
                {"success": success, "message": "Session deleted successfully"},
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            )
        except Exception as e:
            return JSONResponse(
                {"success": False, "error": str(e)},
                status_code=500,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            )

    @staticmethod
    async def handle_prepare(request: InvocationRequest) -> JSONResponse:
        """Handle prepare requests"""
        try:
            tool_preferences = extract_tool_preferences(request.input)
            context = extract_context(request.input)
            diagram_path = extract_diagram_path(request.input)
            budget_level = extract_budget_level(request.input)

            # Use current budget level if not provided
            if budget_level is None:
                budget_level = agent_manager.current_budget_level

            logger.debug(
                "Preparing environment with updated preferences, context, and budget..."
            )
            if tool_preferences:
                logger.debug(f"Updating tool preferences: {tool_preferences}")
            if context:
                logger.debug(f"Updating context: {context if context else 'None'}")
            if diagram_path:
                logger.debug(f"Updating diagram path: {diagram_path}")

            # Log budget level information
            if budget_level == 0:
                logger.debug("Budget level 0: Thinking disabled")
            else:
                from config import BUDGET_MAPPING

                budget_tokens = BUDGET_MAPPING.get(budget_level, 8000)
                logger.debug(
                    f"Budget level {budget_level}: Thinking enabled with {budget_tokens} tokens"
                )

            await agent_manager.get_agent_with_preferences(
                tool_preferences, context, diagram_path, budget_level
            )

            return JSONResponse(
                {
                    "type": "prepare_complete",
                    "message": "Environment warmed up successfully",
                    "active_tools": agent_manager.current_tool_preferences
                    or [tool.name for tool in ALL_AVAILABLE_TOOLS],
                    "context_loaded": context is not None,
                    "diagram_loaded": agent_manager.current_diagram_data is not None,
                    "budget_level": agent_manager.current_budget_level,
                    "thinking_enabled": agent_manager.current_budget_level > 0,
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            )
        except Exception as e:
            logger.error(f"Failed to prepare environment: {e}")
            return JSONResponse(
                {"type": "prepare_error", "error": str(e)},
                status_code=500,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            )


# Global handlers instance
handlers = RequestHandlers()
