from pydantic import BaseModel, Field, validator
from typing import Literal, List, Annotated
from enum import Enum


class StrideCategory(Enum):
    """STRIDE threat modeling categories for type-safe threat classification."""

    SPOOFING = "Spoofing"
    TAMPERING = "Tampering"
    REPUDIATION = "Repudiation"
    INFORMATION_DISCLOSURE = "Information Disclosure"
    DENIAL_OF_SERVICE = "Denial of Service"
    ELEVATION_OF_PRIVILEGE = "Elevation of Privilege"


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
            description=f"The STRIDE category classification: You have to choose only one value of {', '.join([category.value for category in StrideCategory])}."
        ),
    ]
    description: Annotated[
        str,
        Field(
            description="""A comprehensive description of the threat scenario, including how it could be executed and its potential consequences. 
            Must be between 35 and 50 words. Follow threat grammar: [Threat Actor] + [Action] + [Asset/Target] + [Negative Outcome]"""
        ),
    ]
    target: Annotated[
        str,
        Field(
            description="The specific asset, component, system, or data element that could be compromised by this threat"
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
            min_items=2,
            max_items=5,
        ),
    ]
    source: Annotated[
        str,
        Field(description="The threat actor or agent who could execute this threat"),
    ]
    prerequisites: Annotated[
        List[str],
        Field(
            description="Required conditions, access levels, knowledge, or system states that must exist for this threat to be viable"
        ),
    ]
    vector: Annotated[
        str,
        Field(
            description="The attack vector or pathway through which the threat could be delivered or executed"
        ),
    ]

    @validator("description", "impact", "vector", pre=True)
    def escape_special_chars(cls, v):
        if isinstance(v, str):
            # Replace problematic characters
            v = v.replace("\n", " ")
            v = v.replace("\r", " ")
            v = v.replace("\t", " ")
            # Remove or escape quotes within the content
            v = v.replace('"', '\\"')
            v = v.replace("'", "\\'")
        return v

    @validator("mitigations", "prerequisites", pre=True, each_item=True)
    def escape_list_items(cls, v):
        if isinstance(v, str):
            v = v.replace("\n", " ")
            v = v.replace("\r", " ")
            v = v.replace("\t", " ")
            v = v.replace('"', '\\"')
            v = v.replace("'", "\\'")
        return v
