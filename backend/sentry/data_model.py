from pydantic import BaseModel, Field
from typing import Literal, List


class Threat(BaseModel):
    likelihood: Literal["Low", "Medium", "High"] = Field(
        ..., description="The likelihood impact from the threat"
    )
    impact: str = Field(
        ..., description="The impact that could be caused by exploiting the threat"
    )
    name: str = Field(..., description="Title of the threat")
    stride_category: Literal[
        "Spoofing",
        "Tampering",
        "Repudiation",
        "Information Disclosure",
        "Denial of Service",
        "Elevation of Privilege",
    ] = Field(..., description="The STRIDE category this threat falls under")
    description: str = Field(
        ..., description="Detailed description of how the threat could be exploited"
    )
    mitigations: List[str] = Field(
        ...,
        min_items=2,
        max_items=5,
        description="List of mitigation strategies to address this threat (2-5 items)",
    )
    target: str = Field(
        ..., description="The target system or component affected by this threat"
    )
