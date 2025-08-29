from functools import wraps
import json
from typing import AsyncGenerator, Optional
import logging
import traceback
from fastapi.responses import StreamingResponse, JSONResponse
from exceptions import MissingHeader
import boto3
from botocore.config import Config
import hashlib
from typing import Dict, Any, List
from graph import create_react_agent
from langgraph.checkpoint.memory import InMemorySaver
from langchain_aws import ChatBedrockConverse
from prompt import system_prompt
import base64
import inspect
from botocore.credentials import RefreshableCredentials
from botocore.session import get_session


# Configure logger
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


diagram_cache = {}


def log_error(error: Exception, custom_message: str = None):
    """Log error as dictionary with error message and traceback details"""
    error_dict = {
        "error": custom_message or str(error),
        "details": traceback.format_exc(),
    }

    logger.error(json.dumps(error_dict, indent=2))


def sse_stream(media_type: str = "text/event-stream"):
    """Optimized decorator that wraps yielded content with SSE formatting"""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                # Call the original function
                result = func(*args, **kwargs)

                # Check if it's a coroutine (async function)
                if inspect.iscoroutine(result):
                    result = await result

                # Check if it's a generator/async generator or a regular return value
                if inspect.isasyncgen(result) or inspect.isgenerator(result):
                    # Handle streaming response
                    async def sse_generator() -> AsyncGenerator[str, None]:
                        try:
                            async for item in result:
                                if isinstance(item, dict):
                                    yield f"data: {json.dumps(item)}\n\n"
                                elif isinstance(item, str):
                                    if item.startswith("data:"):
                                        yield item
                                    else:
                                        yield f"data: {item}\n\n"
                                else:
                                    yield f"data: {json.dumps(str(item))}\n\n"
                        except MissingHeader as e:
                            yield f"data: {json.dumps({'error': {'code': e.code, 'detail': e.detail}})}\n\n"
                        except Exception as e:
                            log_error(e)
                            yield f"data: {json.dumps({'error': str(e)})}\n\n"

                    return StreamingResponse(
                        sse_generator(),
                        media_type=media_type,
                        headers={
                            "Cache-Control": "no-cache",
                            "Connection": "keep-alive",
                            "X-Accel-Buffering": "no",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "POST, OPTIONS",
                            "Access-Control-Allow-Headers": "*",
                        },
                    )
                else:
                    # Handle immediate JSON response
                    return JSONResponse(
                        content=result,
                        headers={
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                            "Access-Control-Allow-Headers": "*",
                        },
                    )

            except MissingHeader as e:
                return JSONResponse(
                    content={"error": {"code": e.code, "detail": e.detail}},
                    status_code=400,
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                        "Access-Control-Allow-Headers": "*",
                    },
                )
            except Exception as e:
                log_error(e)
                return JSONResponse(
                    content={"error": str(e)},
                    status_code=500,
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                        "Access-Control-Allow-Headers": "*",
                    },
                )

        return wrapper

    return decorator


def create_bedrock_client(
    region: Optional[str] = None, config: Optional[Config] = None
) -> boto3.client:
    """
    Create Bedrock client with automatically refreshing credentials using boto3's built-in mechanisms.
    """
    ROLE = "arn:aws:iam::355235952194:role/threat-designer"
    region = region or "us-east-1"
    config = config or Config(read_timeout=1000)

    def refresh_credentials():
        """Function to refresh credentials"""
        sts_client = boto3.client("sts", region_name=region)
        assumed_role = sts_client.assume_role(
            RoleArn=ROLE, RoleSessionName="bedrock-client-session", DurationSeconds=3600
        )
        credentials = assumed_role["Credentials"]
        return {
            "access_key": credentials["AccessKeyId"],
            "secret_key": credentials["SecretAccessKey"],
            "token": credentials["SessionToken"],
            "expiry_time": credentials["Expiration"].isoformat(),
        }

    # Create refreshable credentials
    refreshable_credentials = RefreshableCredentials.create_from_metadata(
        metadata=refresh_credentials(),
        refresh_using=refresh_credentials,
        method="assume-role",
    )

    # Create session with refreshable credentials
    session = get_session()
    session._credentials = refreshable_credentials

    # Create client using the session
    return session.create_client(
        service_name="bedrock-runtime", region_name=region, config=config
    )


def extract_tool_preferences(input_data: Dict[str, Any]) -> Optional[List[str]]:
    """
    Extract tool preferences from input data.
    Returns None if no preferences specified (meaning use all tools)
    Returns [] if preferences is explicitly empty (meaning use no tools)
    Supports multiple formats:
    1. Explicit 'tool_preferences' field
    """
    # Direct field approach
    if "tool_preferences" in input_data:
        prefs = input_data["tool_preferences"]
        if isinstance(prefs, str):
            tool_list = [p.strip() for p in prefs.split(",") if p.strip()]
            return tool_list if tool_list else []
        elif isinstance(prefs, list):
            tool_list = [str(p).strip() for p in prefs if str(p).strip()]
            return tool_list if tool_list else []

    return None


def extract_context(input_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract context from input data for system prompt.
    Returns None if no context specified.
    """
    return input_data.get("context")


def extract_diagram_path(input_data: Dict[str, Any]) -> Optional[str]:
    """
    Extract diagram path from input data.
    Returns None if no diagram specified.
    """
    return input_data.get("diagram")


def get_context_hash(context: Optional[Dict[str, Any]]) -> str:
    """Generate a hash for the current context to detect changes"""
    if context is None:
        return "no_context"
    # Sort keys for consistent hashing
    context_str = json.dumps(context, sort_keys=True)
    return hashlib.md5(context_str.encode()).hexdigest()


def get_diagram_hash(diagram_path: Optional[str]) -> str:
    """Generate a hash for the current diagram path to detect changes"""
    if diagram_path is None:
        return "no_diagram"
    return hashlib.md5(diagram_path.encode()).hexdigest()


async def download_and_cache_diagram(
    diagram_path: str, boto_client, s3_bucket: str, logger
) -> Optional[Dict[str, Any]]:
    """
    Fetch diagram from S3, convert to base64, and cache it in image_url format.
    Returns the formatted image data if successful, None otherwise.
    """
    if not s3_bucket:
        logger.error("S3_BUCKET environment variable not set")
        return None

    if not diagram_path:
        logger.warning("Empty diagram path provided")
        return None

    # Generate cache key
    cache_key = get_diagram_hash(diagram_path)

    # Check if already cached
    if cache_key in diagram_cache:
        cached_data = diagram_cache[cache_key]
        logger.info(f"Using cached diagram data for: {diagram_path}")
        return cached_data

    try:
        # Create S3 client
        s3_client = boto3.client("s3")

        s3_key = diagram_path
        logger.info(f"Fetching diagram from s3://{s3_bucket}/{s3_key}")

        # Get the object directly from S3
        response = s3_client.get_object(Bucket=s3_bucket, Key=s3_key)

        # Get content type from metadata
        content_type = response.get("ContentType", "image/jpeg")

        # If content type is not an image or is generic, try to determine from the key
        if (
            not content_type.startswith("image/")
            or content_type == "application/octet-stream"
        ):
            # Common image formats
            if s3_key.lower().endswith((".jpg", ".jpeg")):
                content_type = "image/jpeg"
            elif s3_key.lower().endswith(".png"):
                content_type = "image/png"
            elif s3_key.lower().endswith(".gif"):
                content_type = "image/gif"
            elif s3_key.lower().endswith(".webp"):
                content_type = "image/webp"
            elif s3_key.lower().endswith(".bmp"):
                content_type = "image/bmp"
            else:
                # If we can't determine the type, default to JPEG
                content_type = "image/jpeg"
                logger.warning(
                    f"Could not determine image type for {s3_key}, defaulting to JPEG"
                )

        # Read the file content directly from the response
        file_content = response["Body"].read()

        # Check if content is empty
        if not file_content:
            logger.error(f"Retrieved empty content from {s3_key}")
            return None

        # Convert directly to base64
        image_data = base64.b64encode(file_content).decode("utf-8")

        # Format the cached data
        cached_data = {
            "type": "image_url",
            "image_url": {"url": f"data:{content_type};base64,{image_data}"},
        }

        # Cache the formatted data
        diagram_cache[cache_key] = cached_data
        logger.info(
            f"Diagram cached successfully as base64 data (size: {len(file_content)} bytes, type: {content_type})"
        )

        return cached_data

    except Exception as e:
        logger.error(f"Failed to fetch and cache diagram from {diagram_path}: {e}")
        return None


def get_tools_for_preferences(
    tool_preferences: Optional[List[str]],
    all_available_tools: List,
    tool_name_map: Dict,
    logger,
) -> List:
    """
    Get tools based on preferences.
    - If no preferences (None), return all tools.
    - If empty list ([]), return empty list (no tools).
    - Otherwise filter based on preferences.
    Only includes tools that exist in the available tools.
    """
    # If no preferences specified, return all available tools
    if tool_preferences is None:
        logger.info("No tool preferences specified")
        return []

    # If explicitly empty list, return no tools
    if tool_preferences == []:
        logger.info("Tool preferences explicitly set to empty list, returning no tools")
        return []

    # Filter tools based on preferences
    selected_tools = []
    valid_tool_names = []
    invalid_tool_names = []

    for tool_name in tool_preferences:
        # Try exact match first
        if tool_name in tool_name_map:
            selected_tools.append(tool_name_map[tool_name])
            valid_tool_names.append(tool_name)
        else:
            # Try case-insensitive match
            tool_name_lower = tool_name.lower()
            found = False
            for available_name, tool_obj in tool_name_map.items():
                if available_name.lower() == tool_name_lower:
                    selected_tools.append(tool_obj)
                    valid_tool_names.append(available_name)
                    found = True
                    break

            if not found:
                invalid_tool_names.append(tool_name)

    # Log results
    if valid_tool_names:
        logger.info(f"Selected tools: {valid_tool_names}")
    if invalid_tool_names:
        logger.warning(
            f"Invalid tool names ignored: {invalid_tool_names}. Available tools: {list(tool_name_map.keys())}"
        )

    # If no valid tools found, fall back to all tools
    if not selected_tools:
        logger.warning(
            "No valid tools found in preferences, falling back to all available tools"
        )
        return all_available_tools.copy()

    seen = set()
    unique_tools = []
    for tool in selected_tools:
        tool_id = id(tool)
        if tool_id not in seen:
            seen.add(tool_id)
            unique_tools.append(tool)

    return unique_tools


def get_tools_hash(tools: List) -> str:
    """Generate a hash for the current tool set to detect changes"""
    tool_names = sorted([f"{tool.__module__}.{tool.name}" for tool in tools])
    return hashlib.md5(str(tool_names).encode()).hexdigest()


async def get_or_create_agent(
    tool_preferences: Optional[List[str]],
    context: Optional[Dict[str, Any]],
    diagram_path: Optional[str],
    all_available_tools: List,
    tool_name_map: Dict,
    llm: ChatBedrockConverse,
    checkpointer: InMemorySaver,
    boto_client,
    s3_bucket: str,
    logger,
    # Global state parameters
    current_tool_preferences,
    current_tools_hash,
    current_context_hash,
    current_diagram_hash,
    cached_agent,
    current_context,
):
    """Get existing agent or create new one if tools, context, or diagram changed"""

    # Get tools for current preferences
    new_tools = get_tools_for_preferences(
        tool_preferences, all_available_tools, tool_name_map, logger
    )
    new_tools_hash = get_tools_hash(new_tools)

    # Get context hash
    new_context_hash = get_context_hash(context)

    # Get diagram hash
    new_diagram_hash = get_diagram_hash(diagram_path)

    # Check if we need to update
    needs_update = (
        current_tool_preferences != tool_preferences
        or current_tools_hash != new_tools_hash
        or current_context_hash != new_context_hash
        or current_diagram_hash != new_diagram_hash
        or cached_agent is None
    )

    if needs_update:
        if current_tool_preferences != tool_preferences:
            logger.info(
                f"Tool preferences changed: {current_tool_preferences} -> {tool_preferences}"
            )
        if current_context_hash != new_context_hash:
            logger.info(
                f"Context changed: {current_context_hash} -> {new_context_hash}"
            )
        if current_diagram_hash != new_diagram_hash:
            logger.info(f"Diagram changed: {diagram_path}")

        logger.info(f"Creating agent with tools: {[tool.name for tool in new_tools]}")

        try:
            # Prepare diagram data if specified (but don't add to context)
            diagram_data = None
            if diagram_path:
                logger.info(f"Processing diagram: {diagram_path}")

                # First check if diagram is already in cache
                cache_key = get_diagram_hash(diagram_path)
                if cache_key in diagram_cache:
                    diagram_data = diagram_cache[cache_key]
                    logger.info(f"Using cached diagram data for: {diagram_path}")
                else:
                    # If not in cache, download and cache it
                    diagram_data = await download_and_cache_diagram(
                        diagram_path, boto_client, s3_bucket, logger
                    )

                if diagram_data:
                    # Just add a flag to context - the actual diagram data remains separate
                    logger.info(f"Diagram processed and available: {diagram_path}")
                else:
                    logger.warning(f"Failed to retrieve diagram data: {diagram_path}")

            # Generate system prompt with enhanced context
            if context:
                prompt = system_prompt(context)
                logger.info("Using context-based system prompt")
            else:
                prompt = system_prompt({})  # Default empty context
                logger.info("Using default system prompt (empty context)")

            # Create new agent
            new_agent = create_react_agent(
                model=llm, tools=new_tools, prompt=prompt, checkpointer=checkpointer
            )

            logger.info("Agent successfully created/updated")

            # Return the new agent and updated state parameters
            # Note: diagram_data is returned separately from the context
            return (
                new_agent,
                tool_preferences,
                new_tools_hash,
                new_context_hash,
                new_diagram_hash,
                diagram_data,
                context,
            )

        except Exception as e:
            logger.error(f"Failed to create agent: {e}")
            raise e
    else:
        logger.debug(
            "Reusing existing agent - tool preferences, context, and diagram unchanged"
        )

        # Get current diagram data from cache if needed
        current_diagram_data = None
        if diagram_path:
            cache_key = get_diagram_hash(diagram_path)
            if cache_key in diagram_cache:
                current_diagram_data = diagram_cache[cache_key]

        return (
            cached_agent,
            current_tool_preferences,
            current_tools_hash,
            current_context_hash,
            current_diagram_hash,
            current_diagram_data,
            current_context,
        )
