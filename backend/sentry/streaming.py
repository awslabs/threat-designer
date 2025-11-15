import json
import asyncio
from typing import Any
from langchain_core.messages import ToolMessage, AIMessageChunk, AIMessage
from langgraph.types import Command
from models import InvocationRequest
from agent_manager import agent_manager
from handlers import extract_budget_level
from utils import (
    extract_tool_preferences,
    extract_context,
    extract_diagram_path,
    sse_stream,
    log_error,
    logger,
)

# Global task tracking
_current_tasks = {}


def cancel_current_stream(session_id: str = None):
    """Cancel the current streaming operation for a specific session or all sessions"""
    global _current_tasks

    if session_id and session_id in _current_tasks:
        task = _current_tasks[session_id]
        if not task.done():
            task.cancel()
            logger.info(f"Cancelled stream for session: {session_id}")
        return {"response": "stream_cancelled"}

    # Cancel all active tasks if no session_id provided
    cancelled_count = 0
    for sid, task in list(_current_tasks.items()):
        if not task.done():
            task.cancel()
            cancelled_count += 1

    logger.info(f"Cancelled {cancelled_count} active streams")
    return {"response": f"cancelled_{cancelled_count}_streams"}


async def cancel_stream_async(session_id: str = None):
    """Async version to cancel the current streaming operation"""
    return cancel_current_stream(session_id)


def cleanup_finished_tasks():
    """Clean up finished tasks from the global tracking dict"""
    global _current_tasks
    finished_sessions = [sid for sid, task in _current_tasks.items() if task.done()]
    for sid in finished_sessions:
        del _current_tasks[sid]


class StreamingHandler:
    def __init__(self):
        # Optimized semaphore - allow multiple read operations, single write
        self.request_semaphore = asyncio.Semaphore(4)
        # Track last reasoning index per session for proper newline insertion
        self.last_reasoning_index = {}

    async def _check_provider_mismatch(self, session_id: str) -> dict:
        """
        Check if the session was created with a different provider.
        Returns error message if mismatch detected, None otherwise.
        """
        try:
            # Get current provider
            from config import MODEL_PROVIDER

            current_provider = MODEL_PROVIDER

            # Get session state
            config = {"configurable": {"thread_id": session_id}}
            state = await agent_manager.cached_agent.aget_state(config)

            # Check if session has messages (existing conversation)
            if state and state.values.get("messages"):
                # Get stored provider from metadata or detect from message format
                stored_provider = (
                    state.metadata.get("provider") if state.metadata else None
                )

                # If no metadata, try to detect from message content
                if not stored_provider:
                    stored_provider = self._detect_provider_from_messages(
                        state.values.get("messages")
                    )

                # Check for mismatch
                if stored_provider and stored_provider != current_provider:
                    provider_names = {"openai": "OpenAI", "bedrock": "AWS Bedrock"}

                    logger.warning(
                        f"Provider mismatch detected: session uses {stored_provider}, "
                        f"current deployment uses {current_provider}"
                    )

                    return {
                        "type": "error",
                        "content": (
                            f"This conversation was started with {provider_names.get(stored_provider, stored_provider)} "
                            f"but the system is now configured to use {provider_names.get(current_provider, current_provider)}. "
                            f"Please start a new conversation to continue."
                        ),
                    }

            # No mismatch or new session - store current provider in metadata
            # Note: LangGraph doesn't support direct metadata updates via aupdate_state
            # We'll track provider through message detection instead
            if state and (not state.metadata or not state.metadata.get("provider")):
                logger.info(
                    f"New session detected, will track provider: {current_provider}"
                )

            return None

        except Exception as e:
            logger.error(f"Error checking provider mismatch: {str(e)}")
            # Don't block on error, let the request proceed
            return None

    def _detect_provider_from_messages(self, messages: list) -> str:
        """
        Detect provider from message format.
        OpenAI uses function_call, Bedrock uses tool_use.
        """
        for msg in messages:
            if hasattr(msg, "content") and isinstance(msg.content, list):
                for content_item in msg.content:
                    if isinstance(content_item, dict):
                        content_type = content_item.get("type")
                        if content_type == "function_call":
                            return "openai"
                        elif content_type == "tool_use":
                            return "bedrock"
                        elif content_type == "reasoning":
                            return "openai"
                        elif content_type == "reasoning_content":
                            return "bedrock"

        # Default to current provider if can't detect
        from config import MODEL_PROVIDER

        return MODEL_PROVIDER

    @sse_stream()
    async def handle_streaming_request(
        self, request: InvocationRequest, session_id: str
    ):
        """Handle streaming responses with yields using native astream"""
        # Clean up any finished tasks
        cleanup_finished_tasks()

        # Check semaphore availability
        if self.request_semaphore.locked():
            from fastapi import HTTPException

            raise HTTPException(
                status_code=429,
                detail="Agent is currently processing another request. Please wait for it to complete.",
            )

        # Get current task and store it for cancellation
        current_task = asyncio.current_task()
        global _current_tasks
        _current_tasks[session_id] = current_task

        async with self.request_semaphore:
            response_buffer = []
            cancelled = False

            try:
                # Check if this is a resume_interrupt request
                request_type = request.input.get("type")
                is_resume_interrupt = request_type == "resume_interrupt"

                # Your existing setup code
                # IMPORTANT: Don't recreate agent when resuming interrupt to preserve tool registry
                if not agent_manager.cached_agent:
                    tool_preferences = extract_tool_preferences(request.input)
                    context = extract_context(request.input)
                    diagram_path = extract_diagram_path(request.input)
                    budget_level = extract_budget_level(request.input)

                    if budget_level is None:
                        budget_level = agent_manager.current_budget_level

                    if tool_preferences:
                        logger.info(f"Extracted tool preferences: {tool_preferences}")
                    if diagram_path:
                        logger.info(f"Extracted diagram path: {diagram_path}")
                    if budget_level is not None:
                        logger.info(f"Extracted budget level: {budget_level}")

                    await agent_manager.get_agent_with_preferences(
                        tool_preferences, context, diagram_path, budget_level
                    )
                elif is_resume_interrupt:
                    # When resuming interrupt, ensure we use the existing agent without recreation
                    # This preserves the tool registry that matches the persisted state
                    logger.info(
                        "Resuming interrupt with existing agent to preserve tool registry"
                    )

                if agent_manager.current_diagram_data:
                    image_data = agent_manager.current_diagram_data.get(
                        "image_url", {}
                    ).get("url")
                else:
                    image_data = None

                # Check for provider mismatch before processing
                provider_check = await self._check_provider_mismatch(session_id)
                if provider_check:
                    yield provider_check
                    yield {"end": True}
                    return

                if is_resume_interrupt:
                    tmp_msg = Command(resume={"type": request.input.get("prompt")})
                else:
                    content = [
                        {
                            "type": "text",
                            "text": request.input.get(
                                "prompt", "No prompt found in input"
                            ),
                        }
                    ]
                    tmp_msg = {"messages": [{"role": "user", "content": content}]}

                # Process the async stream directly
                async for mode, data in agent_manager.cached_agent.astream(
                    tmp_msg,
                    {
                        "configurable": {"thread_id": session_id},
                        "recursion_limit": 100,
                        "image_data": image_data,
                    },
                    stream_mode=["messages", "updates"],
                ):
                    # Process and yield the chunk
                    chunk_data = self._process_stream_data(mode, data, session_id)
                    if chunk_data:
                        if isinstance(chunk_data, list):
                            for chunk in chunk_data:
                                yield chunk
                        else:
                            yield chunk_data

                    # Buffer AIMessageChunk for potential cancellation handling
                    if mode == "messages":
                        if (
                            isinstance(data[0], AIMessageChunk)
                            and len(data[0].content) > 0
                            and self._is_tool_call(data[0].content[0])
                            and not self._get_tool_call_id(data[0].content[0])
                        ):
                            continue
                        else:
                            response_buffer.append(data[0])

            except asyncio.CancelledError:
                logger.info(f"Stream cancelled for session: {session_id}")
                cancelled = True
                # Handle cancellation cleanup
                tool_messages = await self._handle_cancellation(
                    response_buffer, session_id
                )
                # Don't re-raise - let the generator complete normally

            except Exception as e:
                log_error(e)
                yield {"error": str(e)}

            finally:
                if session_id in _current_tasks:
                    del _current_tasks[session_id]

                # Clean up reasoning index tracking for this session
                if session_id in self.last_reasoning_index:
                    del self.last_reasoning_index[session_id]

                # Always ensure we send a completion signal
                if cancelled:
                    for tool_msg in tool_messages:
                        yield tool_msg

                # Ensure the stream ends properly
                yield {"end": True}

    async def _handle_cancellation(self, response_buffer: list, session_id: str):
        """Handle stream cancellation and update agent state"""
        logger.info(f"Handling cancellation for session: {session_id}")
        tool_messages = []

        # Only proceed if we have an agent and response buffer
        if not agent_manager.cached_agent or not response_buffer:
            return

        try:
            # First, collect all existing ToolMessage IDs to know which tools completed
            completed_tool_ids = {
                msg.tool_call_id
                for msg in response_buffer
                if isinstance(msg, ToolMessage)
            }

            # Collect all tool calls that need to be cancelled (deduplicated by ID)
            pending_tool_calls_dict = {}  # Use dict to deduplicate by ID

            # Search through response buffer to find all tool-related content
            for i, element in enumerate(response_buffer):
                if isinstance(element, AIMessageChunk):
                    # Check for tool_calls attribute first (more reliable)
                    if hasattr(element, "tool_calls") and element.tool_calls:
                        for tool_call in element.tool_calls:
                            _id = tool_call.get("id")
                            _name = tool_call.get("name")

                            # Only add if this tool hasn't completed yet and not already tracked
                            if (
                                _id
                                and _id not in completed_tool_ids
                                and _id not in pending_tool_calls_dict
                            ):
                                pending_tool_calls_dict[_id] = {
                                    "id": _id,
                                    "name": _name,
                                    "chunk": element,
                                    "chunk_index": i,
                                    "tool_call": tool_call,
                                }

                    # Also check content for tool_use type
                    elif element.content:
                        # Handle both list and string content
                        content_list = (
                            element.content if isinstance(element.content, list) else []
                        )
                        for content_item in content_list:
                            if self._is_tool_call(content_item):
                                _id = self._get_tool_call_id(content_item)
                                _name = content_item.get("name")

                                # Only add if this tool hasn't completed yet and not already tracked
                                if (
                                    _id
                                    and _id not in completed_tool_ids
                                    and _id not in pending_tool_calls_dict
                                ):
                                    pending_tool_calls_dict[_id] = {
                                        "id": _id,
                                        "name": _name,
                                        "chunk": element,
                                        "chunk_index": i,
                                        "content_item": content_item,
                                    }

            # Convert dict values to list for processing
            pending_tool_calls = list(pending_tool_calls_dict.values())

            # Handle all pending tool calls
            if pending_tool_calls:
                logger.info(
                    f"Found {len(pending_tool_calls)} unique pending tool calls to cancel"
                )

                # Group by chunk index to update chunks efficiently
                chunks_to_update = {}

                for tool_info in pending_tool_calls:
                    _id = tool_info["id"]
                    _name = tool_info["name"]
                    chunk_index = tool_info["chunk_index"]

                    # Track which chunks need updating
                    if chunk_index not in chunks_to_update:
                        chunks_to_update[chunk_index] = {
                            "chunk": tool_info["chunk"],
                            "cancelled_tools": [],
                        }

                    chunks_to_update[chunk_index]["cancelled_tools"].append(
                        {"id": _id, "name": _name}
                    )

                    # Append ToolMessage for each cancelled tool
                    response_buffer.append(
                        ToolMessage(
                            tool_call_id=_id,
                            name=_name,
                            status="error",
                            content='{"response": "Tool invocation cancelled by user"}',
                        )
                    )

                    tool_messages.append(
                        {
                            "type": "tool",
                            "tool_name": _name,
                            "id": _id,
                            "tool_start": False,
                            "content": '{"response": "Tool invocation cancelled by user"}',
                            "error": True,
                        }
                    )

                # Update chunks with cancelled status
                for chunk_index, update_info in chunks_to_update.items():
                    original_chunk = update_info["chunk"]
                    cancelled_tools = update_info["cancelled_tools"]

                    # Build cancelled content and tool_calls
                    cancelled_content = []
                    cancelled_tool_calls = []

                    for idx, tool in enumerate(cancelled_tools):
                        # Detect provider format from original tool info
                        tool_info = pending_tool_calls_dict[tool["id"]]
                        is_openai = (
                            "tool_call" in tool_info
                            and tool_info["tool_call"].get("type") == "tool_call"
                        )

                        if is_openai:
                            # OpenAI format
                            cancelled_content.append(
                                {
                                    "type": "function_call",
                                    "name": tool["name"],
                                    "call_id": tool["id"],
                                    "arguments": '{"cancelled": true}',
                                    "index": idx + 1,
                                }
                            )
                        else:
                            # Bedrock format
                            cancelled_content.append(
                                {
                                    "type": "tool_use",
                                    "name": tool["name"],
                                    "id": tool["id"],
                                    "input": {"cancelled": True},
                                    "index": idx + 1,
                                }
                            )

                        cancelled_tool_calls.append(
                            {
                                "name": tool["name"],
                                "args": {"cancelled": True},
                                "id": tool["id"],
                                "type": "tool_call",
                            }
                        )

                    # Create cancelled chunk
                    cancelled_chunk = AIMessageChunk(
                        content=cancelled_content,
                        tool_calls=cancelled_tool_calls,
                        response_metadata={"stopReason": "tool_use"},
                        id=original_chunk.id,
                    )

                    # Replace the chunk in the buffer
                    response_buffer[chunk_index] = cancelled_chunk

            else:
                # Handle non-tool cancellations (reasoning content, etc.)
                last_element = response_buffer[-1] if response_buffer else None
                if isinstance(last_element, AIMessageChunk) and last_element.content:
                    if (
                        isinstance(last_element.content, list)
                        and len(last_element.content) > 0
                    ):
                        first_content = last_element.content[0]
                        content_type = (
                            first_content.get("type")
                            if isinstance(first_content, dict)
                            else None
                        )

                        # Handle both Bedrock and OpenAI reasoning formats
                        if content_type in ("reasoning_content", "reasoning"):
                            _id = last_element.id
                            index = first_content.get("index", 10) + 1
                            response_buffer.append(
                                AIMessageChunk(
                                    content=[
                                        {
                                            "type": "text",
                                            "text": "[empty]",
                                            "index": index,
                                        }
                                    ],
                                    id=_id,
                                )
                            )
                            logger.info(
                                f"Adding cancellation message for {content_type}"
                            )

            # Combine consecutive AIMessageChunk objects while preserving order
            combined_messages = []
            current_ai_chunk = []

            for msg in response_buffer:
                if isinstance(msg, AIMessageChunk):
                    current_ai_chunk.append(msg)
                else:
                    # Non-AIMessageChunk encountered, combine any accumulated AI chunks
                    if current_ai_chunk:
                        combined_ai = self._combine_ai_chunks(current_ai_chunk)
                        combined_messages.append(combined_ai)
                        current_ai_chunk = []
                    combined_messages.append(msg)

            # Handle any remaining AI chunks at the end
            if current_ai_chunk:
                combined_ai = self._combine_ai_chunks(current_ai_chunk)
                combined_messages.append(combined_ai)

            # Validate and clean messages to ensure tool_use/ToolMessage consistency
            cleaned_messages = self._validate_tool_message_consistency(
                combined_messages
            )

            # Remove OpenAI reasoning content to prevent ID reference errors on resume
            cleaned_messages = self._remove_openai_reasoning_content(cleaned_messages)

            # Update agent state with cleaned messages
            asyncio.create_task(
                agent_manager.cached_agent.aupdate_state(
                    config={"configurable": {"thread_id": session_id}},
                    values={"messages": cleaned_messages},
                )
            )

            return tool_messages if tool_messages else []

        except Exception as e:
            logger.error(f"Error updating agent state during cancellation: {str(e)}")
            import traceback

            logger.error(f"Traceback: {traceback.format_exc()}")
            return []

    def _combine_ai_chunks(self, chunks: list) -> AIMessageChunk:
        """
        Safely combine AIMessageChunk objects, properly handling parallel tool calls.
        Deduplicates tool calls by ID to prevent concatenation issues.
        Properly merges text content while preserving spacing.
        """
        if len(chunks) == 1:
            return chunks[0]

        all_tool_calls = []
        seen_tool_ids = set()
        all_content = []
        response_metadata = {}
        chunk_id = chunks[0].id if chunks else None

        for chunk in chunks:
            # Handle tool_calls attribute
            if hasattr(chunk, "tool_calls") and chunk.tool_calls:
                for tool_call in chunk.tool_calls:
                    tool_id = tool_call.get("id")
                    if tool_id and tool_id not in seen_tool_ids:
                        all_tool_calls.append(tool_call)
                        seen_tool_ids.add(tool_id)

            # Handle content
            if chunk.content:
                if isinstance(chunk.content, list):
                    for content_item in chunk.content:
                        if self._is_tool_call(content_item):
                            tool_id = self._get_tool_call_id(content_item)
                            if tool_id and tool_id not in seen_tool_ids:
                                all_content.append(content_item)
                                seen_tool_ids.add(tool_id)
                        else:
                            all_content.append(content_item)
                elif isinstance(chunk.content, str):
                    all_content.append(chunk.content)

            if hasattr(chunk, "response_metadata") and chunk.response_metadata:
                response_metadata.update(chunk.response_metadata)

        # Smart merging of content
        if not all_content:
            all_content = ""
        elif all(isinstance(c, str) for c in all_content):
            # All strings - join directly (preserve exact spacing as streamed)
            all_content = "".join(all_content)
        elif all(isinstance(c, dict) for c in all_content):
            # All dicts - need to merge text-type dicts
            all_content = self._merge_dict_content(all_content, seen_tool_ids)
        # else: mixed content, keep as-is

        return AIMessageChunk(
            content=all_content,
            tool_calls=all_tool_calls,
            response_metadata=response_metadata,
            id=chunk_id,
        )

    def _merge_dict_content(self, content_items: list, seen_tool_ids: set) -> list:
        """
        Merge consecutive text-type dict items while preserving other types.
        This prevents "Hello" + "World" from becoming "HelloWorld".
        """
        merged = []
        text_buffer = []

        for item in content_items:
            if not isinstance(item, dict):
                # Shouldn't happen, but handle gracefully
                if text_buffer:
                    # Flush text buffer
                    merged_text = "".join(text_buffer)
                    if merged_text:
                        merged.append({"type": "text", "text": merged_text})
                    text_buffer = []
                merged.append(item)
                continue

            item_type = item.get("type")

            # Merge consecutive text items
            if item_type == "text":
                text_content = item.get("text", "")
                text_buffer.append(text_content)
            else:
                # Non-text item (reasoning_content, tool_use, etc.)
                if text_buffer:
                    # Flush accumulated text
                    merged_text = "".join(text_buffer)
                    if merged_text:
                        merged.append({"type": "text", "text": merged_text})
                    text_buffer = []
                # Keep other types as-is
                merged.append(item)

        # Flush any remaining text
        if text_buffer:
            merged_text = "".join(text_buffer)
            if merged_text:
                merged.append({"type": "text", "text": merged_text})

        return merged if merged else ""

    def _validate_tool_message_consistency(self, messages: list) -> list:
        """
        Ensure tool_use blocks and ToolMessages are consistent.
        - Remove incomplete tool_use blocks without 'input' field
        - Add synthetic ToolMessages for tool_use blocks that don't have results
        """
        cleaned = []
        tool_use_map = {}  # Maps tool_id -> (message_index, tool_name)
        tool_result_ids = set()

        # First pass: collect all tool_use blocks and tool results
        for i, msg in enumerate(messages):
            if isinstance(msg, (AIMessage, AIMessageChunk)) and msg.content:
                # Filter and validate content blocks
                valid_content = []
                # Handle both list and string content
                content_list = (
                    msg.content if isinstance(msg.content, list) else [msg.content]
                )
                for content_item in content_list:
                    if self._is_tool_call(content_item):
                        # Only include tool_use/function_call blocks that have both id and input
                        tool_id = self._get_tool_call_id(content_item)
                        if tool_id and "input" in content_item:
                            tool_name = content_item.get("name")
                            valid_content.append(content_item)
                            tool_use_map[tool_id] = (len(cleaned), tool_name)
                        else:
                            logger.warning(
                                f"Skipping incomplete tool_use block: {content_item}"
                            )
                    else:
                        valid_content.append(content_item)

                # Only add message if it has content
                if valid_content:
                    # Create new message with cleaned content
                    if isinstance(msg, AIMessageChunk):
                        cleaned_msg = AIMessageChunk(
                            content=valid_content,
                            tool_calls=msg.tool_calls
                            if hasattr(msg, "tool_calls")
                            else [],
                            response_metadata=msg.response_metadata,
                            id=msg.id,
                        )
                    else:
                        cleaned_msg = AIMessage(
                            content=valid_content,
                            tool_calls=msg.tool_calls
                            if hasattr(msg, "tool_calls")
                            else [],
                            response_metadata=msg.response_metadata,
                            id=msg.id,
                        )
                    cleaned.append(cleaned_msg)
            elif isinstance(msg, ToolMessage):
                tool_result_ids.add(msg.tool_call_id)
                cleaned.append(msg)
            else:
                cleaned.append(msg)

        # Second pass: Add synthetic ToolMessages for orphaned tool_use blocks
        missing_results = set(tool_use_map.keys()) - tool_result_ids

        if missing_results:
            logger.info(
                f"Adding synthetic ToolMessages for orphaned tool_use blocks: {missing_results}"
            )

            # Create synthetic ToolMessages and insert them after their corresponding AI message
            synthetic_messages = []
            for tool_id in missing_results:
                msg_index, tool_name = tool_use_map[tool_id]
                synthetic_msg = ToolMessage(
                    tool_call_id=tool_id,
                    name=tool_name,
                    status="error",
                    content='{"response": "Tool execution was cancelled or interrupted"}',
                )
                synthetic_messages.append((msg_index + 1, synthetic_msg))

            # Sort by index in reverse to insert from end to beginning
            synthetic_messages.sort(key=lambda x: x[0], reverse=True)

            # Insert synthetic messages
            for insert_index, synthetic_msg in synthetic_messages:
                # Make sure we don't exceed bounds
                if insert_index <= len(cleaned):
                    cleaned.insert(insert_index, synthetic_msg)
                else:
                    cleaned.append(synthetic_msg)

        return cleaned

    def _remove_openai_reasoning_content(self, messages: list) -> list:
        """
        Remove OpenAI reasoning content from messages to prevent ID reference errors.
        OpenAI reasoning IDs (rs_*) are session-specific and cause 404 errors when
        referenced in subsequent requests.
        """
        cleaned_messages = []

        for msg in messages:
            if isinstance(msg, (AIMessage, AIMessageChunk)) and msg.content:
                # Filter out reasoning content from OpenAI
                if isinstance(msg.content, list):
                    filtered_content = []
                    for content_item in msg.content:
                        if isinstance(content_item, dict):
                            content_type = content_item.get("type")
                            # Skip OpenAI reasoning content (has 'id' starting with 'rs_')
                            if content_type == "reasoning" and content_item.get(
                                "id", ""
                            ).startswith("rs_"):
                                logger.info(
                                    f"Removing OpenAI reasoning content with ID: {content_item.get('id')}"
                                )
                                continue
                            filtered_content.append(content_item)
                        else:
                            filtered_content.append(content_item)

                    # Only create new message if content changed
                    if len(filtered_content) != len(msg.content):
                        if isinstance(msg, AIMessageChunk):
                            cleaned_msg = AIMessageChunk(
                                content=filtered_content if filtered_content else "",
                                tool_calls=msg.tool_calls
                                if hasattr(msg, "tool_calls")
                                else [],
                                response_metadata=msg.response_metadata
                                if hasattr(msg, "response_metadata")
                                else {},
                                id=msg.id,
                            )
                        else:
                            cleaned_msg = AIMessage(
                                content=filtered_content if filtered_content else "",
                                tool_calls=msg.tool_calls
                                if hasattr(msg, "tool_calls")
                                else [],
                                response_metadata=msg.response_metadata
                                if hasattr(msg, "response_metadata")
                                else {},
                                id=msg.id,
                            )
                        cleaned_messages.append(cleaned_msg)
                    else:
                        cleaned_messages.append(msg)
                else:
                    # String content, keep as-is
                    cleaned_messages.append(msg)
            else:
                # Non-AI message, keep as-is
                cleaned_messages.append(msg)

        return cleaned_messages

    def _is_tool_call(self, content_item: dict) -> bool:
        """Check if content item is a tool call (supports both Bedrock and OpenAI formats)"""
        if not isinstance(content_item, dict):
            return False
        item_type = content_item.get("type")
        return item_type in ("tool_use", "function_call")

    def _get_tool_call_id(self, content_item: dict) -> str:
        """Get tool call ID based on format type"""
        if not isinstance(content_item, dict):
            return None

        item_type = content_item.get("type")

        # OpenAI uses 'call_id' for function_call type
        if item_type == "function_call":
            return content_item.get("call_id")

        # Bedrock uses 'id' for tool_use type
        elif item_type == "tool_use":
            return content_item.get("id")

        # Fallback to 'id' for unknown types
        return content_item.get("id")

    def _process_stream_data(
        self, mode: str, data: Any, session_id: str = None
    ) -> dict:
        """Process individual stream data chunks"""
        if mode == "updates" and "agent" in data:
            messages = data["agent"]["messages"][0]
            if isinstance(messages, AIMessage):
                tool_content = []
                # Handle both list and string content
                content_list = (
                    messages.content if isinstance(messages.content, list) else []
                )
                for message in content_list:
                    # Skip if message is not a dict (e.g., string content from OpenAI)
                    if not isinstance(message, dict):
                        continue
                    if self._is_tool_call(message):
                        try:
                            content = (
                                json.loads(message.get("input", ""))
                                if message.get("input", None)
                                else {}
                            )
                        except json.JSONDecodeError:
                            content = message.get("input", "")
                        tool_content.append(
                            {
                                "type": "tool",
                                "id": self._get_tool_call_id(message),
                                "tool_name": message.get("name"),
                                "tool_start": True,
                                "tool_update": True,
                                "content": content,
                                "error": False,
                            }
                        )
                return tool_content
        if mode == "updates" and "__interrupt__" in data:
            return {"type": "interrupt", "content": data["__interrupt__"][0].value}
        elif mode == "messages":
            chunk, metadata = data
            if chunk.response_metadata.get("stopReason") == "end_turn":
                return {"end": True}

            if not chunk.content:
                return {}

            if isinstance(chunk, ToolMessage):
                try:
                    content = json.loads(chunk.content) if chunk.content else {}
                except json.JSONDecodeError:
                    content = chunk.content
                return {
                    "type": "tool",
                    "tool_name": chunk.name,
                    "id": chunk.tool_call_id,
                    "tool_start": False,
                    "content": content,
                    "error": chunk.status == "error",
                }

            # Handle OpenAI reasoning content in additional_kwargs
            if hasattr(chunk, "additional_kwargs") and chunk.additional_kwargs.get(
                "reasoning_content"
            ):
                return {
                    "type": "think",
                    "content": chunk.additional_kwargs["reasoning_content"],
                }

            # Handle empty content (OpenAI reasoning chunks)
            if not chunk.content or (
                isinstance(chunk.content, str) and not chunk.content.strip()
            ):
                return {}

            content = (
                chunk.content[0]
                if isinstance(chunk.content, list)
                else {"type": "text", "text": chunk.content}
            )
            msg_type = content.get("type")

            # Handle tool calls (both Bedrock and OpenAI formats)
            if self._is_tool_call(content) and content.get("name"):
                return {
                    "type": "tool",
                    "id": self._get_tool_call_id(content),
                    "tool_name": content.get("name"),
                    "tool_start": True,
                }
            elif msg_type == "text":
                return {"type": "text", "content": content.get("text")}
            elif msg_type == "reasoning_content":
                # Bedrock format
                return {
                    "type": "think",
                    "content": content.get("reasoning_content").get("text"),
                }
            elif msg_type == "reasoning":
                # OpenAI format: {"type": "reasoning", "summary": [{"type": "summary_text", "text": "..."}]}
                # Handle initial reasoning message (empty summary) to signal thinking has started
                summary = content.get("summary", [])
                if summary and isinstance(summary, list) and len(summary) > 0:
                    # Stream each summary item separately with newlines for formatting
                    # Track index changes to add newlines between different reasoning steps
                    first_item = summary[0]
                    summary_text = first_item.get("text", "")
                    item_index = first_item.get("index", 0)

                    if summary_text and session_id:
                        # Check if this is a new reasoning step (index changed)
                        last_index = self.last_reasoning_index.get(session_id, -1)
                        prefix = ""

                        if item_index != last_index and last_index != -1:
                            # Index changed - add double newline for visual separation
                            prefix = "\n\n"

                        # Update last seen index for this session
                        self.last_reasoning_index[session_id] = item_index

                        return {
                            "type": "think",
                            "content": prefix + summary_text,
                        }
                # Return empty reasoning chunk to signal thinking started (for GPT-5)
                return {
                    "type": "think",
                    "content": "",
                }

        return {}


# Global streaming handler instance
streaming_handler = StreamingHandler()
