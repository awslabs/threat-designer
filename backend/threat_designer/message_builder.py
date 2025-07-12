"""Message building utilities for model interactions."""

from typing import Any, Dict, List

from langchain_core.messages.human import HumanMessage


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

    def base_msg(self, caching: bool = False) -> List[Dict[str, Any]]:
        """Base message for all messages."""

        cache_config = {"cachePoint": {"type": "default"}}

        base_message = [
            {"type": "text", "text": "<architecture_diagram>"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{self.image_data}"},
            },
            {"type": "text", "text": "</architecture_diagram>"},
            {"type": "text", "text": f"<description>{self.description}</description>"},
            {"type": "text", "text": f"<assumptions>{self.assumptions}</assumptions>"},
        ]

        if caching:
            base_message.append(cache_config)

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

    def create_threat_message(self, assets: str, flows: str) -> HumanMessage:
        """Create threat analysis message."""

        threat_msg = [
            {
                "type": "text",
                "text": f"<identified_assets_and_entities>{assets}</identified_assets_and_entities>",
            },
            {"type": "text", "text": f"<data_flow>{flows}</data_flow>"},
            {"type": "text", "text": "Define threats and mitigations for the solution"},
        ]

        base_message = self.base_msg()
        base_message.extend(threat_msg)
        return HumanMessage(content=base_message)

    def create_threat_improve_message(
        self, assets: str, flows: str, threat_list: str, gap: str
    ) -> HumanMessage:
        """Create threat improvement analysis message."""

        threat_msg = [
            {
                "type": "text",
                "text": f"<identified_assets_and_entities>{assets}</identified_assets_and_entities>",
            },
            {"type": "text", "text": f"<data_flow>{flows}</data_flow>"},
            {"cachePoint": {"type": "default"}},
            {"type": "text", "text": f"<threats>{threat_list}</threats>"},
            {"type": "text", "text": f"<gap>{gap}</gap>"},
            {
                "type": "text",
                "text": "Identify missing threats and respective mitigations for the solution",
            },
        ]

        base_message = self.base_msg(caching=True)
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
            {"cachePoint": {"type": "default"}},
            {"type": "text", "text": f"<threats>{threat_list}</threats>"},
            {"type": "text", "text": f"<previous_gap>{gap}</previous_gap>\n"},
            {
                "type": "text",
                "text": "Identify missing threats and respective mitigations for the solution",
            },
        ]

        base_message = self.base_msg(caching=True)
        base_message.extend(gap_msg)
        return HumanMessage(content=base_message)


def list_to_string(str_list: List[str]) -> str:
    """Convert a list of strings to a single string."""
    if not str_list:
        return " "
    return "\n".join(str_list)
