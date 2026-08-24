from typing import Optional, List, Dict, Any
from config import (
    ALL_AVAILABLE_TOOLS,
    checkpointer,
    boto_client,
    S3_BUCKET,
    create_model,
)
from config import MIN_BUDGET_LEVEL, normalize_budget_level
from utils import get_or_create_agent, logger


class AgentManager:
    def __init__(self):
        # Global variables to store reusable components
        self.cached_agent = None
        self.cached_llm = None  # Cache the LLM instance
        self.current_tool_preferences = None
        self.current_tools_hash = None
        self.current_context = None
        self.current_context_hash = None
        self.current_diagram_path = None
        self.current_diagram_hash = None
        self.current_diagram_data = None
        # Start at the ladder floor, not 0. A 0 here is not a reachable budget
        # level any more, so it would never match the first incoming level and
        # would rebuild the agent and LLM once for nothing.
        self.current_budget_level = MIN_BUDGET_LEVEL

    async def get_agent_with_preferences(
        self,
        tool_preferences: Optional[List[str]],
        context: Optional[Dict[str, Any]] = None,
        diagram_path: Optional[str] = None,
        budget_level: int = MIN_BUDGET_LEVEL,
    ):
        # Clamp before comparing, so a legacy 0 from an older client resolves to
        # the same level create_model would build and does not force a rebuild.
        budget_level = normalize_budget_level(budget_level)

        # Check if budget level changed - if so, we need to recreate the agent and LLM
        budget_level_changed = self.current_budget_level != budget_level
        if budget_level_changed:
            logger.debug(
                f"Budget level changed from {self.current_budget_level} to {budget_level}, recreating agent and LLM..."
            )
            self.current_budget_level = budget_level
            self.cached_agent = None  # Force recreation
            self.cached_llm = None  # Force LLM recreation

        # Create or reuse LLM
        if self.cached_llm is None:
            logger.debug(f"Creating new LLM with budget level {budget_level}")
            self.cached_llm = create_model(budget_level)

        llm = self.cached_llm

        result = await get_or_create_agent(
            tool_preferences,
            context,
            diagram_path,
            ALL_AVAILABLE_TOOLS,
            llm,
            checkpointer,
            boto_client,
            S3_BUCKET,
            logger,
            self.current_tool_preferences,
            self.current_tools_hash,
            self.current_context_hash,
            self.current_diagram_hash,
            self.cached_agent,
            self.current_context,
        )

        (
            self.cached_agent,
            self.current_tool_preferences,
            self.current_tools_hash,
            self.current_context_hash,
            self.current_diagram_hash,
            self.current_diagram_data,
            self.current_context,
        ) = result

        return self.cached_agent

    async def initialize_default_agent(self):
        """Initialize agent with all available tools, no context, no diagram"""
        try:
            await self.get_agent_with_preferences(None, None, None, 1)
            logger.debug(
                f"Default agent initialized successfully with all tools: {[tool.name for tool in ALL_AVAILABLE_TOOLS]}"
            )
        except Exception as e:
            logger.error(f"Failed to initialize default agent: {e}")
            raise


# Global agent manager instance
agent_manager = AgentManager()
