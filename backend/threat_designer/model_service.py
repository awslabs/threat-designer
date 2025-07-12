"""Model service layer for centralized model interactions."""

from typing import Any, Dict, List, Optional, Type

from constants import ERROR_MODEL_INIT_FAILED
from exceptions import ModelInvocationError
from langchain_aws.chat_models.bedrock import ChatBedrockConverse
from langchain_core.messages import AIMessage
from langchain_core.messages.human import HumanMessage
from langchain_core.runnables.config import RunnableConfig
from monitoring import logger, with_error_context
from utils import handle_asset_error


class ModelService:
    """Service for managing model interactions."""

    @with_error_context("model invocation")
    def invoke_structured_model(
        self,
        messages: List[HumanMessage],
        tools: List[Type],
        config: RunnableConfig,
        reasoning: bool = False,
    ) -> Any:
        """Invoke model with structured output and error handling."""
        model = config["configurable"].get("model_main")
        model_structured = config["configurable"].get("model_struct")

        model_with_tools = model.bind_tools(
            tools, tool_choice="any" if not reasoning else None
        )

        try:
            response = model_with_tools.invoke(messages)
            return self._process_structured_response(
                response, tools[0], model_structured, reasoning
            )
        except Exception as e:
            logger.error(f"{ERROR_MODEL_INIT_FAILED}: {e}")
            raise ModelInvocationError(f"{ERROR_MODEL_INIT_FAILED}: {str(e)}")

    def _process_structured_response(
        self,
        response: AIMessage,
        tool_class: Type,
        model_structured: ChatBedrockConverse,
        reasoning: bool,
    ) -> Dict[str, Any]:
        """Process structured model response with error handling."""
        logger.info("response metadata", response=response.usage_metadata)

        @handle_asset_error(model_structured, tool_class, thinking=reasoning)
        def process_response(resp):
            return tool_class(**resp.tool_calls[0]["args"])

        return {
            "structured_response": process_response(response),
            "reasoning": self.extract_reasoning_content(response),
        }

    @with_error_context("summary generation")
    def generate_summary(
        self, messages: List[HumanMessage], tools: List[Type], config: RunnableConfig
    ) -> Any:
        """Generate summary using specified model."""
        model_summary = config["configurable"].get("model_summary")
        model_with_tools = model_summary.bind_tools(tools)

        try:
            response = model_with_tools.invoke(messages)
            return tools[0](**response.tool_calls[0]["args"])
        except Exception as e:
            logger.error(f"Summary generation failed: {e}")
            raise ModelInvocationError(f"Failed to generate summary: {str(e)}")

    def extract_reasoning_content(self, response: AIMessage) -> Optional[str]:
        """Extract reasoning content from model response."""
        if response.content and len(response.content) > 0:
            return response.content[0].get("reasoning_content", {}).get("text", None)
        return None
