"""Module containing state classes and data models for the threat designer application."""

import operator
from datetime import datetime
from langgraph.graph import MessagesState
from typing import Annotated, List, Literal, Optional, TypedDict

from constants import (
    MITIGATION_MAX_ITEMS,
    MITIGATION_MIN_ITEMS,
    SUMMARY_MAX_WORDS_DEFAULT,
    AssetType,
    StrideCategory,
)
from langchain_aws import ChatBedrockConverse
from pydantic import BaseModel, Field


class ConfigSchema(TypedDict):
    """Configuration schema for the workflow."""

    model_assets: ChatBedrockConverse
    model_flows: ChatBedrockConverse
    model_threats: ChatBedrockConverse
    model_gaps: ChatBedrockConverse
    model_struct: ChatBedrockConverse
    model_summary: ChatBedrockConverse
    start_time: datetime
    reasoning: bool


class SummaryState(BaseModel):
    """Model representing the summary of a threat catalog."""

    summary: Annotated[
        str,
        Field(
            description=f"A short headline summary of max {SUMMARY_MAX_WORDS_DEFAULT} words"
        ),
    ]


class Assets(BaseModel):
    """Model representing system assets or entities in threat modeling."""

    type: Annotated[
        Literal[AssetType.ASSET.value, AssetType.ENTITY.value],
        Field(
            description=f"Type, one of {AssetType.ASSET.value} or {AssetType.ENTITY.value}"
        ),
    ]
    name: Annotated[str, Field(description="The name of the asset")]
    description: Annotated[
        str, Field(description="The description of the asset or entity")
    ]


class AssetsList(BaseModel):
    """Collection of system assets for threat modeling."""

    assets: Annotated[List[Assets], Field(description="The list of assets")]


class DataFlow(BaseModel):
    """Model representing data flow between entities in a system architecture."""

    flow_description: Annotated[
        str, Field(description="The description of the data flow")
    ]
    source_entity: Annotated[
        str, Field(description="The source entity/asset of the data flow")
    ]
    target_entity: Annotated[
        str, Field(description="The target entity/asset of the data flow")
    ]


class TrustBoundary(BaseModel):
    """Model representing trust boundaries between entities in system architecture."""

    purpose: Annotated[str, Field(description="The purpose of the trust boundary")]
    source_entity: Annotated[
        str, Field(description="The source entity/asset of the trust boundary")
    ]
    target_entity: Annotated[
        str, Field(description="The target entity/asset of the trust boundary")
    ]


class ContinueThreatModeling(BaseModel):
    """Tool to share the gap analysis for threat modeling."""

    stop: Annotated[
        bool,
        Field(
            description="Should stop threat generation (True) if catalog is comprehensive, or continue (False) if gaps remain."
        ),
    ]
    gap: Annotated[
        Optional[str],
        Field(
            description="""Concise list of identified gaps to improve the threat model. \n
            Each gap must be maximum 40 words. \n
            Format as a bulleted list with each gap on a new line. \n
            Gaps should be actionable and specific. \n
            Very important! When referencing threats, do not use abbreviations. Instead you need to reference the full name of the threat, which is their unique identifier. \n
            Required only when 'stop' is False. \n"""
        ),
    ] = ""
    rating: Annotated[
        int,
        Field(
            description="Overall quality rating of the threat catalog (1-10). 10 = comprehensive and high quality, 1 = significant gaps and issues.",
            ge=1,
            le=10,
        ),
    ]


class ThreatSource(BaseModel):
    """Model representing sources of threats in the system."""

    category: Annotated[str, Field(description="Actor Category")]
    description: Annotated[
        str,
        Field(
            description="One sentence describing their relevance to this architecture"
        ),
    ]
    example: Annotated[str, Field(description="Brief list of 1-2 specific actor types")]


class FlowsList(BaseModel):
    """Collection of data flows, trust boundaries, and threat sources."""

    data_flows: Annotated[List[DataFlow], Field(description="The list of data flows")]
    trust_boundaries: Annotated[
        List[TrustBoundary], Field(description="The list of trust boundaries")
    ]
    threat_sources: Annotated[
        List[ThreatSource], Field(description="The list of threat actors")
    ]


class Threat(BaseModel):
    """Model representing an identified security threat using the STRIDE methodology."""

    name: Annotated[
        str,
        Field(
            description="A concise, descriptive name for the threat that clearly identifies the security concern"
        ),
    ]
    stride_category: Annotated[
        Literal[*[category.value for category in StrideCategory]],
        Field(
            description=f"The STRIDE category classification: One of {', '.join([category.value for category in StrideCategory])}."
        ),
    ]
    description: Annotated[
        str,
        Field(
            description="Threat description which must follow threat grammar template format:"
            "[threat source] [prerequisites] can [threat action] which leads to [threat impact], negatively impacting [impacted assets]."
        ),
    ]
    target: Annotated[
        str,
        Field(
            description="The specific asset, component, system, or data element that could be compromised by this threat. It must be only one entity, multiple ones will result in rejecting the threat"
        ),
    ]
    impact: Annotated[
        str,
        Field(
            description="The potential business, technical, or operational consequences if this threat is successfully exploited. Consider confidentiality, integrity, and availability impacts"
        ),
    ]
    likelihood: Annotated[
        Literal["Low", "Medium", "High"],
        Field(
            description="The probability of threat occurrence based on factors like attacker motivation, capability, opportunity, and existing controls"
        ),
    ]
    mitigations: Annotated[
        List[str],
        Field(
            description="Specific security controls, countermeasures, or design changes that can prevent, detect, or reduce the impact of this threat",
            min_items=MITIGATION_MIN_ITEMS,
            max_items=MITIGATION_MAX_ITEMS,
        ),
    ]
    source: Annotated[
        str,
        Field(
            description="The threat actor or agent who could execute this threat. Must match with the category field in threat_source ",
        ),
    ]
    prerequisites: Annotated[
        List[str],
        Field(
            description="Required conditions, access levels, knowledge, or system states that must exist for this threat to be viable",
        ),
    ]
    vector: Annotated[
        str,
        Field(
            description="The attack vector or pathway through which the threat could be delivered or executed",
        ),
    ]
    starred: Annotated[
        bool,
        Field(
            description="User-defined flag for prioritization or tracking. Ignored by automated threat modeling agents",
        ),
    ] = False


class ThreatsList(BaseModel):
    """Collection of identified security threats."""

    threats: Annotated[List[Threat], Field(description="The list of threats")]

    def __add__(self, other: "ThreatsList") -> "ThreatsList":
        """Combine two ThreatsList instances, avoiding duplicates based on name."""
        existing_names = {threat.name for threat in self.threats}
        new_threats = [
            threat for threat in other.threats if threat.name not in existing_names
        ]
        combined_threats = self.threats + new_threats
        return ThreatsList(threats=combined_threats)

    def remove(self, threat_name: str) -> "ThreatsList":
        """Remove a threat by name and return a new ThreatsList instance."""
        filtered_threats = [
            threat for threat in self.threats if threat.name != threat_name
        ]
        return ThreatsList(threats=filtered_threats)


class AgentState(TypedDict):
    """Container for the internal state of the threat modeling agent."""

    summary: Optional[str] = None
    assets: Optional[AssetsList] = None
    image_data: Optional[str] = None
    system_architecture: Optional[FlowsList] = None
    description: Optional[str] = None
    assumptions: Optional[List[str]] = None
    improvement: Optional[str] = None
    next_step: Optional[str] = None
    threat_list: Annotated[ThreatsList, operator.add]
    job_id: Optional[str] = None
    retry: Optional[int] = 1
    iteration: Optional[int] = 0
    s3_location: Optional[str]
    title: Optional[str] = None
    owner: Optional[str] = None
    stop: Optional[bool] = False
    gap: Annotated[List[str], operator.add] = []
    replay: Optional[bool] = False
    instructions: Optional[str] = None
    traditional_acceptance_rates: Annotated[List[float], operator.add] = []


def _add_or_overwrite(left, right):
    """Reducer that adds deltas or replaces with Overwrite.

    Tools send deltas (+1, +2) for increments, or Overwrite(value) for resets.
    """
    from langgraph.types import Overwrite

    # If right is Overwrite, use its value (explicit replacement like reset to 0)
    if isinstance(right, Overwrite):
        return right.value
    # If left is Overwrite, use right
    if isinstance(left, Overwrite):
        return right
    # Otherwise add the delta
    return left + right


def _overwrite_or_last(left, right):
    """Reducer for boolean flags that respects Overwrite."""
    from langgraph.types import Overwrite

    if isinstance(right, Overwrite):
        return right.value
    if isinstance(left, Overwrite):
        return right
    return right


class ThreatState(MessagesState):
    """Container for the internal state of the subgraph."""

    threat_list: Annotated[ThreatsList, operator.add]
    tool_use: Annotated[int, _add_or_overwrite] = 0
    gap_tool_use: Annotated[int, _add_or_overwrite] = 0
    assets: Optional[AssetsList] = None
    image_data: Optional[str] = None
    system_architecture: Optional[FlowsList] = None
    description: Optional[str] = None
    assumptions: Optional[List[str]] = None
    gap: Annotated[List[str], operator.add] = []
    instructions: Optional[str] = None
    job_id: Optional[str] = None
    retry: Optional[int] = 1
    iteration: Optional[int] = 0
    replay: Optional[bool] = False
