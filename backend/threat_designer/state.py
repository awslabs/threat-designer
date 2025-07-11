"""Module containing state classes and data models for the threat designer application."""

import operator
from datetime import datetime
from typing import Annotated, List, Literal, Optional, TypedDict

from constants import (MITIGATION_MAX_ITEMS, MITIGATION_MIN_ITEMS,
                       SUMMARY_MAX_WORDS_DEFAULT, THREAT_DESCRIPTION_MAX_WORDS,
                       THREAT_DESCRIPTION_MIN_WORDS, AssetType, StrideCategory)
from langchain_aws import ChatBedrockConverse
from pydantic import BaseModel, Field


class ConfigSchema(TypedDict):
    """Configuration schema for the workflow."""

    model_main: ChatBedrockConverse
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
            description="Should continue evaluation further threats or the catalog is comprehensive"
            " and complete."
        ),
    ]
    gap: Annotated[
        Optional[str],
        Field(
            description="An in depth gap analysis on how to improve the threat catalog."
            " Required only when 'stop' is False"
        ),
    ] = ""


class ThreatSource(BaseModel):
    """Model representing sources of threats in the system."""

    category: Annotated[str, Field(description="The category of the threat source")]
    description: Annotated[
        str, Field(description="The description of the threat source")
    ]
    example: Annotated[str, Field(description="An example of the threat source")]


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
    """Model representing an identified security threat."""

    name: Annotated[str, Field(description="The name of the threat")]
    stride_category: Annotated[
        str,
        Field(
            description=f"The STRIDE category of the threat: One of the following: "
            f"{', '.join([category.value for category in StrideCategory])}"
        ),
    ]
    description: Annotated[
        str,
        Field(
            description=f"The exhaustive description of the threat. From {THREAT_DESCRIPTION_MIN_WORDS} "
            f"to {THREAT_DESCRIPTION_MAX_WORDS} words. Follow threat grammar structure."
        ),
    ]
    target: Annotated[str, Field(description="The target of the threat")]
    impact: Annotated[str, Field(description="The impact of the threat")]
    likelihood: Annotated[str, Field(description="The likelihood of the threat")]
    mitigations: Annotated[
        List[str],
        Field(
            description="The list of mitigations for the threat",
            min_items=MITIGATION_MIN_ITEMS,
            max_items=MITIGATION_MAX_ITEMS,
        ),
    ]


class ThreatsList(BaseModel):
    """Collection of identified security threats."""

    threats: Annotated[List[Threat], Field(description="The list of threats")]

    def __add__(self, other: "ThreatsList") -> "ThreatsList":
        """Combine two ThreatsList instances."""
        combined_threats = self.threats + other.threats
        return ThreatsList(threats=combined_threats)


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
    iteration: Optional[int] = 1
    s3_location: Optional[str]
    title: Optional[str] = None
    owner: Optional[str] = None
    stop: Optional[bool] = False
    gap: Annotated[List[str], operator.add] = []
    replay: Optional[bool] = False
