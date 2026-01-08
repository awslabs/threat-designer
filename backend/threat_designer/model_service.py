"""Model service layer for centralized model interactions."""

from typing import Any, Dict, List, Optional, Type

from constants import ERROR_MODEL_INIT_FAILED
from exceptions import (
    ModelInvocationError,
    OpenAIAuthenticationError,
    OpenAIRateLimitError,
)
from langchain_aws.chat_models.bedrock import ChatBedrockConverse
from langchain_core.messages import AIMessage
from langchain_core.messages.human import HumanMessage
from langchain_core.runnables.config import RunnableConfig
from monitoring import logger, with_error_context
from utils import handle_asset_error


class ModelService:
    """Service for managing model interactions."""

    def get_model_with_tools(
        self, model: Any, tools: List[Any], tool_choice: str = "auto"
    ) -> Any:
        """Bind tools to a model with specified tool choice.

        This method binds tools to a model for agentic workflows where the model
        can choose which tools to call. Unlike invoke_structured_model which forces
        a specific tool, this allows the model to autonomously select tools.

        Args:
            model: The language model to bind tools to
            tools: List of tool functions to bind
            tool_choice: Tool choice strategy ("auto", "any", or None)
                        "auto" - model decides whether to call tools
                        "any" - model must call at least one tool
                        None - no tool choice constraint

        Returns:
            Model with tools bound and configured tool choice
        """
        return model.bind_tools(tools, tool_choice=tool_choice)

    def _get_tool_choice(self, model: Any, tools: List[Type], reasoning: bool) -> Any:
        """Get appropriate tool_choice based on provider and reasoning mode."""
        # Check if this is an OpenAI model
        is_openai = hasattr(model, "__class__") and "OpenAI" in model.__class__.__name__

        if is_openai:
            # OpenAI supports forcing specific tool by name
            # Format: {"type": "function", "function": {"name": "tool_name"}}
            tool_name = tools[0].__name__
            logger.debug("Using OpenAI tool choice", tool_name=tool_name)
            return {"type": "function", "function": {"name": tool_name}}
        else:
            # Bedrock/Anthropic: use "any" for non-reasoning, None for reasoning
            tool_choice = "any" if not reasoning else None
            logger.debug(
                "Using Bedrock tool choice",
                tool_choice=tool_choice,
                reasoning=reasoning,
            )
            return tool_choice

    @with_error_context("model invocation")
    def invoke_structured_model(
        self,
        messages: List[HumanMessage],
        tools: List[Type],
        config: RunnableConfig,
        reasoning: bool = False,
        model_type: str = "model_main",
    ) -> Any:
        """Invoke model with structured output and error handling."""
        model = config["configurable"].get(model_type)
        model_structured = config["configurable"].get("model_struct")

        # Get provider-appropriate tool_choice
        tool_choice = self._get_tool_choice(model, tools, reasoning)

        model_with_tools = model.bind_tools(tools, tool_choice=tool_choice)

        try:
            response = model_with_tools.invoke(messages)
            return self._process_structured_response(
                response, tools[0], model_structured, reasoning
            )
        except Exception as e:
            # Check for OpenAI-specific errors
            error_msg = str(e).lower()

            error_str = str(e)

            if "authentication" in error_msg or "api_key" in error_msg:
                logger.error("OpenAI authentication failed", error=error_str)
                raise OpenAIAuthenticationError(
                    f"OpenAI API authentication failed: {error_str}"
                )

            elif "rate_limit" in error_msg or "quota" in error_msg:
                logger.error("OpenAI rate limit exceeded", error=error_str)
                raise OpenAIRateLimitError(f"OpenAI rate limit exceeded: {error_str}")

            else:
                error_str = str(e)
                logger.error(ERROR_MODEL_INIT_FAILED, error=error_str)
                raise ModelInvocationError(f"{ERROR_MODEL_INIT_FAILED}: {error_str}")

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

        # Get provider-appropriate tool_choice (summary never uses reasoning)
        tool_choice = self._get_tool_choice(model_summary, tools, reasoning=False)

        model_with_tools = model_summary.bind_tools(tools, tool_choice=tool_choice)

        try:
            response = model_with_tools.invoke(messages)
            return tools[0](**response.tool_calls[0]["args"])
        except Exception as e:
            error_str = str(e)
            logger.error("Summary generation failed", error=error_str)
            raise ModelInvocationError(f"Failed to generate summary: {error_str}")

    def extract_reasoning_content(self, response: AIMessage) -> Optional[str]:
        """Extract reasoning content from model response (provider-agnostic)."""
        if response.content and len(response.content) > 0:
            reasoning_texts = []
            for content_block in response.content:
                if isinstance(content_block, dict):
                    # Bedrock format: {"type": "reasoning_content", "reasoning_content": {"text": "..."}}
                    if content_block.get("type") == "reasoning_content":
                        reasoning = content_block.get("reasoning_content", {})
                        if isinstance(reasoning, dict) and reasoning.get("text"):
                            reasoning_texts.append(reasoning.get("text"))
                    # OpenAI GPT-5 format: {"type": "reasoning", "summary": [{"type": "summary_text", "text": "..."}]}
                    elif content_block.get("type") == "reasoning":
                        summary = content_block.get("summary", [])
                        if isinstance(summary, list):
                            for summary_item in summary:
                                if (
                                    isinstance(summary_item, dict)
                                    and summary_item.get("type") == "summary_text"
                                ):
                                    text = summary_item.get("text", "")
                                    if text:
                                        reasoning_texts.append(text.strip())
            if reasoning_texts:
                return "\n\n".join(reasoning_texts)

        # Fallback: OpenAI format in additional_kwargs
        if hasattr(response, "additional_kwargs"):
            reasoning = response.additional_kwargs.get("reasoning_content")
            if reasoning:
                return reasoning

        return None
