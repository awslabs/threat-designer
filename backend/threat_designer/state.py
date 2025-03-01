from langchain_core.pydantic_v1 import BaseModel, Field
from typing import List, TypedDict, Annotated, Literal, Optional
import operator


class Assets(BaseModel):
    type: Annotated[
        Literal["Asset", "Entity"], Field(description="Type, one of Asset or Entity")
    ]
    name: Annotated[str, Field(description="The name of the asset")]
    description: Annotated[
        str, Field(description="The description of the asset or entity")
    ]


class AssetsList(BaseModel):
    assets: Annotated[List[Assets], Field(description="The list of assets")]


class DataFlow(BaseModel):
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
    purpose: Annotated[str, Field(description="The purpose of the trust boundary")]
    source_entity: Annotated[
        str, Field(description="The source entity/asset of the trust boundary")
    ]
    target_entity: Annotated[
        str, Field(description="The target entity/asset of the trust boundary")
    ]


class ContinueThreatModeling(BaseModel):
    """tool to share the gap analysis"""

    stop: Annotated[
        bool,
        Field(
            description="Should continue evaluation further threats or the catalog is comprehensive and complete."
        ),
    ]
    gap: Annotated[
        Optional[str],
        Field(
            description="An in depth gap analysis on how to improve the threat catalog. Required only when 'stop' is False"
        ),
    ] = ""


class ThreatSource(BaseModel):
    category: Annotated[str, Field(description="The category of the threat source")]
    description: Annotated[
        str, Field(description="The description of the threat source")
    ]
    example: Annotated[str, Field(description="An example of the threat source")]


class FlowsList(BaseModel):
    data_flows: Annotated[List[DataFlow], Field(description="The list of data flows")]
    trust_boundaries: Annotated[
        List[TrustBoundary], Field(description="The list of trust boundaries")
    ]
    threat_sources: Annotated[
        List[ThreatSource], Field(description="The list of threat sources")
    ]


class Threat(BaseModel):
    name: Annotated[str, Field(description="The name of the threat")]
    stride_category: Annotated[
        str,
        Field(
            description="The STRIDE category of the threat: One of the following: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege"
        ),
    ]
    description: Annotated[
        str,
        Field(
            description="The exhaustive description of the threat. From 35 to 50 words. Follow threat grammar structure."
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
    threats: Annotated[List[Threat], Field(description="The list of threats")]

    def __add__(self, other: "ThreatsList") -> "ThreatsList":
        combined_threats = self.threats + other.threats
        return ThreatsList(threats=combined_threats)


class AgentState(TypedDict):
    assets: Optional[AssetsList] = None
    image_data: Optional[str] = None
    system_architecture: Optional[FlowsList] = None
    description: Optional[str] = None
    assumptions: Optional[List[str]] = None
    improvement: Optional[str] = None
    next_step: Optional[str] = None
    threat_list: Annotated[ThreatsList, operator.add]
    job_id: Optional[str] = None
    retry: Optional[int] = 0
    iteration: Optional[int] = 1
    s3_location: Optional[str]
    title: Optional[str] = None
    owner: Optional[str] = None
    stop: Optional[bool] = False
    prev_gap: Optional[str] = ""
    replay: Optional[bool] = False
