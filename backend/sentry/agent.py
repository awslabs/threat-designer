from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain_mcp_adapters.client import MultiServerMCPClient
from models import InvocationRequest
from session_manager import session_manager
from agent_manager import agent_manager
from handlers import handlers
from streaming import streaming_handler, cancel_stream_async
from exceptions import MissingHeader
from utils import logger, load_mcp_config
from config import ALL_AVAILABLE_TOOLS
from tools import add_threats, edit_threats, delete_threats
from threading import Lock
import time
import asyncio


# Track active invocation status
invocation_lock = Lock()
active_invocation = False
last_known_status = None
last_status_update_time = time.time()


async def reset_invocation_status():
    """Reset invocation status every 15 minutes"""
    global active_invocation
    while True:
        await asyncio.sleep(900)  # 15 minutes = 900 seconds
        with invocation_lock:
            if active_invocation:
                logger.info("Resetting active invocation status to False (15min timer)")
                active_invocation = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global active_invocation

    try:
        mcp_config = load_mcp_config()
        mcp_tools = MultiServerMCPClient(mcp_config)
        mcp_tools_list = await mcp_tools.get_tools()

        # Filter out unwanted tools
        excluded_tools = {"aws___list_regions"}
        filtered_mcp_tools = [
            tool for tool in mcp_tools_list if tool.name not in excluded_tools
        ]

        if len(filtered_mcp_tools) < len(mcp_tools_list):
            excluded_count = len(mcp_tools_list) - len(filtered_mcp_tools)
            logger.info(f"Filtered out {excluded_count} MCP tool(s): {excluded_tools}")
    except Exception as e:
        logger.error(f"Failed to load mcp tools: {e}")
        filtered_mcp_tools = []
    try:
        ALL_AVAILABLE_TOOLS.clear()
        ALL_AVAILABLE_TOOLS.extend(filtered_mcp_tools)
        ALL_AVAILABLE_TOOLS.extend([add_threats, edit_threats, delete_threats])
        await agent_manager.initialize_default_agent()
    except Exception as e:
        logger.error(f"Failed to initialize default agent: {e}")
        raise

    # Start the background task to reset invocation status
    reset_task = asyncio.create_task(reset_invocation_status())
    logger.info("Started background task to reset invocation status every 15 minutes")

    try:
        yield
    finally:
        logger.info("Shutting down...")

        # Cancel the background task
        reset_task.cancel()
        try:
            await reset_task
        except asyncio.CancelledError:
            logger.info("Background reset task cancelled")

        # Clear session cache
        session_manager.clear_cache()

        # Reset invocation status on shutdown
        with invocation_lock:
            active_invocation = False


# Initialize FastAPI app
app = FastAPI(title="Sentry Agent Server", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET, POST, OPTIONS"],
    allow_headers=["*"],
)


def set_active_invocation():
    """Helper function to set active invocation status"""
    global active_invocation
    with invocation_lock:
        if not active_invocation:
            logger.info("Setting active invocation status to True")
        active_invocation = True


@app.options("/invocations")
async def handle_options():
    return {"message": "OK"}


@app.post("/invocations")
async def invoke(request: InvocationRequest, http_request: Request):
    """Process user input and return appropriate response type"""

    # Early validation - fail fast before any processing
    session_header = http_request.headers.get(
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id"
    )
    if not session_header:
        raise MissingHeader

    # Get or create session ID for this session header
    session_id = session_manager.get_or_create_session_id(session_header)
    logger.info(f"Session id: {session_header}")

    request_type = request.input.get("type")

    if (not request_type) or (request_type == "resume_interrupt"):
        set_active_invocation()
        return await streaming_handler.handle_streaming_request(request, session_id)

    # Handle immediate response types with normal returns
    if request_type == "ping":
        return handlers.handle_ping()

    if request_type == "stop":
        return await cancel_stream_async(session_id)

    if request_type == "tools":
        set_active_invocation()
        return await handlers.handle_tools()

    if request_type == "history":
        set_active_invocation()
        return await handlers.handle_history(session_id)

    if request_type == "delete_history":
        await cancel_stream_async(session_id)
        set_active_invocation()
        return handlers.handle_delete_history(session_header, session_id)

    if request_type == "prepare":
        set_active_invocation()
        return await handlers.handle_prepare(request)


@app.get("/ping")
async def ping():
    global active_invocations, last_known_status, last_status_update_time
    with invocation_lock:
        is_busy = active_invocation
        if is_busy:
            status = "HealthyBusy"
        else:
            status = "Healthy"

        # Update timestamp only when status changes
        if last_known_status != status:
            last_known_status = status
            last_status_update_time = time.time()
        return JSONResponse(
            {"status": status, "time_of_last_update": int(last_status_update_time)}
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        loop="uvloop",
        http="httptools",
        timeout_keep_alive=75,
        access_log=False,
    )
