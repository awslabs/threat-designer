"""Message building utilities for model interactions."""

import os
from typing import Any, Dict, List

from langchain_core.messages.human import HumanMessage

from constants import ENV_MODEL_PROVIDER, MODEL_PROVIDER_BEDROCK


class MessageBuilder:
    """Utility class for building standardized messages."""

    def __init__(
        self,
        image_data: str,
        description: str,
        assumptions: str,
    ) -> None:
        """Message builder constructor"""

        self.image_data = image_data
        self.description = description
        self.assumptions = assumptions
        self.provider = os.environ.get(ENV_MODEL_PROVIDER, MODEL_PROVIDER_BEDROCK)

    def _format_asset_list(self, assets) -> str:
        """Helper function to format asset names as a bulleted list."""
        if not assets or not hasattr(assets, "assets") or not assets.assets:
            return "No assets identified yet."

        asset_names = [asset.name for asset in assets.assets]
        return "\n".join([f"  - {name}" for name in asset_names])

    def _format_threat_sources(self, system_architecture) -> str:
        """Helper function to format threat source categories as a bulleted list."""
        if (
            not system_architecture
            or not hasattr(system_architecture, "threat_sources")
            or not system_architecture.threat_sources
        ):
            return "No threat sources identified yet."

        source_categories = [
            source.category for source in system_architecture.threat_sources
        ]
        return "\n".join([f"  - {category}" for category in source_categories])

    def _add_cache_point_if_bedrock(self) -> List[Dict[str, Any]]:
        """Add cache point marker only for Bedrock provider."""
        if self.provider == MODEL_PROVIDER_BEDROCK:
            return [{"cachePoint": {"type": "default"}}]
        return []

    def base_msg(
        self, caching: bool = False, details: bool = True
    ) -> List[Dict[str, Any]]:
        """Base message for all messages."""

        base_message = [
            {"type": "text", "text": "<architecture_diagram>"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{self.image_data}"},
            },
            {"type": "text", "text": "</architecture_diagram>"},
        ]

        if details:
            base_message.extend(
                [
                    {
                        "type": "text",
                        "text": f"<description>{self.description}</description>",
                    },
                    {
                        "type": "text",
                        "text": f"<assumptions>{self.assumptions}</assumptions>",
                    },
                ]
            )

        if caching:
            base_message.extend(self._add_cache_point_if_bedrock())

        return base_message

    def create_summary_message(self, max_words: int = 40) -> HumanMessage:
        """Create summary message."""

        summary_msg = [
            {
                "type": "text",
                "text": f"Generate a short headline summary of max {max_words} words this architecture using the diagram and description if available",
            },
        ]

        base_message = self.base_msg()
        base_message.extend(summary_msg)
        return HumanMessage(content=base_message)

    def create_asset_message(self) -> HumanMessage:
        """Create asset message."""

        asset_msg = [
            {"type": "text", "text": "Identify Assets"},
        ]

        base_message = self.base_msg()
        base_message.extend(asset_msg)
        return HumanMessage(content=base_message)

    def create_system_flows_message(
        self,
        assets: str,
    ) -> HumanMessage:
        """Create system flows message."""

        system_flows_msg = [
            {
                "type": "text",
                "text": f"<identified_assets_and_entities>{assets}</identified_assets_and_entities>",
            },
            {"type": "text", "text": "Identify system flows"},
        ]

        base_message = self.base_msg()
        base_message.extend(system_flows_msg)
        return HumanMessage(content=base_message)

    def create_threat_message(self, assets, flows) -> HumanMessage:
        """Create threat analysis message."""

        valid_values_text = f"""<valid_values_for_threats>
**IMPORTANT: When creating threats using the add_threats tool, you MUST use ONLY these values for the following fields:**

**Valid Target Assets (for the 'target' field):**
{self._format_asset_list(assets)}

**Valid Threat Sources (for the 'source' field):**
{self._format_threat_sources(flows)}

Using any other values will result in validation errors. These are the ONLY acceptable values extracted from the identified assets and threat sources above.
</valid_values_for_threats>"""

        threat_msg = [
            {
                "type": "text",
                "text": f"<identified_assets_and_entities>{assets}</identified_assets_and_entities>",
            },
            {"type": "text", "text": f"<data_flow>{flows}</data_flow>"},
            {"type": "text", "text": valid_values_text},
            {"type": "text", "text": "Define threats and mitigations for the solution"},
        ]

        base_message = self.base_msg()
        base_message.extend(threat_msg)
        return HumanMessage(content=base_message)

    def create_threat_improve_message(
        self, assets, flows, threat_list: str
    ) -> HumanMessage:
        """Create threat improvement analysis message."""

        valid_values_text = f"""<valid_values_for_threats>
**IMPORTANT: When creating threats using the add_threats tool, you MUST use ONLY these values for the following fields:**

**Valid Target Assets (for the 'target' field):**
{self._format_asset_list(assets)}

**Valid Threat Sources (for the 'source' field):**
{self._format_threat_sources(flows)}

Using any other values will result in validation errors. These are the ONLY acceptable values extracted from the identified assets and threat sources above.
</valid_values_for_threats>"""

        threat_msg = [
            {
                "type": "text",
                "text": f"<identified_assets_and_entities>{assets}</identified_assets_and_entities>",
            },
            {"type": "text", "text": f"<data_flow>{flows}</data_flow>"},
        ]

        # Add cache point only for Bedrock
        threat_msg.extend(self._add_cache_point_if_bedrock())

        threat_msg.extend(
            [
                {"type": "text", "text": valid_values_text},
                {"type": "text", "text": f"<threats>{threat_list}</threats>"},
                {
                    "type": "text",
                    "text": "Identify missing threats and respective mitigations for the solution",
                },
            ]
        )

        base_message = self.base_msg(caching=True)
        base_message.extend(threat_msg)
        return HumanMessage(content=base_message)

    def create_threat_agent_message(self, threats=True) -> HumanMessage:
        """Create threat agent message."""

        threat_msg = []

        if not threats:
            threat_msg.append(
                {
                    "type": "text",
                    "text": "Currently the threat catalog is empty, No threats have been cataloged yet",
                }
            )

        threat_msg.append(
            {
                "type": "text",
                "text": "Create the comprehensive threat catalog while honoring the ground rules.",
            }
        )

        threat_msg.extend(self._add_cache_point_if_bedrock())
        base_message = self.base_msg(caching=True, details=False)
        base_message.extend(threat_msg)
        return HumanMessage(content=base_message)

    def create_gap_analysis_message(
        self, assets: str, flows: str, threat_list: str, gap: str
    ) -> HumanMessage:
        """Create threat improvement analysis message."""

        gap_msg = [
            {
                "type": "text",
                "text": f"<identified_assets_and_entities>{assets}</identified_assets_and_entities>",
            },
            {"type": "text", "text": f"<data_flow>{flows}</data_flow>"},
        ]

        # Add cache point only for Bedrock
        gap_msg.extend(self._add_cache_point_if_bedrock())

        gap_msg.extend(
            [
                {"type": "text", "text": f"<threats>{threat_list}</threats>"},
                {"type": "text", "text": f"<previous_gap>{gap}</previous_gap>\n"},
                {
                    "type": "text",
                    "text": "Proceed with gap analysis",
                },
            ]
        )

        base_message = self.base_msg(caching=True)
        base_message.extend(gap_msg)
        return HumanMessage(content=base_message)


def list_to_string(str_list: List[str]) -> str:
    """Convert a list of strings to a single string."""
    if not str_list:
        return " "
    return "\n".join(str_list)
