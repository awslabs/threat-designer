"""Module containing data models for the threat designer application."""

from typing import Annotated, List, Literal, Optional, TypedDict
from pydantic import BaseModel, Field


class SummaryState(BaseModel):
    """Model representing the summary of a threat catalog."""

    summary: Annotated[
        str, Field(description="A short headline summary of max 40 words")
    ]


class Assets(BaseModel):
    """Model representing system assets or entities in threat modeling."""

    type: Annotated[
        Literal["Asset", "Entity"], Field(description="Type, one of Asset or Entity")
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
            description="The STRIDE category of the threat: One of the following: Spoofing, "
            "Tampering, Repudiation, Information Disclosure, Denial of Service, "
            "Elevation of Privilege"
        ),
    ]
    description: Annotated[
        str,
        Field(
            description="The exhaustive description of the threat. From 35 to 50 words. "
            "Follow threat grammar structure."
        ),
    ]
    target: Annotated[str, Field(description="The target of the threat")]
    impact: Annotated[str, Field(description="The impact of the threat")]
    likelihood: Annotated[str, Field(description="The likelihood of the threat")]
    mitigations: Annotated[
        List[str],
        Field(
            description="The list of mitigations for the threat",
            min_items=2,
            max_items=5,
        ),
    ]


class ThreatsList(BaseModel):
    """Collection of identified security threats."""

    threats: Annotated[List[Threat], Field(description="The list of threats")]


class ThreatModel(TypedDict):
    """Threat model data modeling"""

    summary: Optional[str] = None
    assets: Optional[AssetsList] = None
    system_architecture: Optional[FlowsList] = None
    description: Optional[str] = None
    assumptions: Optional[List[str]] = None
    threat_list: List[ThreatsList]
    title: Optional[str] = None


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
        description="Business context and additional details that might not be obvious from the architecture diagram alone."
    )
    assumptions: List[str] = Field(
        default=[],
        description="Establish the baseline security context and boundaries that help identify what's in scope for analysis and what potential threats are relevant to consider."
    )
    title: str = Field(
        default="",
        description="The title of the threat model."
    )