# import json
# import asyncio
# from concurrent.futures import ThreadPoolExecutor
# from typing import AsyncGenerator, Any
# from langchain_core.messages import ToolMessage, AIMessageChunk
# from langgraph.types import Command
# from models import InvocationRequest
# from agent_manager import agent_manager
# from handlers import extract_budget_level
# from utils import (
#     extract_tool_preferences, extract_context, extract_diagram_path,
#     sse_stream, log_error, logger
# )
# from functools import reduce
# import operator

# # Thread pool for sync operations
# executor = ThreadPoolExecutor(max_workers=2)

# # Global cancellation flag
# _should_cancel = False


# def cancel_current_stream():
#     """Call this function to cancel the current streaming operation"""
#     global _should_cancel
#     _should_cancel = True
#     return {
#         "response": "stream_cancelled"
#     }


# async def cancel_stream_async():
#     """Async version to cancel the current streaming operation"""
#     global _should_cancel
#     _should_cancel = True
#     return {
#         "response": "stream_cancelled"
#     }


# def reset_cancellation():
#     """Reset the cancellation flag"""
#     global _should_cancel
#     _should_cancel = False


# class StreamingHandler:
#     def __init__(self):
#         # Optimized semaphore - allow multiple read operations, single write
#         self.request_semaphore = asyncio.Semaphore(2)

#     @sse_stream()
#     async def handle_streaming_request(self, request: InvocationRequest, session_id: str):
#         """Handle streaming responses with yields using ThreadPoolExecutor for sync stream"""
#         # Reset cancellation flag at start of new request - ONLY reset here
#         reset_cancellation()

#         # Check semaphore availability
#         if self.request_semaphore.locked():
#             from fastapi import HTTPException
#             raise HTTPException(
#                 status_code=429,
#                 detail="Agent is currently processing another request. Please wait for it to complete."
#             )

#         async with self.request_semaphore:
#             try:
#                 if not agent_manager.cached_agent:
#                     # Extract preferences using utility functions
#                     tool_preferences = extract_tool_preferences(request.input)
#                     context = extract_context(request.input)
#                     diagram_path = extract_diagram_path(request.input)
#                     budget_level = extract_budget_level(request.input)

#                     # Use current budget level if not provided
#                     if budget_level is None:
#                         budget_level = agent_manager.current_budget_level

#                     if tool_preferences:
#                         logger.info(f"Extracted tool preferences: {tool_preferences}")
#                     if diagram_path:
#                         logger.info(f"Extracted diagram path: {diagram_path}")
#                     if budget_level is not None:
#                         logger.info(f"Extracted budget level: {budget_level}")

#                     # Get or create agent based on preferences, context, diagram, and budget level
#                     await agent_manager.get_agent_with_preferences(tool_preferences, context, diagram_path, budget_level)

#                 if agent_manager.current_diagram_data:
#                     image_data = agent_manager.current_diagram_data.get("image_url", {}).get("url")
#                 else:
#                     image_data = None

#                 request_type = request.input.get("type")
#                 if request_type == "resume_interrupt":
#                     tmp_msg = Command(resume={"type": request.input.get("prompt")})
#                 else:
#                     content = [{"type": "text", "text": request.input.get("prompt", "No prompt found in input")}]
#                     tmp_msg = {"messages": [{"role": "user", "content": content}]}

#                 # Process the async stream - no cancellation check here
#                 async for chunk in self._create_async_stream_generator(tmp_msg, session_id, image_data):
#                     # if _should_cancel:
#                     #     logger.info("Stream cancelled in handler")
#                     #     yield {'end': True}
#                     #     return
#                     yield chunk

#             except Exception as e:
#                 log_error(e)
#                 yield {'error': str(e)}

#     async def _create_async_stream_generator(self, tmp_msg, session_id: str, image_data) -> AsyncGenerator:
#         """Convert synchronous stream to async generator using ThreadPoolExecutor"""
#         loop = asyncio.get_event_loop()

#         # Create a queue to handle streaming
#         queue = asyncio.Queue()

#         # Function to process items in thread
#         def process_stream():
#             global _should_cancel
#             try:
#                 response_buffer = []
#                 for mode, data in agent_manager.cached_agent.stream(
#                     tmp_msg,
#                     {"configurable": {"thread_id": session_id}, "recursion_limit": 50, "image_data": image_data},
#                     stream_mode=["messages", "updates"]
#                 ):
#                     # Single cancellation check point
#                     if _should_cancel:
#                         logger.info("Stream cancelled by user")
#                         last_element = response_buffer[-1] if response_buffer else None

#                         if isinstance(last_element, AIMessageChunk):
#                             if len(last_element.content) > 0:
#                                 if last_element.content[0].get("type") == "reasoning_content":
#                                     _id = last_element.id
#                                     index = last_element.content[0].get("index", 10) + 1
#                                     response_buffer.append(AIMessageChunk(
#                                         content=[{'type': 'text', 'text': '[empty]', 'index': index}],
#                                         id=_id
#                                     ))
#                                     logger.info("Adding temp user msg")
#                                 elif last_element.content[0].get("type") == "tool_use":
#                                     _id = last_element.content[0].get("id")
#                                     _name = last_element.content[0].get("name")

#                                     # Update the input field to '[empty]'
#                                     last_element.content[0]["input"] = '[empty]'
#                                     last_element.tool_calls = [
#                                         {
#                                             'name': _name,
#                                             'args': '[empty]',
#                                             'id': _id,
#                                             'type': 'tool_call'
#                                         }
#                                     ]
#                                     last_element.response_metadata = {'stopReason': 'tool_use'}

#                                     # Update the response_buffer with the overwritten element
#                                     response_buffer[-1] = last_element
#                                     # Then append the ToolMessage
#                                     response_buffer.append(ToolMessage(
#                                         tool_call_id=_id,
#                                         name=_name,
#                                         status="error",
#                                         content='{"response": "Tool invocation interrupted.."}'
#                                     ))

#                                     asyncio.run_coroutine_threadsafe(
#                                         queue.put(("messages", (ToolMessage(
#                                             tool_call_id=_id,
#                                             name=_name,
#                                             status="error",
#                                             content='{"response": "Tool invocation interrupted.."}'
#                                         ), None))),
#                                         loop
#                                     )

#                         # Combine consecutive AIMessageChunk objects while preserving order
#                         combined_messages = []
#                         current_ai_chunk = []

#                         for msg in response_buffer:
#                             if isinstance(msg, AIMessageChunk):
#                                 current_ai_chunk.append(msg)
#                             else:
#                                 # Non-AIMessageChunk encountered, combine any accumulated AI chunks
#                                 if current_ai_chunk:
#                                     if len(current_ai_chunk) == 1:
#                                         combined_messages.append(current_ai_chunk[0])
#                                     else:
#                                         combined_ai = reduce(operator.add, current_ai_chunk)
#                                         combined_messages.append(combined_ai)
#                                     current_ai_chunk = []
#                                 combined_messages.append(msg)

#                         # Handle any remaining AI chunks at the end
#                         if current_ai_chunk:
#                             if len(current_ai_chunk) == 1:
#                                 combined_messages.append(current_ai_chunk[0])
#                             else:
#                                 combined_ai = reduce(operator.add, current_ai_chunk)
#                                 combined_messages.append(combined_ai)

#                         agent_manager.cached_agent.update_state(
#                             config={"configurable": {"thread_id": session_id}},
#                             values={"messages": combined_messages}
#                         )
#                         asyncio.run_coroutine_threadsafe(
#                             queue.put(("stop", None)),
#                             loop
#                         )
#                         break

#                     # Put each item in the queue
#                     asyncio.run_coroutine_threadsafe(
#                         queue.put((mode, data)),
#                         loop
#                     )
#                     if mode == "messages":
#                         if (isinstance(data[0], AIMessageChunk) and
#                             len(data[0].content) > 0 and
#                             isinstance(data[0].content[0], dict) and
#                             data[0].content[0].get("type") == "tool_use" and
#                             not data[0].content[0].get("id")):
#                             continue
#                         else:
#                             response_buffer.append(data[0])

#             except Exception as e:
#                 asyncio.run_coroutine_threadsafe(
#                     queue.put(("error", e)),
#                     loop
#                 )
#             finally:
#                 # Signal end of stream
#                 asyncio.run_coroutine_threadsafe(
#                     queue.put(("done", None)),
#                     loop
#                 )

#         # Start processing in thread
#         future = loop.run_in_executor(executor, process_stream)

#         # Yield items from queue as they arrive
#         while True:
#             mode, data = await queue.get()

#             if mode == "done":
#                 break
#             elif mode == "error":
#                 raise data
#             elif mode == "stop":
#                 yield {"end": True}
#             else:
#                 yield self._process_stream_data(mode, data)

#         # Ensure the thread completes
#         await future

#     def _process_stream_data(self, mode: str, data: Any) -> dict:
#         """Process individual stream data chunks"""
#         if mode == "updates" and "__interrupt__" in data:
#             logger.info("Interrupt")
#             return {
#                 'type': 'interrupt',
#                 'content': data["__interrupt__"][0].value
#             }
#         elif mode == "messages":
#             chunk, metadata = data
#             if chunk.response_metadata.get('stopReason') == 'end_turn':
#                 return {'end': True}

#             if not chunk.content:
#                 return {}

#             if isinstance(chunk, ToolMessage):
#                 try:
#                     content = json.loads(chunk.content) if chunk.content else {}
#                 except json.JSONDecodeError:
#                     content = chunk.content

#                 return {
#                     'type': 'tool',
#                     'tool_name': chunk.name,
#                     'tool_start': False,
#                     'content': content,
#                     'error': chunk.status == "error"
#                 }

#             content = chunk.content[0]
#             msg_type = content.get("type")

#             if msg_type == "tool_use" and content.get("name"):
#                 logger.info("Tool start")
#                 return {
#                     'type': 'tool',
#                     'tool_name': content.get('name'),
#                     'tool_start': True,
#                 }
#             elif msg_type == "text":
#                 return {
#                     'type': 'text',
#                     'content': content.get('text')
#                 }
#             elif msg_type == "reasoning_content":
#                 return {
#                     'type': 'think',
#                     'content': content.get('reasoning_content').get('text')
#                 }

#         return {}


# # Global streaming handler instance
# streaming_handler = StreamingHandler()


import json
import asyncio
from typing import Any
from langchain_core.messages import ToolMessage, AIMessageChunk
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
from functools import reduce
import operator

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
        self.request_semaphore = asyncio.Semaphore(2)

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
                # Your existing setup code
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

                if agent_manager.current_diagram_data:
                    image_data = agent_manager.current_diagram_data.get(
                        "image_url", {}
                    ).get("url")
                else:
                    image_data = None

                request_type = request.input.get("type")
                if request_type == "resume_interrupt":
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
                        "recursion_limit": 50,
                        "image_data": image_data,
                    },
                    stream_mode=["messages", "updates"],
                ):
                    # Process and yield the chunk
                    chunk_data = self._process_stream_data(mode, data)
                    if chunk_data:
                        yield chunk_data

                    # Buffer AIMessageChunk for potential cancellation handling
                    if mode == "messages":
                        if (
                            isinstance(data[0], AIMessageChunk)
                            and len(data[0].content) > 0
                            and isinstance(data[0].content[0], dict)
                            and data[0].content[0].get("type") == "tool_use"
                            and not data[0].content[0].get("id")
                        ):
                            continue
                        else:
                            response_buffer.append(data[0])

            except asyncio.CancelledError:
                logger.info(f"Stream cancelled for session: {session_id}")
                cancelled = True
                # Handle cancellation cleanup
                tool_message = await self._handle_cancellation(
                    response_buffer, session_id
                )
                # Don't re-raise - let the generator complete normally

            except Exception as e:
                log_error(e)
                yield {"error": str(e)}

            finally:
                if session_id in _current_tasks:
                    del _current_tasks[session_id]

                # Always ensure we send a completion signal
                if cancelled:
                    if tool_message:
                        yield tool_message

                # Ensure the stream ends properly
                yield {"end": True}

    async def _handle_cancellation(self, response_buffer: list, session_id: str):
        """Handle stream cancellation and update agent state"""
        logger.info(f"Handling cancellation for session: {session_id}")
        tool_message = None

        # Only proceed if we have an agent and response buffer
        if not agent_manager.cached_agent or not response_buffer:
            return

        try:
            last_element = response_buffer[-1] if response_buffer else None

            if isinstance(last_element, AIMessageChunk):
                if len(last_element.content) > 0:
                    if last_element.content[0].get("type") == "reasoning_content":
                        _id = last_element.id
                        index = last_element.content[0].get("index", 10) + 1
                        response_buffer.append(
                            AIMessageChunk(
                                content=[
                                    {"type": "text", "text": "[empty]", "index": index}
                                ],
                                id=_id,
                            )
                        )
                        logger.info("Adding cancellation message")
                    elif last_element.content[0].get("type") == "tool_use":
                        _id = last_element.content[0].get("id")
                        _name = last_element.content[0].get("name")

                        # Update the input field to '[cancelled]'
                        last_element.content[0]["input"] = "[empty]"
                        last_element.tool_calls = [
                            {
                                "name": _name,
                                "args": "[empty]",
                                "id": _id,
                                "type": "tool_call",
                            }
                        ]
                        last_element.response_metadata = {"stopReason": "tool_use"}

                        # Update the response_buffer with the overwritten element
                        response_buffer[-1] = last_element
                        # Then append the ToolMessage
                        response_buffer.append(
                            ToolMessage(
                                tool_call_id=_id,
                                name=_name,
                                status="error",
                                content='{"response": "Tool invocation cancelled by user"}',
                            )
                        )
                        tool_message = {
                            "type": "tool",
                            "tool_name": _name,
                            "tool_start": False,
                            "content": '{"response": "Tool invocation cancelled by user"}',
                            "error": True,
                        }

            # Combine consecutive AIMessageChunk objects while preserving order
            combined_messages = []
            current_ai_chunk = []

            for msg in response_buffer:
                if isinstance(msg, AIMessageChunk):
                    current_ai_chunk.append(msg)
                else:
                    # Non-AIMessageChunk encountered, combine any accumulated AI chunks
                    if current_ai_chunk:
                        if len(current_ai_chunk) == 1:
                            combined_messages.append(current_ai_chunk[0])
                        else:
                            combined_ai = reduce(operator.add, current_ai_chunk)
                            combined_messages.append(combined_ai)
                        current_ai_chunk = []
                    combined_messages.append(msg)

            # Handle any remaining AI chunks at the end
            if current_ai_chunk:
                if len(current_ai_chunk) == 1:
                    combined_messages.append(current_ai_chunk[0])
                else:
                    combined_ai = reduce(operator.add, current_ai_chunk)
                    combined_messages.append(combined_ai)

            # Update agent state
            agent_manager.cached_agent.update_state(
                config={"configurable": {"thread_id": session_id}},
                values={"messages": combined_messages},
            )
            logger.info("Combined messages")
            logger.info(combined_messages)
            return tool_message

        except Exception as e:
            logger.error(f"Error updating agent state during cancellation: {e}")

    def _process_stream_data(self, mode: str, data: Any) -> dict:
        """Process individual stream data chunks"""
        if mode == "updates" and "__interrupt__" in data:
            logger.info("Interrupt")
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
                    "tool_start": False,
                    "content": content,
                    "error": chunk.status == "error",
                }

            content = chunk.content[0]
            msg_type = content.get("type")

            if msg_type == "tool_use" and content.get("name"):
                logger.info("Tool start")
                return {
                    "type": "tool",
                    "tool_name": content.get("name"),
                    "tool_start": True,
                }
            elif msg_type == "text":
                return {"type": "text", "content": content.get("text")}
            elif msg_type == "reasoning_content":
                return {
                    "type": "think",
                    "content": content.get("reasoning_content").get("text"),
                }

        return {}


# Global streaming handler instance
streaming_handler = StreamingHandler()
