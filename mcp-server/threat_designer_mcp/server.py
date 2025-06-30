"""Threat Designer MCP server"""

import os
import httpx
from mcp.server.fastmcp import FastMCP, Context
from typing import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
import json

@dataclass
class AppContext:
    api_client: httpx.AsyncClient
    base_endpoint: str

@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[AppContext]:
    """Initialize with API key from environment"""
    api_key = os.environ.get("API_KEY")
    if not api_key:
        raise ValueError("API_KEY environment variable is required")
    
    # Create client with API key authentication
    client = httpx.AsyncClient(
        headers={"x-api-key": api_key},
        timeout=30.0
    )
    
    try:
        yield AppContext(
            api_client=client,
            base_endpoint = os.environ.get("API_ENDPOINT")
            )
    finally:
        await client.aclose()

mcp = FastMCP(
    "threat-designer.mcp-server",
    dependencies=['pydantic'],
    lifespan=app_lifespan)

import json

@mcp.tool()
async def list_all_threat_models(ctx: Context) -> str:
    """Retrieve all threat models from the threat catalog"""
    app_context = ctx.request_context.lifespan_context

    try:
        response = await app_context.api_client.get(f"{app_context.base_endpoint}/all")
        response.raise_for_status()
        return json.dumps(response.json())
    except httpx.RequestError as e:
        return f"API request failed: {e}"

def main():
    """Run the MCP server with CLI argument support."""
    mcp.run()

if __name__ == "__main__":
    main()
