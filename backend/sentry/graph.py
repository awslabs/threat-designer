from typing import (
    List,
    Optional,
    Dict,
    Any,
)
from langchain_core.messages import (
    BaseMessage,
    SystemMessage,
    ToolMessage,
    HumanMessage,
)
from langchain_aws import ChatBedrockConverse
from langchain_core.tools import BaseTool
from langchain_core.tools.base import ToolException
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, END, MessagesState
from langgraph_checkpoint_aws.async_saver import AsyncBedrockSessionSaver
import json
import logging

# Configure logger
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


class ReactAgent:
    def __init__(
        self,
        model: ChatBedrockConverse,
        tools: List[BaseTool] = [],
        prompt: str = None,
        checkpointer: Optional[AsyncBedrockSessionSaver] = None,
    ):
        self.llm = model
        self.tools = tools or []
        self.prompt = (
            prompt or "You are a helpful AI assistant with vision capabilities."
        )
        self.checkpointer = checkpointer

        self.llm_with_tools = (
            self.llm.bind_tools(self.tools) if self.tools else self.llm
        )

        # Create tools lookup dictionary
        self.tools_by_name = {tool.name: tool for tool in self.tools}

        self.graph = self._build_graph()

    def _preprocess_messages_for_image(
        self, messages: List[BaseMessage], image_data: Optional[str]
    ) -> List[BaseMessage]:
        """
        Check if first message contains image_url type in first block,
        if not, inject it from the provided image_data
        """
        if not messages or not image_data:
            return messages

        processed_messages = messages.copy()
        first_message = processed_messages[0]

        # Only process HumanMessage
        if isinstance(first_message, HumanMessage):
            content = first_message.content

            # Handle string content
            if isinstance(content, str):
                new_content = [
                    {"type": "image_url", "image_url": {"url": image_data}},
                    {"cachePoint": {"type": "default"}},
                    {"type": "text", "text": content},
                ]
                processed_messages[0] = HumanMessage(content=new_content)

            # Handle list content
            elif isinstance(content, list) and len(content) > 0:
                first_block = content[0] if content else {}

                # Check if first block is NOT image_url type
                if (
                    not isinstance(first_block, dict)
                    or first_block.get("type") != "image_url"
                ):
                    new_content = [
                        {"type": "image_url", "image_url": {"url": image_data}},
                        {"cachePoint": {"type": "default"}},
                    ] + content
                    processed_messages[0] = HumanMessage(content=new_content)

            # Handle empty or other content types
            elif not content or (isinstance(content, list) and len(content) == 0):
                new_content = [
                    {"type": "image_url", "image_url": {"url": image_data}},
                    {"cachePoint": {"type": "default"}},
                ]
                processed_messages[0] = HumanMessage(content=new_content)

        return processed_messages

    def _build_graph(self):
        """Build the LangGraph workflow"""
        workflow = StateGraph(MessagesState)

        # Add nodes
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", self._tool_node)

        # Set entry point
        workflow.set_entry_point("agent")

        # Add conditional edges from agent
        workflow.add_conditional_edges(
            "agent", self._should_continue, {"continue": "tools", "end": END}
        )

        # Add edge from tools back to agent
        workflow.add_edge("tools", "agent")

        return workflow.compile(checkpointer=self.checkpointer)

    def _should_continue(self, state: MessagesState) -> str:
        """Determine whether to continue with tools or end"""
        messages = state["messages"]
        last_message = messages[-1]
        # If there is no function call, then we finish
        if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
            return "end"
        # Otherwise if there is, we continue
        else:
            return "continue"

    async def _tool_node(self, state: MessagesState) -> Dict[str, Any]:
        """Execute tools based on the last message"""
        outputs = []
        last_message = state["messages"][-1]

        for tool_call in last_message.tool_calls:
            try:
                tool_result = await self.tools_by_name[tool_call["name"]].ainvoke(
                    tool_call["args"]
                )
                outputs.append(
                    ToolMessage(
                        content=json.dumps(tool_result)
                        if not isinstance(tool_result, str)
                        else tool_result,
                        name=tool_call["name"],
                        tool_call_id=tool_call["id"],
                        status=tool_result.status
                        if hasattr(tool_result, "status")
                        else "success",
                    )
                )
            except ToolException as e:
                outputs.append(
                    ToolMessage(
                        content=json.dumps({"error": str(e)}),
                        name=tool_call["name"],
                        status="error",
                        tool_call_id=tool_call["id"],
                    )
                )

        return {"messages": outputs}

    async def _agent_node(
        self,
        state: MessagesState,
        config: RunnableConfig,
    ) -> Dict[str, Any]:
        """Agent node that calls the LLM with image preprocessing"""

        # Get image_data from config if available
        image_data = None
        if config and "configurable" in config:
            image_data = config["configurable"].get("image_data")

        # Get current messages
        state_messages = state["messages"]

        # # Apply image preprocessing if we have image_data
        if image_data:
            state_messages = self._preprocess_messages_for_image(
                state_messages, image_data
            )

        messages = [self.prompt] + state_messages

        # Call the model
        response = await self.llm_with_tools.ainvoke(messages, config)

        # Return updated state
        return {"messages": [response]}


def create_react_agent(
    model: ChatBedrockConverse,
    tools: Optional[List[BaseTool]],
    prompt: SystemMessage,
    checkpointer: Optional[AsyncBedrockSessionSaver] = None,
):
    """Create a React agent and return the compiled graph"""
    agent = ReactAgent(
        model=model, tools=tools, prompt=prompt, checkpointer=checkpointer
    )
    return agent.graph
