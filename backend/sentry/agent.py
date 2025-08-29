from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from models import InvocationRequest
from session_manager import session_manager
from agent_manager import agent_manager
from handlers import handlers
from streaming import streaming_handler, cancel_stream_async
from exceptions import MissingHeader
from utils import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing with all available tools, no context, and no diagram...")

    try:
        # Initialize with all available tools, no context, no diagram, and default budget level
        await agent_manager.initialize_default_agent()
    except Exception as e:
        logger.error(f"Failed to initialize default agent: {e}")
        raise

    yield

    logger.info("Shutting down...")

    # Clear session cache
    session_manager.clear_cache()


# Initialize FastAPI app
app = FastAPI(title="Sentry Agent Server", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET, POST, OPTIONS"],
    allow_headers=["*"],
)


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
        return await streaming_handler.handle_streaming_request(request, session_id)

    # Handle immediate response types with normal returns
    if request_type == "ping":
        return handlers.handle_ping()

    if request_type == "stop":
        return await cancel_stream_async(session_id)

    if request_type == "tools":
        return handlers.handle_tools()

    if request_type == "history":
        return handlers.handle_history(session_id)

    if request_type == "delete_history":
        return handlers.handle_delete_history(session_header, session_id)

    if request_type == "prepare":
        return await handlers.handle_prepare(request)


@app.get("/ping")
async def ping():
    return {"status": "healthy"}


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
