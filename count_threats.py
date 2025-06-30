#!/usr/bin/env python3
"""Simple script to count threat models in the catalog"""

import json
import sys

def count_threat_models():
    """Count threat models from the MCP server response"""
    try:
        # We'll use the MCP tools to get the data
        from mcp_server.threat_designer_mcp.server import list_all_threat_models
        
        # This would need to be called through the MCP interface
        # For now, let's create a simple counting approach
        print("Attempting to count threat models...")
        
        # Since we can't directly call the async function here,
        # we'll need to use the MCP tools through the interface
        return "Please use the MCP tools to get the count"
        
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    result = count_threat_models()
    print(result)