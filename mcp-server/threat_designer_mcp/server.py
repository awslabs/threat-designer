"""Threat Designer MCP server"""

import os
import httpx
from mcp.server.fastmcp import FastMCP, Context
from typing import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from threat_designer_mcp.state import (
    StartThreatModeling
)
from threat_designer_mcp.utils import (
    validate_image,
)
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


@mcp.tool()
async def get_threat_model(ctx: Context, threat_model_id: str) -> str:
    """Retrieve a threat model from the threat catalog"""
    app_context = ctx.request_context.lifespan_context

    try:
        response = await app_context.api_client.get(f"{app_context.base_endpoint}/{threat_model_id}")
        response.raise_for_status()
        return json.dumps(response.json())
    except httpx.RequestError as e:
        return f"API request failed: {e}"
    

@mcp.tool()
async def create_threat_model(ctx: Context, payload: StartThreatModeling) -> str:
    """Submit a threat model"""
    app_context = ctx.request_context.lifespan_context

    try:
        # Validate the image if a file path is provided
        if 'arch_location' in payload and payload['arch_location']:
            image_path = payload['arch_location']
            
            # Validate the image and get its type
            img_type, _, _ = validate_image(image_path)
            
            # Determine content type based on image format
            content_type = f"image/{img_type}"
            if img_type == 'jpeg':
                content_type = "image/jpeg"
            
            # Get presigned URL for upload
            presigned_response = await app_context.api_client.post(
                f"{app_context.base_endpoint}/upload",
                json={"file_type": content_type}
            )
            presigned_response.raise_for_status()
            presigned_data = presigned_response.json()
            
            # Upload the image to S3
            with open(image_path, 'rb') as file:
                file_data = file.read()
                
            headers = {'Content-Type': content_type}
            
            async with httpx.AsyncClient() as client:
                upload_response = await client.put(
                    presigned_data["presigned"], 
                    content=file_data, 
                    headers=headers
                )
                upload_response.raise_for_status()
            
            # Update the payload with the S3 object key and remove the local path
            payload['s3_location'] = presigned_data["name"]
            # Remove the image_path as it's not needed in the API call
            payload.pop('arch_location', None)
        
        # Create the threat model
        response = await app_context.api_client.post(
            f"{app_context.base_endpoint}",
            json=payload
        )
        response.raise_for_status()
        return json.dumps(response.json())
    except FileNotFoundError as e:
        return f"Image file not found: {e}"
    except ValueError as e:
        return f"Image validation failed: {e}"
    except httpx.RequestError as e:
        return f"API request failed: {e}"



def main():
    """Run the MCP server with CLI argument support."""
    mcp.run()

if __name__ == "__main__":
    main()