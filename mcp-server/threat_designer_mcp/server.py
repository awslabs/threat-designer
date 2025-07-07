"""Threat Designer MCP server"""

import os
import httpx
from mcp.server.fastmcp import FastMCP, Context
from typing import AsyncIterator, Optional, Literal
from contextlib import asynccontextmanager
from dataclasses import dataclass
from threat_designer_mcp.state import (
    StartThreatModeling
)
from threat_designer_mcp.utils import (
    validate_image,
    transform_threat_models
)
import time
import asyncio
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
            base_endpoint = f"{os.environ.get("API_ENDPOINT")}/threat-designer/mcp"
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
        
        # Get the response data
        response_data = response.json()
        
        # Extract the catalogs list from the response
        threat_models = []
        if isinstance(response_data, dict) and "catalogs" in response_data:
            threat_models = response_data["catalogs"]
        
        # If we have threat models, transform them to the desired format
        if threat_models and isinstance(threat_models, list):
            transformed_models = transform_threat_models(threat_models)
            return json.dumps(transformed_models)
        else:
            return json.dumps([])
    except httpx.RequestError as e:
        return f"API request failed: {e}"





@mcp.tool()
async def get_threat_model(ctx: Context, model_id: str, filter: Optional[Literal["threats", "assets", "trust_boundaries", "threat_sources"]]) -> str:
    """
    Fetch details from the given threat model.
    
    Args:
        ctx: The context object
        model_id: The ID of the threat model to check
        filter: Optional filter for specific components. Can be one of:
               "threats", "assets", "trust_boundaries", or "threat_sources".
               If not provided, returns the complete threat model model.
    
    Returns:
        JSON string with the threat model status and data (if available)
    """
    app_context = ctx.request_context.lifespan_context
    
    # Validate filter if provided
    valid_filters = [None, "threats", "assets", "trust_boundaries", "threat_sources"]
    if filter is not None and filter not in valid_filters:
        return json.dumps({
            "job_id": model_id,
            "state": "ERROR",
            "message": f"Invalid filter: {filter}. Valid filters are: threats, assets, trust_boundaries, threat_sources"
        })
    
    try:
        # Query the status API
        status_response = await app_context.api_client.get(
            f"{app_context.base_endpoint}/{model_id}"
        )
        status_response.raise_for_status()
        status_data = status_response.json()
        
        # Apply filter if specified and the model is found
        if status_data.get("state") == "Found" and filter is not None and "item" in status_data:
            item = status_data["item"]
            filtered_item = {}
            
            if filter == "threats" and "threat_list" in item:
                filtered_item["threat_list"] = {"threats": item["threat_list"]["threats"]}
            
            elif filter == "assets" and "assets" in item:
                filtered_item["assets"] = {"assets": item["assets"]["assets"]}
            
            elif filter == "trust_boundaries" and "system_architecture" in item:
                filtered_item["system_architecture"] = {
                    "trust_boundaries": item["system_architecture"]["trust_boundaries"]
                }
            
            elif filter == "threat_sources" and "system_architecture" in item:
                filtered_item["system_architecture"] = {
                    "threat_sources": item["system_architecture"]["threat_sources"]
                }
                
            # Replace the original item with the filtered one
            status_data["item"] = filtered_item
        
        return json.dumps(status_data)
        
    except httpx.RequestError as e:
        # Handle request errors
        error_message = f"Error checking status: {str(e)}"
        return json.dumps({
            "job_id": model_id,
            "state": "ERROR",
            "message": error_message
        })


@mcp.tool()
async def create_threat_model(ctx: Context, payload: StartThreatModeling) -> str:
    """Submit a threat model and poll for completion"""
    app_context = ctx.request_context.lifespan_context

    try:
        # Convert Pydantic model to dict for manipulation
        payload_dict = payload.dict()
        
        # Validate the image if a file path is provided
        if 'arch_location' in payload_dict and payload_dict['arch_location']:
            image_path = payload_dict['arch_location']
            
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
            payload_dict['s3_location'] = presigned_data["name"]
            # Remove the image_path as it's not needed in the API call
            payload_dict.pop('arch_location', None)
        
        # Create the threat model
        response = await app_context.api_client.post(
            f"{app_context.base_endpoint}",
            json=payload_dict
        )
        response.raise_for_status()
        result = response.json()
        
        # Extract the ID from the response
        model_id = result.get("id")
        if not model_id:
            return "Failed to get model ID from response"
        
        return json.dumps({
                "model_id": model_id,
            })
        
    except FileNotFoundError as e:
        return f"Image file not found: {e}"
    except ValueError as e:
        return f"Image validation failed: {e}"
    except httpx.RequestError as e:
        return f"API request failed: {e}"

@mcp.tool()
async def poll_threat_model_status(ctx: Context, model_id: str) -> str:
    """Poll the status of a threat model until completion or failure. It can take between 10 - 15minutes."""
    # Define constants
    MAX_POLLING_TIME = 20
    POLLING_INTERVAL = 10  # 10 seconds
    app_context = ctx.request_context.lifespan_context

    # Initialize variables
    start_time = time.time()
    status = "PENDING"
    
    while True:
        # Check if we've exceeded the maximum polling time
        current_time = time.time()
        if current_time - start_time > MAX_POLLING_TIME:
            return json.dumps({
                "id": model_id,
                "status": "PROCESSING",
                "message": "Threat modeling still processing. Try again later."
            })
        
        try:
            # Query the status API
            status_response = await app_context.api_client.get(
                f"{app_context.base_endpoint}/status/{model_id}"
            )
            status_response.raise_for_status()
            status_data = status_response.json()
            
            # Extract status from response
            status = status_data.get("state", "UNKNOWN")
            
            # Check if process is complete or failed
            if status in ["COMPLETE", "FAILED"]:
                return json.dumps({
                "id": model_id,
                "status": status,
            })
            # Wait before polling again
            await asyncio.sleep(POLLING_INTERVAL)
            
        except httpx.RequestError as e:
            # If there's an error querying the status, log it but continue polling
            print(f"Error querying status: {e}")
            await asyncio.sleep(POLLING_INTERVAL)

@mcp.tool()
async def check_threat_model_status(ctx: Context, model_id: str) -> str:
    """Check the current status of a threat model without polling."""
    app_context = ctx.request_context.lifespan_context
    
    try:
        # Make a single query to the status API
        status_response = await app_context.api_client.get(
            f"{app_context.base_endpoint}/status/{model_id}"
        )
        status_response.raise_for_status()
        status_data = status_response.json()
        
        # Extract status from response
        status = status_data.get("state", "UNKNOWN")
        
        # Return the current status
        return json.dumps({
            "id": model_id,
            "status": status,
            "message": f"Current threat model status: {status}"
        })
        
    except httpx.RequestError as e:
        # Handle any request errors
        error_message = f"Error checking status: {str(e)}"
        return json.dumps({
            "id": model_id,
            "status": "ERROR",
            "message": error_message
        })

def main():
    """Run the MCP server with CLI argument support."""
    mcp.run()

if __name__ == "__main__":
    main()