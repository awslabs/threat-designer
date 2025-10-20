from utils import logger
import time
import random
import string
import json
from langchain_core.messages import ToolMessage, HumanMessage, AIMessage
from session_manager import session_manager
import boto3
import os


REGION = os.environ.get("REGION", "us-east-1")
bedrock_agent = boto3.client("bedrock-agent-runtime", region_name=REGION)


async def get_history(agent, id):
    config = {"configurable": {"thread_id": id}}
    history = agent.aget_state_history(config=config, limit=1)
    last = await anext(history, None)
    interrupt = None

    if last:
        # Check if there are interrupts and extract the first one
        if last.interrupts and len(last.interrupts) > 0:
            interrupt = last.interrupts[0].value

        msg = last.values.get("messages", [])
        formatted_history = format_chat_for_frontend(msg, interrupt)
        return formatted_history
    return None


def format_chat_for_frontend(backend_messages, interrupt=None):
    """
    Convert backend message format to frontend format.

    Args:
        backend_messages: List of message objects from backend (HumanMessages, AIMessages, ToolMessages)
        interrupt: Optional interrupt data to add at the end

    Returns:
        List of chatTurn objects for frontend consumption
    """
    chat_turns = []
    current_turn = None

    def generate_turn_id():
        timestamp = int(time.time() * 1000)
        random_suffix = "".join(
            random.choices(string.ascii_lowercase + string.digits, k=9)
        )
        return f"turn_{timestamp}_{random_suffix}"

    for message in backend_messages:
        if isinstance(message, HumanMessage):
            # Start a new turn
            if current_turn:
                # Add end marker before adding to chat_turns
                current_turn["aiMessage"].append({"end": True})
                chat_turns.append(current_turn)

            current_turn = {
                "id": generate_turn_id(),
                "userMessage": message.content[0].get("text", "")
                if message.content
                else "",
                "aiMessage": [],
            }

        elif isinstance(message, AIMessage):
            if not current_turn:
                # Handle case where AI message comes without user message
                current_turn = {
                    "id": generate_turn_id(),
                    "userMessage": "",
                    "aiMessage": [],
                }

            # Process each content item in the AIMessage
            for content_item in message.content:
                if content_item.get("type") == "reasoning_content":
                    current_turn["aiMessage"].append(
                        {
                            "type": "think",
                            "content": content_item["reasoning_content"].get(
                                "text", " "
                            ),
                        }
                    )
                elif content_item.get("type") == "tool_use":
                    current_turn["aiMessage"].append(
                        {
                            "type": "tool",
                            "id": content_item["id"],
                            "tool_name": content_item["name"],
                            "tool_start": True,
                        }
                    )
                else:
                    # Regular text content
                    text_content = content_item.get("text", "").strip()
                    if text_content:  # Only add non-empty text
                        current_turn["aiMessage"].append(
                            {"type": "text", "content": text_content}
                        )

        elif isinstance(message, ToolMessage):
            if current_turn:
                try:
                    content = json.loads(message.content)
                    current_turn["aiMessage"].append(
                        {
                            "type": "tool",
                            "id": message.tool_call_id,
                            "tool_name": message.name,
                            "tool_start": False,
                            "content": content,
                            "error": message.status == "error",
                        }
                    )
                except Exception:
                    logger.info("Unable to parse tool message content")
                    current_turn["aiMessage"].append(
                        {
                            "type": "tool",
                            "id": message.tool_call_id,
                            "tool_name": message.name,
                            "tool_start": False,
                            "content": message.content,
                        }
                    )

    # Handle the last turn
    if current_turn:
        # Add interrupt as final message if provided
        if interrupt:
            current_turn["aiMessage"].append(
                {"type": "interrupt", "content": interrupt}
            )
        else:
            # Otherwise add end marker
            current_turn["aiMessage"].append({"end": True})
        chat_turns.append(current_turn)
    # Create a new turn for the interrupt if there's no current turn
    elif interrupt:
        chat_turns.append(
            {
                "id": generate_turn_id(),
                "userMessage": "",
                "aiMessage": [{"type": "interrupt", "content": interrupt}],
            }
        )

    return chat_turns


def delete_bedrock_session(session_header, session_id):
    """Delete a Bedrock agent session."""
    try:
        terminate_session = bedrock_agent.end_session(sessionIdentifier=session_id)
        if terminate_session["sessionStatus"] in ["EXPIRED", "ENDED"]:
            session_manager.delete_session(session_header)
            bedrock_agent.delete_session(sessionIdentifier=session_id)
            return True
        else:
            logger.info(
                f"Unable to terminate session because is still active. Status: {terminate_session['sessionStatus']}"
            )
    except Exception as e:
        logger.error(f"Error deleting session {session_id}: {e}")
        raise e
