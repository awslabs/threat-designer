"""
Tavily Tools Module

Provides Tavily Search and Extract tools for the Sentry agent.
Tools are conditionally loaded based on TAVILY_API_KEY availability.
"""

import os
import logging
from typing import List

logger = logging.getLogger(__name__)


def get_tavily_tools() -> List:
    """
    Returns Tavily tools if TAVILY_API_KEY is configured.
    Returns empty list if API key is not set or on any initialization error.

    This function handles errors gracefully to ensure the agent can start
    even when Tavily tools are unavailable.
    """
    api_key = os.environ.get("TAVILY_API_KEY")

    if not api_key:
        logger.warning("TAVILY_API_KEY not set - Tavily tools will not be available")
        return []

    try:
        from langchain_tavily import TavilySearch, TavilyExtract

        # Configure TavilySearch tool
        tavily_search = TavilySearch(
            max_results=5,
            topic="general",
            search_depth="basic",
        )

        # Configure TavilyExtract tool
        tavily_extract = TavilyExtract(
            extract_depth="basic",
        )

        logger.info("Tavily tools loaded successfully")
        return [tavily_search, tavily_extract]

    except ImportError as e:
        logger.error(f"Failed to import langchain-tavily: {e}")
        return []
    except Exception as e:
        # Sanitize error to not expose API key
        error_msg = str(e)
        if api_key and api_key in error_msg:
            error_msg = error_msg.replace(api_key, "[REDACTED]")
        logger.error(f"Failed to initialize Tavily tools: {error_msg}")
        return []
