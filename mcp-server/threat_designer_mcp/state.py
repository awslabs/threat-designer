"""Module containing data models for the threat designer application."""

from typing import List

from pydantic import BaseModel, Field


class StartThreatModeling(BaseModel):
    """Payload required to start a new threat model"""

    arch_location: str = Field(
        description="The absolute path location where the architecture diagram is stored. Only png/jpeg accepted. Maximum image size (8,000 px x 8,000 px) 3.75 MB."
    )
    reasoning: int = Field(
        default=2,
        description="The level of reasoning  the agent should use for the threat analysis: 0=none, 1=low, 2=medium, 3=high effort",
        ge=0,
        le=3,
    )
    iteration: int = Field(
        default=0,
        description="The number of iterations the Agent should spend to improve the threat model. when set to 0, the agent decides itself when to stop the iterations.",
        ge=0,
        le=15,
    )
    description: str = Field(
        default="",
        description="Business context and additional details that might not be obvious from the architecture diagram alone.",
    )
    assumptions: List[str] = Field(
        default=[],
        description="Establish the baseline security context and boundaries that help identify what's in scope for analysis and what potential threats are relevant to consider.",
    )
    title: str = Field(default="", description="The title of the threat model.")
