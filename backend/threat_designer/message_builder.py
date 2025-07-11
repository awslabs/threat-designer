"""Message building utilities for model interactions."""

from typing import List

from langchain_core.messages.human import HumanMessage


class MessageBuilder:
    """Utility class for building standardized messages."""

    @staticmethod
    def create_architecture_message(
        image_data: str,
        description: str,
        assumptions: str,
        custom_text: str = "Analyze the following architecture:",
    ) -> HumanMessage:
        """Create standardized architecture analysis message."""
        content = [
            {"type": "text", "text": custom_text},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_data}"},
            },
            {"type": "text", "text": f"<description>{description}</description>"},
            {"type": "text", "text": f"<assumptions>{assumptions}</assumptions>"},
        ]
        return HumanMessage(content=content)

    @staticmethod
    def create_threat_message(
        image_data: str, description: str, assumptions: str
    ) -> HumanMessage:
        """Create threat analysis message."""
        return MessageBuilder.create_architecture_message(
            image_data,
            description,
            assumptions,
            "Define threats and mitigations for the following solution:",
        )

    @staticmethod
    def create_gap_message(
        image_data: str, description: str, assumptions: str, threat_list: str
    ) -> HumanMessage:
        """Create gap analysis message."""
        content = [
            {"type": "text", "text": "There are gaps in the <threats> ??\n"},
            {"type": "text", "text": f"<threats>{threat_list}</threats>\n"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_data}"},
            },
            {
                "type": "text",
                "text": f"<solution_description>{description}</solution_description>",
            },
            {"type": "text", "text": f"<assumptions>{assumptions}</assumptions>"},
        ]
        return HumanMessage(content=content)

    @staticmethod
    def create_summary_message(
        image_data: str, description: str, max_words: int = 40
    ) -> HumanMessage:
        """Create summary generation message."""
        content = [
            {
                "type": "text",
                "text": f"Generate a short headline summary of max {max_words} words this architecture using the diagram and description if available",
            },
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_data}"},
            },
            {"type": "text", "text": f"<description>{description}</description>"},
        ]
        return HumanMessage(content=content)


def list_to_string(str_list: List[str]) -> str:
    """Convert a list of strings to a single string."""
    if not str_list:
        return " "
    return "\n".join(str_list)
