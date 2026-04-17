"""Threat modeling pipeline using langchain-task-steering middleware.

Uses create_agent + TaskSteeringMiddleware to drive a 6-task pipeline:
  summary -> assets -> data_flows -> trust_boundaries -> threat_sources -> threats

Each task has scoped tools, completion validation, and prompt injection via the
middleware. The agent sees a status board and active-task instruction before every
model call, and can only use the tools belonging to the current task.
"""

import base64
import functools
import json
import mimetypes
import threading
import warnings
from collections import Counter
from datetime import datetime
from typing import Annotated, Any, Literal

# Suppress langchain_aws structured output warning when thinking is enabled
warnings.filterwarnings(
    "ignore", message="ChatBedrockConverse structured output relies on forced"
)

from langchain.agents import AgentState, create_agent
from langchain.tools import tool, ToolRuntime
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langgraph.types import Command
from pydantic import Field, create_model
from typing_extensions import NotRequired
from langchain_aws.middleware import BedrockPromptCachingMiddleware

from langchain_task_steering import Task, TaskMiddleware, TaskSteeringMiddleware

from ._shared import Strict, UsageTracker, image_url_block
from .caffeinate import prevent_sleep
from .model_factory import BuiltModel, build_chat_model


# ============================================================================
# Constants
# ============================================================================

STRIDE_CATEGORIES = (
    "Spoofing",
    "Tampering",
    "Repudiation",
    "Information Disclosure",
    "Denial of Service",
    "Elevation of Privilege",
)

TASK_LABELS = {
    "summary": "Summarizing architecture",
    "assets": "Identifying assets",
    "data_flows": "Analyzing data flows",
    "trust_boundaries": "Mapping trust boundaries",
    "threat_sources": "Identifying threat sources",
    "threats": "Generating threats",
}

APPLICATION_TYPE_DESCRIPTIONS = {
    "internal": (
        "This is an INTERNAL application, accessible only within a private network or organization. "
        "It has controlled access and reduced external threat exposure. Calibrate likelihood ratings "
        "and threat prioritization accordingly — external attack vectors are less likely, but insider "
        "threats and misconfigurations remain relevant."
    ),
    "public_facing": (
        "This is a PUBLIC-FACING application, accessible from the internet by anonymous or "
        "unauthenticated users. It is subject to constant automated attacks and broad threat actor "
        "exposure. Calibrate likelihood ratings and threat prioritization accordingly — internet-facing "
        "components should generally receive High likelihood for common attack vectors."
    ),
    "hybrid": (
        "This is a HYBRID application with both internal and external-facing components. "
        "Calibrate threat analysis for each exposure boundary — public-facing components should be "
        "treated with the same rigor as a fully public application, while internal components can "
        "reflect their reduced exposure."
    ),
}


def _get_application_type_context(application_type: str = "hybrid") -> str:
    """Return an XML-wrapped application type context block for injection into prompts."""
    description = APPLICATION_TYPE_DESCRIPTIONS.get(
        application_type, APPLICATION_TYPE_DESCRIPTIONS["hybrid"]
    )
    return f"\n<application_type>\nApplication Type: {application_type}\n{description}\n</application_type>\n"


MAX_ADD_THREATS_USES = 5
MAX_GAP_ANALYSIS_USES = 5
MIN_GAP_THRESHOLD = 25


# ============================================================================
# Pydantic Models (tool input schemas)
# ============================================================================

StrideLiteral = Literal[
    "Spoofing",
    "Tampering",
    "Repudiation",
    "Information Disclosure",
    "Denial of Service",
    "Elevation of Privilege",
]


class Asset(Strict):
    type: Literal["Asset", "Entity"] = Field(description="Asset or Entity")
    name: str = Field(description="Name of the asset or entity")
    description: str = Field(description="Description of the asset or entity")
    criticality: Literal["Low", "Medium", "High"] = Field(
        default="Medium", description="Criticality level"
    )


class AssetsList(Strict):
    assets: list[Asset] = Field(description="List of assets and entities")


class DataFlow(Strict):
    flow_description: str = Field(description="Description of the data flow")
    source_entity: str = Field(description="Source asset/entity name")
    target_entity: str = Field(description="Target asset/entity name")


class DataFlowsList(Strict):
    data_flows: list[DataFlow] = Field(description="List of data flows")


class TrustBoundary(Strict):
    purpose: str = Field(description="Purpose of the trust boundary")
    source_entity: str = Field(description="Source asset/entity name")
    target_entity: str = Field(description="Target asset/entity name")


class TrustBoundariesList(Strict):
    trust_boundaries: list[TrustBoundary] = Field(
        description="List of trust boundaries"
    )


class ThreatSource(Strict):
    category: str = Field(description="Actor category")
    description: str = Field(description="Relevance to this architecture")
    example: str = Field(description="1-2 specific actor types")


class ThreatSourcesList(Strict):
    threat_sources: list[ThreatSource] = Field(description="List of threat sources")


class Threat(Strict):
    name: str = Field(description="Concise, descriptive threat name")
    stride_category: StrideLiteral = Field(description="STRIDE classification")
    description: str = Field(
        description=(
            "Threat description following: [source] [prerequisites] can [action] "
            "which leads to [impact], negatively impacting [assets]."
        )
    )
    target: str = Field(
        description="Target asset name (must match an identified asset)"
    )
    impact: str = Field(description="Business/technical impact if exploited")
    likelihood: Literal["Low", "Medium", "High"] = Field(
        description="Probability of occurrence"
    )
    mitigations: list[str] = Field(
        description="2-5 security controls or countermeasures",
        min_length=2,
        max_length=5,
    )
    source: str = Field(
        description="Threat actor category (must match a threat source)"
    )
    prerequisites: list[str] = Field(description="Required conditions for the threat")
    vector: str = Field(description="Attack vector or pathway")


class ThreatsList(Strict):
    threats: list[Threat] = Field(description="List of threats to add")


class GapFinding(Strict):
    target: str = Field(
        description="Asset or component name where the gap exists (must match an asset name)"
    )
    stride_category: StrideLiteral = Field(
        description="STRIDE category that is missing or underrepresented"
    )
    severity: Literal["CRITICAL", "MAJOR", "MINOR"] = Field(
        description=(
            "CRITICAL = no coverage for high-criticality asset/category, "
            "MAJOR = weak coverage, MINOR = calibration or quality issue"
        )
    )
    description: str = Field(
        description="Actionable description of what is missing and why it matters (max 40 words)"
    )


class GapAnalysisResult(Strict):
    stop: bool = Field(
        description="True if catalog is comprehensive and production-ready, False if gaps remain"
    )
    gaps: list[GapFinding] = Field(
        description="Specific gaps, each tied to a target asset and STRIDE category (empty list when stop=True)",
    )
    rating: int = Field(
        description="Overall quality rating 1-10 (10 = comprehensive, 1 = significant gaps)",
        ge=1,
        le=10,
    )


# ============================================================================
# Dynamic Tool Schema (constrained target/source enums)
# ============================================================================


@functools.lru_cache(maxsize=16)
def _create_constrained_threat_model(
    asset_names: frozenset[str],
    source_categories: frozenset[str],
):
    """Build dynamic Pydantic models with Literal enums for target/source.

    The LLM sees the exact valid values in the tool schema, preventing
    mismatches that waste round-trips.  Cached so identical frozensets
    reuse the same classes.
    """
    field_overrides: dict = {}

    if asset_names:
        target_literal = Literal[tuple(sorted(asset_names))]
        field_overrides["target"] = (
            Annotated[
                target_literal,
                Field(
                    description="The specific asset that could be compromised. "
                    "Must exactly match one of the allowed values."
                ),
            ],
            ...,
        )

    if source_categories:
        source_literal = Literal[tuple(sorted(source_categories))]
        field_overrides["source"] = (
            Annotated[
                source_literal,
                Field(
                    description="The threat actor category. "
                    "Must exactly match one of the allowed values."
                ),
            ],
            ...,
        )

    DynamicThreat = create_model("Threat", __base__=Threat, **field_overrides)
    DynamicThreatsList = create_model(
        "ThreatsList",
        __base__=ThreatsList,
        threats=(
            Annotated[
                list[DynamicThreat],
                Field(description="List of threats to add"),
            ],
            ...,
        ),
    )

    return DynamicThreat, DynamicThreatsList


def _create_dynamic_add_threats_tool(threats_list_model):
    """Create an add_threats tool whose schema carries the constrained enums.

    Only used in wrap_model_call to guide the LLM — actual execution still
    dispatches to the registered (unconstrained) add_threats tool.
    """

    @tool(
        name_or_callable="add_threats",
        description="Add threats to the catalog. Validates target/source references and deduplicates.",
    )
    def dynamic_add_threats(
        threats: threats_list_model, runtime: ToolRuntime
    ) -> Command:
        return _handle_add_threats(threats, runtime)

    return dynamic_add_threats


# ============================================================================
# Pipeline State
# ============================================================================


class PipelineState(AgentState):
    """Extended agent state with fields for the full threat-modeling pipeline.

    Assigned as `state_schema` on the first task middleware so that
    `TaskSteeringMiddleware._merge_state_schemas` picks it up.
    """

    summary: NotRequired[str]
    assets: NotRequired[list]
    data_flows: NotRequired[list]
    trust_boundaries: NotRequired[list]
    threat_sources: NotRequired[list]
    threats: NotRequired[list]
    add_threats_count: NotRequired[int]
    gap_analysis_count: NotRequired[int]
    # Input context — set once at invocation time
    image_data: NotRequired[str]
    image_type: NotRequired[str]
    description: NotRequired[str]
    assumptions: NotRequired[list]
    application_type: NotRequired[str]
    gap_analysis_enabled: NotRequired[bool]


# ============================================================================
# Prompt Placeholders
# ============================================================================


"""
Threat Modeling Prompt Generation Module (Pipeline Agent)

System prompt is always present. Task-specific instructions are injected
based on the current pipeline step.

Target model: Claude Opus / Sonnet 4.x
"""


def system_prompt(application_type: str = "hybrid") -> str:
    """Main system prompt for the threat modeling agent — always present."""
    app_type_context = _get_application_type_context(application_type)
    return f"""\
<role>
You are an expert security architect performing STRIDE-based threat modeling. \
You work through an ordered task pipeline — complete each task fully using the \
available tools before moving to the next. Analyze the provided architecture \
diagram, system description, and assumptions thoroughly at each stage. Be \
precise, actionable, and comprehensive.
</role>

<quality_standards>
These standards apply across all tasks. Internalize them — individual task \
instructions will not repeat them.

<assumptions>
Assumptions stated in the architecture are guardrails, not attack surface. If \
the architecture states "all inter-service communication uses mTLS," do not \
generate eavesdropping threats assuming plaintext. Threats against the controls \
upholding an assumption are valid (e.g., compromising the mTLS CA); \
contradicting the assumption is a hallucination.
</assumptions>

<calibration>
Likelihood: Internet-facing components (public APIs, web UIs, unauthenticated \
endpoints) default to High — they face constant automated attack. Score lower \
only with a concrete architectural reason (e.g., WAF with strict rate limiting).

Impact: Components storing PII, financial data, or credentials default to High \
or Critical for tampering and information disclosure threats. Downgrade only \
when the architecture describes a control that materially reduces blast radius.

When the architecture specifies an application type (internal, public-facing, \
or hybrid), calibrate accordingly: internal systems have reduced external \
exposure but insider threats and misconfigurations remain relevant; public-facing \
systems are subject to constant automated attacks; hybrid systems require \
per-boundary calibration.
</calibration>

<specificity>
Target: Every target names a single, specific component exactly as it appears \
in the architecture. "Orders API" is valid. "Database and API" is not.

Description format: "[source], [prerequisites], can [attack vector], which \
leads to [impact], negatively impacting [target]." Values must match the \
corresponding structured fields.

Mitigations: Name specific, implementable controls. "Use parameterized queries \
for all database calls in the Orders API" is valid. "Follow security best \
practices" is not.
</specificity>

<attack_chains>
Real-world attacks are multi-step. When one threat enables another, reference \
the enabling threat by name in the dependent threat's prerequisites field. \
Actively look for chains across trust boundaries — credential theft enabling \
lateral movement, privilege escalation enabling data exfiltration, information \
disclosure enabling targeted attacks.
</attack_chains>

<shared_responsibility>
Scope threats to what the customer controls. IaaS: OS patching, network config, \
app security. Managed services: configuration, access control, encryption, \
backups. Serverless: function permissions, event-source config, data handling. \
Always include customer misconfigurations (public buckets, permissive IAM, \
unrotated credentials). Exclude provider-side infrastructure, hypervisor, and \
platform patching. Exclude provider-side actors (cloud provider employees, \
SaaS/PaaS platform staff, hosting personnel).
</shared_responsibility>
</quality_standards>

<asset_criticality>
Assets and entities have a criticality level that reflects their risk profile:

For Assets (data stores, APIs, keys, configs, logs) — based on data sensitivity \
and business impact:
- High: Handles sensitive, regulated, or business-critical data such as PII, \
financial records, authentication credentials, encryption keys, or data subject \
to regulatory frameworks (e.g., GDPR, HIPAA, PCI-DSS). Compromise causes \
severe business impact. Requires comprehensive, layered controls.
- Medium: Handles internal or moderately sensitive data whose compromise would \
cause noticeable but contained business impact (e.g., internal APIs, application \
logs with limited sensitive content, non-public configuration). Requires \
standard security controls.
- Low: Handles non-sensitive operational data with minimal business impact if \
compromised (e.g., system telemetry, public documentation, non-critical \
caches). Requires baseline security controls.

For Entities (users, roles, external systems, services) — based on privilege \
level, trust scope, and blast radius:
- High: Elevated privilege, broad trust scope, or crosses a critical trust \
boundary. Compromise could lead to widespread unauthorized access, lateral \
movement, or full system takeover (e.g., admin user, CI/CD pipeline service \
account, external payment gateway with write access).
- Medium: Moderate access or privilege within the system. Compromise could \
affect multiple components or expose internal functionality (e.g., standard \
application user, internal microservice with cross-service access).
- Low: Limited access scope with minimal privilege. Compromise has narrow \
blast radius and low impact on other components (e.g., read-only monitoring \
service, public-facing anonymous user).

When you cannot confidently determine criticality, default to Medium.
</asset_criticality>

{app_type_context}"""


def summary_instruction() -> str:
    """Instruction injected when the summary task is active."""
    return """\
<instruction>
Analyze the architecture diagram, system description, and assumptions. \
Produce a concise headline summary of maximum 40 words that captures the \
system's purpose, key components, and technology stack.

Save the summary using the save_summary tool.
</instruction>"""


def assets_instruction() -> str:
    """Instruction injected when the assets task is active."""
    return """\
<instruction>
Review the architecture diagram, system description, and assumptions together, \
then identify all assets and entities.

Identify critical assets: sensitive data stores, databases, secrets, encryption \
keys, communication channels, APIs, authentication tokens, configuration files, \
logs, and any component whose compromise would impact confidentiality, integrity, \
or availability.

Identify key entities: users, roles, external systems, internal services, \
third-party integrations, and any actor that interacts with or operates within \
the system.

For each item, classify it as either "Asset" or "Entity," give it a clear \
and specific name, and write a one-to-two sentence description explaining what \
it is and why it matters to the system's security posture. Assign a criticality \
level (Low, Medium, or High) using the asset criticality criteria defined in \
your standards.

Save the complete inventory using the save_assets tool.
</instruction>"""


def data_flows_instruction() -> str:
    """Instruction injected when the data_flows task is active."""
    return """\
<instruction>
Map all significant data flows between the assets and entities you identified \
in the previous step. Cover internal, external, and bidirectional flows where \
both directions carry security relevance.

Prioritize flows involving sensitive data, credentials, or business-critical \
information. Include secondary flows (logging, backups, monitoring) when they \
carry security-relevant data. Focus on operational and deployment-phase flows; \
include maintenance or disaster-recovery paths only when explicitly mentioned \
in the description or assumptions.

<entity_validation>
source_entity and target_entity in every data flow must exactly match names \
from the asset and entity inventory. Invalid names are rejected, but valid \
items in the same call still succeed. If you get validation errors, correct \
the names and retry.
</entity_validation>

Use add_data_flows to save flows in batches. After each batch, call flows_stats \
to verify your progress and identify gaps. Use delete_data_flows only for \
surgical corrections — not bulk rebuilds.
</instruction>"""


def trust_boundaries_instruction() -> str:
    """Instruction injected when the trust_boundaries task is active."""
    return """\
<instruction>
Identify trust boundaries — transitions where trust levels change between \
components. Examine these dimensions:

- Network boundaries: internal vs. external, DMZ transitions
- Process boundaries: different services or execution contexts
- Physical boundaries: on-premises vs. cloud
- Organizational boundaries: internal vs. third-party systems
- Administrative boundaries: different privilege levels

<entity_validation>
source_entity and target_entity in every trust boundary must exactly match \
names from the asset and entity inventory. Invalid names are rejected, but \
valid items in the same call still succeed. If you get validation errors, \
correct the names and retry.
</entity_validation>

Use add_trust_boundaries to save boundaries in batches. Each boundary must \
specify its type and the security controls enforced at the transition point. \
After each batch, call flows_stats to verify completeness. Use \
delete_trust_boundaries only for surgical corrections.
</instruction>"""


def threat_sources_instruction() -> str:
    """Instruction injected when the threat_sources task is active."""
    return """\
<instruction>
Identify 4 to 7 realistic threat source categories for this architecture. \
Select from these categories, omitting any that are irrelevant to the system:

- Legitimate Users — unintentional threats from authorized users
- Malicious Internal Actors — insiders with privileged access
- External Threat Actors — attackers targeting exposed services
- Untrusted Data Suppliers — third-party data sources or integrations
- Unauthorized External Users — actors without credentials
- Compromised Accounts or Components — legitimate credentials used maliciously

For each selected threat source, provide a description of its relevance to \
this specific architecture and one to two example actor types.

Exclude provider-side actors (cloud provider employees, SaaS/PaaS platform \
staff, hosting personnel) — these fall outside customer responsibility.

Use add_threat_sources to save your selections. After saving, call flows_stats \
to confirm they are registered.
</instruction>"""


def threats_instruction() -> str:
    """Instruction injected when the threats task is active."""
    return f"""\
<instruction>
Build a comprehensive STRIDE threat catalog for the architecture. Every threat \
must trace to a real component and a real threat source from the architecture \
inputs.

<tools>
add_threats — batch multiple threats per call. Fields: target, source, \
stride_category, description, prerequisites, attack_vector, \
impact_description, likelihood, impact, mitigations. Exact value matching: \
target and source fields must exactly match the enum values from the \
add_threats tool schema. Copy them verbatim — mismatches are rejected.

delete_threats — remove threats by ID. When correcting a threat, add the \
replacement before deleting the original to avoid coverage gaps.

gap_analysis — evaluates catalog against architecture for compliance, \
coverage, and calibration gaps. Returns STOP or CONTINUE with specific \
findings.

catalog_stats — check current STRIDE distribution and asset coverage.

read_threat_catalog — review current catalog contents.
</tools>

<workflow>
Work in a generate, audit, fix cycle.

Start with the highest-risk surface. Generate your first batch of 10 to 15 \
threats using add_threats. Maximize each batch — larger batches mean fewer \
round-trips. Expand across remaining assets and all six STRIDE categories \
through additional batched add_threats calls.

Ensure every STRIDE category is represented: Spoofing, Tampering, Repudiation, \
Information Disclosure, Denial of Service, and Elevation of Privilege. If a \
category has genuinely no applicable threats for this architecture, verify this \
is truly the case rather than an oversight.

After accumulating approximately 25 threats, call gap_analysis to evaluate \
coverage. Weigh its findings against your own assessment — address genuine \
gaps, use judgment on marginal ones. If gap_analysis repeatedly flags something \
you have already evaluated and rejected, note your reasoning and move on.

You can call add_threats up to {MAX_ADD_THREATS_USES} times before \
gap_analysis is required. Calling gap_analysis resets the add counter. \
Maximum {MAX_GAP_ANALYSIS_USES} gap_analysis calls per session.

When the catalog has solid STRIDE coverage across all assets, trust boundaries, \
and data flows — or gap_analysis returns no critical or high findings — output \
"THREAT_CATALOG_COMPLETE" as your final message.
</workflow>

<coverage_expectations>
When analysis groups are provided, work through them in order — generate \
threats for the first group, then the next, building up the catalog \
incrementally. After covering all groups, run gap_analysis for cross-cutting \
coverage.

When an existing threat catalog is provided, you are generating additional \
threats to fill identified gaps. Do not duplicate threats already in the \
catalog.

When gap analysis instructions are provided, prioritize generating threats \
for those identified gaps first. After addressing the gaps, continue with \
any additional threats you identify.

Commit to calibration decisions. Revisit likelihood and impact only when \
gap_analysis explicitly flags them.
</coverage_expectations>
</instruction>"""


def threats_iter_instruction() -> str:
    """Instruction for the threats task when using iteration mode (no gap_analysis)."""
    return """\
<instruction>
Build a comprehensive STRIDE threat catalog for the architecture. Every threat \
must trace to a real component and a real threat source from the architecture \
inputs.

<tools>
add_threats — batch multiple threats per call. Fields: target, source, \
stride_category, description, prerequisites, attack_vector, \
impact_description, likelihood, impact, mitigations. Exact value matching: \
target and source fields must exactly match the enum values from the \
add_threats tool schema. Copy them verbatim — mismatches are rejected.

remove_threat — remove threats by name. When correcting a threat, add the \
replacement before removing the original to avoid coverage gaps.

catalog_stats — check current STRIDE distribution and asset coverage.

read_threat_catalog — review current catalog contents.
</tools>

<workflow>
Start with the highest-risk surface. Generate your first batch of 10 to 15 \
threats using add_threats. Maximize each batch — larger batches mean fewer \
round-trips. Expand across remaining assets and all six STRIDE categories \
through additional batched add_threats calls.

Ensure every STRIDE category is represented: Spoofing, Tampering, Repudiation, \
Information Disclosure, Denial of Service, and Elevation of Privilege. If a \
category has genuinely no applicable threats for this architecture, verify this \
is truly the case rather than an oversight.

Use catalog_stats to monitor STRIDE distribution and identify coverage gaps. \
Continue adding threats until all assets and STRIDE categories have reasonable \
coverage.

When the catalog has solid STRIDE coverage across all assets, trust boundaries, \
and data flows, complete the task. A subsequent improvement pass will review \
and strengthen the catalog.
</workflow>

<coverage_expectations>
When an existing threat catalog is provided, you are generating additional \
threats to fill identified gaps. Do not duplicate threats already in the \
catalog.

Commit to calibration decisions. Revisit likelihood and impact only if you \
identify a clear error.
</coverage_expectations>
</instruction>"""


def _improvement_nudge() -> str:
    """Nudge message returned by validate_completion to trigger an improvement pass."""
    return (
        "The catalog needs further review before completing. "
        "Call read_threat_catalog and catalog_stats to audit the current state, "
        "then focus on:\n"
        "- Missing STRIDE categories or underrepresented areas\n"
        "- Assets with no threat coverage\n"
        "- Weak or generic descriptions that need specificity\n"
        "- Missing attack chains across trust boundaries\n"
        "- Miscalibrated likelihood or impact ratings\n"
        "- Threats that contradict stated assumptions (remove these)\n\n"
        "Add threats to fill gaps, remove low-quality or duplicate threats. "
        "When satisfied, complete the task."
    )


def gap_analysis_system_prompt(application_type: str = "hybrid") -> str:
    """System prompt context for gap analysis evaluation."""
    app_type_context = _get_application_type_context(application_type)
    return f"""\
<role>
You audit threat catalogs against a specific architecture and decide STOP \
(catalog is production-ready) or CONTINUE (gaps remain). A CONTINUE decision \
sends the generating agent back, so your findings must be specific enough to \
act on.
</role>

<inputs>
Architecture description — system design, components, data flows, and \
assumptions. Assumptions define what the architecture takes as given and are \
not attack surface. A threat contradicting a stated assumption is a compliance \
violation. Threats targeting the controls upholding an assumption (e.g., \
compromising the CA behind mTLS) are legitimate.

Threat catalog KPIs — STRIDE distribution, counts, likelihood ratings.

Current threat catalog — the threats to review.
</inputs>

<analysis_areas>
Evaluate three areas. A meaningful failure in any area means CONTINUE.

Compliance:
Hallucinated components — threats referencing services, data flows, or \
infrastructure absent from the architecture. Assumption breaches — threats \
contradicting stated trust boundaries or deployment constraints. A single \
hallucinated component indicates an incorrect model of the system.

Coverage:
Logic flaws (race conditions, state inconsistencies, quota bypasses) plausible \
for the design. Incomplete attack chains where a threat assumes an \
unestablished precondition. Technology-specific vulnerabilities tied to the \
described languages, frameworks, or services. Underrepresented STRIDE \
categories relative to what the design exposes — e.g., an API-heavy system \
with few spoofing or repudiation threats. Judge what is actually missing \
versus reasonably out of scope.

Calibration:
Severity distribution must be proportionate to real-world exposure. A public-\
facing system handling PII or financial data should have meaningful high-\
likelihood, high-impact threats. A low-criticality internal tool with mostly \
medium and low findings may be perfectly calibrated. Test: would an experienced \
security engineer trust this distribution, or flag it as underscoped?
</analysis_areas>

<decision_criteria>
STOP: Zero compliance violations, reasonable STRIDE coverage across critical \
components, severity distribution proportionate to exposure.

CONTINUE: Compliance violations exist, concrete attack vectors are missing, or \
severity does not match system criticality. Priority actions must be specific \
and actionable.

Default to CONTINUE. The burden of proof is on STOP, not CONTINUE. Before \
issuing STOP, spend one reasoning step arguing for CONTINUE: name the 2–3 \
most significant threats that are absent or underrepresented, then explain \
why each is genuinely out of scope or already covered. Only if you can make \
that case convincingly may you issue STOP. Calibration quibbles alone do not \
justify CONTINUE — they affect the rating, not the decision.
</decision_criteria>
<output_format>
Think through your analysis fully, then populate the tool schema fields:

stop: true if catalog is production-ready, false if gaps remain.

gaps: list of specific gap findings (only when stop is false). Each gap must \
have:
  - target: exact asset name from the architecture
  - stride_category: the STRIDE category that is missing or weak
  - severity: CRITICAL (no coverage on high-criticality asset), MAJOR (weak \
coverage), or MINOR (calibration or quality issue)
  - description: imperative, actionable, max 40 words — what is missing and \
why it matters

rating: 1 to 10 quality score for the catalog.

Focus gaps on the highest-value findings. Do not list more than 10 gaps. \
Every gap must reference a real asset from the architecture and a specific \
STRIDE category — no generic "improve coverage" findings.

Attack chains: when you identify that a threat assumes an unestablished \
precondition (e.g., "attacker has DB credentials" but no credential-theft \
threat exists), flag the missing precondition threat as a gap.
</output_format>
{app_type_context}"""


# ============================================================================
# Summary Tools
# ============================================================================


@tool
def save_summary(
    summary: Annotated[str, "Architecture summary (max 40 words)"],
    runtime: ToolRuntime,
) -> Command:
    """Save the architecture summary."""
    return Command(
        update={
            "summary": summary,
            "messages": [
                ToolMessage(
                    content=f"Summary saved: {summary}",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


# ============================================================================
# Assets Tools
# ============================================================================


@tool
def save_assets(assets: AssetsList, runtime: ToolRuntime) -> Command:
    """Save the identified assets and entities."""
    assets_data = [a.model_dump() for a in assets.assets]
    return Command(
        update={
            "assets": assets_data,
            "messages": [
                ToolMessage(
                    content=f"Saved {len(assets_data)} assets/entities.",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


# ============================================================================
# Data Flows Tools
# ============================================================================


@tool
def add_data_flows(data_flows: DataFlowsList, runtime: ToolRuntime) -> Command:
    """Add data flows between assets. Source and target must match known asset names."""
    existing = list(runtime.state.get("data_flows") or [])
    assets = runtime.state.get("assets") or []
    asset_names = {a["name"] for a in assets}

    valid, invalid_msgs = [], []
    for flow in data_flows.data_flows:
        violations = []
        if asset_names and flow.source_entity not in asset_names:
            violations.append(f"Unknown source_entity '{flow.source_entity}'")
        if asset_names and flow.target_entity not in asset_names:
            violations.append(f"Unknown target_entity '{flow.target_entity}'")
        if violations:
            invalid_msgs.append(f"  - {flow.flow_description}: {'; '.join(violations)}")
        else:
            valid.append(flow.model_dump())

    updated = existing + valid
    msg = f"Added {len(valid)} data flows (total: {len(updated)})."
    if invalid_msgs:
        msg += f"\n{len(invalid_msgs)} rejected:\n" + "\n".join(invalid_msgs)
        if asset_names:
            msg += f"\nValid asset names: {sorted(asset_names)}"

    return Command(
        update={
            "data_flows": updated,
            "messages": [ToolMessage(content=msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool
def delete_data_flows(
    descriptions: Annotated[list[str], "Flow descriptions to delete"],
    runtime: ToolRuntime,
) -> Command:
    """Delete data flows by their flow_description."""
    existing = list(runtime.state.get("data_flows") or [])
    to_remove = set(descriptions)
    remaining = [f for f in existing if f["flow_description"] not in to_remove]
    deleted = len(existing) - len(remaining)
    not_found = sorted(to_remove - {f["flow_description"] for f in existing})

    msg = f"Deleted {deleted} data flows. Remaining: {len(remaining)}."
    if not_found:
        msg += f"\nNot found: {not_found}"

    return Command(
        update={
            "data_flows": remaining,
            "messages": [ToolMessage(content=msg, tool_call_id=runtime.tool_call_id)],
        }
    )


# ============================================================================
# Trust Boundaries Tools
# ============================================================================


@tool
def add_trust_boundaries(
    trust_boundaries: TrustBoundariesList, runtime: ToolRuntime
) -> Command:
    """Add trust boundaries. Source and target must match known asset names."""
    existing = list(runtime.state.get("trust_boundaries") or [])
    assets = runtime.state.get("assets") or []
    asset_names = {a["name"] for a in assets}

    valid, invalid_msgs = [], []
    for boundary in trust_boundaries.trust_boundaries:
        violations = []
        if asset_names and boundary.source_entity not in asset_names:
            violations.append(f"Unknown source_entity '{boundary.source_entity}'")
        if asset_names and boundary.target_entity not in asset_names:
            violations.append(f"Unknown target_entity '{boundary.target_entity}'")
        if violations:
            invalid_msgs.append(f"  - {boundary.purpose}: {'; '.join(violations)}")
        else:
            valid.append(boundary.model_dump())

    updated = existing + valid
    msg = f"Added {len(valid)} trust boundaries (total: {len(updated)})."
    if invalid_msgs:
        msg += f"\n{len(invalid_msgs)} rejected:\n" + "\n".join(invalid_msgs)
        if asset_names:
            msg += f"\nValid asset names: {sorted(asset_names)}"

    return Command(
        update={
            "trust_boundaries": updated,
            "messages": [ToolMessage(content=msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool
def delete_trust_boundaries(
    purposes: Annotated[list[str], "Trust boundary purposes to delete"],
    runtime: ToolRuntime,
) -> Command:
    """Delete trust boundaries by their purpose."""
    existing = list(runtime.state.get("trust_boundaries") or [])
    to_remove = set(purposes)
    remaining = [b for b in existing if b["purpose"] not in to_remove]
    deleted = len(existing) - len(remaining)
    not_found = sorted(to_remove - {b["purpose"] for b in existing})

    msg = f"Deleted {deleted} trust boundaries. Remaining: {len(remaining)}."
    if not_found:
        msg += f"\nNot found: {not_found}"

    return Command(
        update={
            "trust_boundaries": remaining,
            "messages": [ToolMessage(content=msg, tool_call_id=runtime.tool_call_id)],
        }
    )


# ============================================================================
# Threat Sources Tools
# ============================================================================


@tool
def add_threat_sources(
    threat_sources: ThreatSourcesList, runtime: ToolRuntime
) -> Command:
    """Add threat source categories. Duplicates (by category name) are skipped."""
    existing = list(runtime.state.get("threat_sources") or [])
    existing_cats = {s["category"] for s in existing}

    added, dupes = [], []
    for source in threat_sources.threat_sources:
        if source.category in existing_cats:
            dupes.append(source.category)
        else:
            added.append(source.model_dump())
            existing_cats.add(source.category)

    updated = existing + added
    msg = f"Added {len(added)} threat sources (total: {len(updated)})."
    if dupes:
        msg += f"\nDuplicates skipped: {dupes}"

    return Command(
        update={
            "threat_sources": updated,
            "messages": [ToolMessage(content=msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool
def delete_threat_sources(
    categories: Annotated[list[str], "Threat source categories to delete"],
    runtime: ToolRuntime,
) -> Command:
    """Delete threat sources by category name."""
    existing = list(runtime.state.get("threat_sources") or [])
    to_remove = set(categories)
    remaining = [s for s in existing if s["category"] not in to_remove]
    deleted = len(existing) - len(remaining)
    not_found = sorted(to_remove - {s["category"] for s in existing})

    msg = f"Deleted {deleted} threat sources. Remaining: {len(remaining)}."
    if not_found:
        msg += f"\nNot found: {not_found}"

    return Command(
        update={
            "threat_sources": remaining,
            "messages": [ToolMessage(content=msg, tool_call_id=runtime.tool_call_id)],
        }
    )


# ============================================================================
# Threats Tools
# ============================================================================


def _handle_add_threats(threats, runtime: ToolRuntime) -> Command:
    """Shared logic for add_threats (static and dynamic versions)."""
    existing = list(runtime.state.get("threats") or [])
    add_count = runtime.state.get("add_threats_count", 0)
    gap_count = runtime.state.get("gap_analysis_count", 0)
    gap_enabled = runtime.state.get("gap_analysis_enabled", True)

    # Enforce add limit — require gap_analysis between batches (auto mode only)
    if gap_enabled and add_count >= MAX_ADD_THREATS_USES:
        if gap_count < MAX_GAP_ANALYSIS_USES:
            err = (
                "add_threats limit reached. You must call gap_analysis to verify "
                "the current catalog before adding more threats."
            )
        else:
            err = (
                "All tool calls exhausted. You can only remove threats or "
                "complete the task."
            )
        return Command(
            update={
                "messages": [
                    ToolMessage(content=err, tool_call_id=runtime.tool_call_id)
                ]
            }
        )

    # Reference sets for validation
    assets = runtime.state.get("assets") or []
    asset_names = {a["name"] for a in assets}
    sources = runtime.state.get("threat_sources") or []
    source_cats = {s["category"] for s in sources}
    existing_names = {t["name"] for t in existing}

    valid, invalid_msgs = [], []
    for threat in threats.threats:
        violations = []
        if threat.name in existing_names:
            violations.append("Duplicate name")
        if asset_names and threat.target not in asset_names:
            violations.append(f"Unknown target '{threat.target}'")
        if source_cats and threat.source not in source_cats:
            violations.append(f"Unknown source '{threat.source}'")
        if violations:
            invalid_msgs.append(f"  - {threat.name}: {'; '.join(violations)}")
        else:
            valid.append(threat.model_dump())
            existing_names.add(threat.name)

    updated = existing + valid
    msg = f"Added {len(valid)} threats (total: {len(updated)})."
    if invalid_msgs:
        msg += f"\n{len(invalid_msgs)} rejected:\n" + "\n".join(invalid_msgs)
        if asset_names:
            msg += f"\nValid targets: {sorted(asset_names)}"
        if source_cats:
            msg += f"\nValid sources: {sorted(source_cats)}"

    return Command(
        update={
            "threats": updated,
            "add_threats_count": add_count + 1,
            "messages": [ToolMessage(content=msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool
def add_threats(threats: ThreatsList, runtime: ToolRuntime) -> Command:
    """Add threats to the catalog. Validates target/source references and deduplicates."""
    return _handle_add_threats(threats, runtime)


@tool
def remove_threat(
    name: Annotated[str, "Exact name of the threat to remove"],
    runtime: ToolRuntime,
) -> Command:
    """Remove a single threat from the catalog by name."""
    existing = list(runtime.state.get("threats") or [])
    remaining = [t for t in existing if t["name"] != name]

    if len(remaining) == len(existing):
        msg = f"Threat '{name}' not found in catalog."
    else:
        msg = f"Removed '{name}'. Remaining: {len(remaining)} threats."

    return Command(
        update={
            "threats": remaining,
            "messages": [ToolMessage(content=msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool
def read_threat_catalog(runtime: ToolRuntime) -> str:
    """Read the full current threat catalog."""
    threats = runtime.state.get("threats") or []
    if not threats:
        return "Threat catalog is empty."

    lines = [f"Threat catalog ({len(threats)} threats):\n"]
    for t in threats:
        lines.append(
            f"- [{t['stride_category']}] {t['name']} -> {t['target']} "
            f"(likelihood: {t['likelihood']}, source: {t['source']})"
        )
    return "\n".join(lines)


@tool
def catalog_stats(runtime: ToolRuntime) -> str:
    """Get threat catalog statistics: STRIDE distribution, likelihood, coverage gaps."""
    threats = runtime.state.get("threats") or []
    assets = runtime.state.get("assets") or []
    sources = runtime.state.get("threat_sources") or []

    if not threats:
        return "Catalog is empty. No stats available."

    total = len(threats)

    # STRIDE distribution
    stride_counts = Counter(t["stride_category"] for t in threats)
    stride_lines = []
    for cat in STRIDE_CATEGORIES:
        count = stride_counts.get(cat, 0)
        pct = round(count / total * 100, 1)
        stride_lines.append(f"  {cat}: {count} ({pct}%)")

    # Likelihood
    lh = Counter(t["likelihood"] for t in threats)

    # Coverage
    covered_assets = {t["target"] for t in threats}
    all_assets = {a["name"] for a in assets if a.get("type") == "Asset"}
    uncovered_assets = sorted(all_assets - covered_assets)

    covered_sources = {t["source"] for t in threats}
    all_sources = {s["category"] for s in sources}
    uncovered_sources = sorted(all_sources - covered_sources)

    missing_stride = [c for c in STRIDE_CATEGORIES if stride_counts.get(c, 0) == 0]

    lines = [
        f"Total threats: {total}",
        f"\nLikelihood: High={lh.get('High', 0)}, Medium={lh.get('Medium', 0)}, Low={lh.get('Low', 0)}",
        f"\nSTRIDE distribution:",
        *stride_lines,
    ]
    if missing_stride:
        lines.append(f"\nMissing STRIDE categories: {missing_stride}")
    if uncovered_assets:
        lines.append(f"\nUncovered assets: {uncovered_assets}")
    if uncovered_sources:
        lines.append(f"\nUncovered threat sources: {uncovered_sources}")

    return "\n".join(lines)


@tool
def gap_analysis(runtime: ToolRuntime) -> Command:
    """Perform gap analysis on the threat catalog.

    Invokes a separate LLM call with the full architecture context (including
    the diagram) and the current threat catalog. Returns a structured
    STOP/CONTINUE decision with specific gap findings.

    Requires at least 25 threats. Resets the add_threats counter on success.
    """
    threats = runtime.state.get("threats") or []
    gap_count = runtime.state.get("gap_analysis_count", 0)

    if gap_count >= MAX_GAP_ANALYSIS_USES:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=(
                            f"Gap analysis limit reached ({MAX_GAP_ANALYSIS_USES}). "
                            "Complete your analysis and finish the task."
                        ),
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    if len(threats) < MIN_GAP_THRESHOLD:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=(
                            f"Need at least {MIN_GAP_THRESHOLD} threats before gap analysis. "
                            f"Current count: {len(threats)}. Keep adding threats."
                        ),
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    if _gap_model is None:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content="Internal error: gap analysis model not initialized.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    state = runtime.state
    application_type = state.get("application_type", "hybrid")
    image_data = state.get("image_data")
    image_type = state.get("image_type", "png")
    description = state.get("description", "")
    assumptions = state.get("assumptions") or []
    summary = state.get("summary", "")
    assets = state.get("assets") or []
    data_flows = state.get("data_flows") or []
    trust_boundaries = state.get("trust_boundaries") or []
    threat_sources = state.get("threat_sources") or []

    human_content: list[dict] = []

    if image_data:
        human_content.append(image_url_block(image_data, f"image/{image_type}"))

    context_parts = [f"<summary>{summary}</summary>"]
    if description:
        context_parts.append(f"<description>{description}</description>")
    if assumptions:
        context_parts.append(
            "<assumptions>\n"
            + "\n".join(f"- {a}" for a in assumptions)
            + "\n</assumptions>"
        )
    if assets:
        context_parts.append(f"<assets>\n{json.dumps(assets, indent=2)}\n</assets>")
    if data_flows:
        context_parts.append(
            f"<data_flows>\n{json.dumps(data_flows, indent=2)}\n</data_flows>"
        )
    if trust_boundaries:
        context_parts.append(
            f"<trust_boundaries>\n{json.dumps(trust_boundaries, indent=2)}\n</trust_boundaries>"
        )
    if threat_sources:
        source_cats = "\n".join(f"  - {s['category']}" for s in threat_sources)
        context_parts.append(f"<threat_sources>\n{source_cats}\n</threat_sources>")

    human_content.append({"type": "text", "text": "\n\n".join(context_parts)})

    total = len(threats)
    stride_counts = Counter(t["stride_category"] for t in threats)
    lh = Counter(t["likelihood"] for t in threats)

    kpi_lines = [
        f"Total threats: {total}",
        f"Likelihood: High={lh.get('High', 0)}, Medium={lh.get('Medium', 0)}, Low={lh.get('Low', 0)}",
        "STRIDE distribution:",
    ]
    for cat in STRIDE_CATEGORIES:
        count = stride_counts.get(cat, 0)
        pct = round(count / total * 100, 1)
        kpi_lines.append(f"  {cat}: {count} ({pct}%)")

    human_content.append(
        {
            "type": "text",
            "text": f"<catalog_kpis>\n{chr(10).join(kpi_lines)}\n</catalog_kpis>",
        }
    )
    human_content.append(
        {
            "type": "text",
            "text": f"<threat_catalog>\n{json.dumps(threats, indent=2)}\n</threat_catalog>",
        }
    )
    human_content.append(
        {
            "type": "text",
            "text": "Perform a thorough gap analysis and identify gaps in the threat model if any.",
        }
    )

    gap_messages = [
        SystemMessage(content=gap_analysis_system_prompt(application_type)),
        HumanMessage(content=human_content),
    ]

    try:
        gap_result: GapAnalysisResult = _gap_model.with_structured_output(
            GapAnalysisResult
        ).invoke(gap_messages)
    except Exception as exc:
        return Command(
            update={
                "gap_analysis_count": gap_count + 1,
                "add_threats_count": 0,
                "messages": [
                    ToolMessage(
                        content=f"Gap analysis failed: {exc}. Continue with add_threats.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )

    if gap_result.stop:
        result_msg = (
            f"Gap Analysis (rating {gap_result.rating}/10): "
            "The threat catalog is comprehensive. No actionable gaps identified. "
            "You may complete the task."
        )
    else:
        by_severity: dict[str, list[GapFinding]] = {
            "CRITICAL": [],
            "MAJOR": [],
            "MINOR": [],
        }
        for g in gap_result.gaps or []:
            by_severity.get(g.severity, by_severity["MINOR"]).append(g)

        result_lines = [f"Gap Analysis (rating {gap_result.rating}/10):\n"]
        for severity in ("CRITICAL", "MAJOR", "MINOR"):
            findings = by_severity[severity]
            if not findings:
                continue
            result_lines.append(f"**{severity} gaps:**")
            for g in findings:
                result_lines.append(
                    f"- [{g.stride_category}] {g.target}: {g.description}"
                )
            result_lines.append("")

        result_lines.append(
            "Address the gaps above by adding threats with add_threats. "
            "Focus on CRITICAL gaps first."
        )
        result_msg = "\n".join(result_lines)

    if _gap_on_result is not None:
        _gap_on_result(result_msg)

    return Command(
        update={
            "gap_analysis_count": gap_count + 1,
            "add_threats_count": 0,
            "messages": [
                ToolMessage(
                    content=result_msg,
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


# ============================================================================
# Task Middlewares
# ============================================================================


class SummaryMiddleware(TaskMiddleware):
    """Validates that a summary has been saved before task completion."""

    state_schema = PipelineState  # Carries all pipeline fields into the merged schema

    def validate_completion(self, state: dict[str, Any]) -> str | None:
        if not state.get("summary"):
            return "You must save a summary using save_summary before completing this task."
        return None


class AssetsMiddleware(TaskMiddleware):
    """Validates that assets have been saved."""

    def validate_completion(self, state: dict[str, Any]) -> str | None:
        assets = state.get("assets") or []
        if not assets:
            return "You must save at least one asset using save_assets."
        return None


class DataFlowsMiddleware(TaskMiddleware):
    """Validates that data flows have been added."""

    def validate_completion(self, state: dict[str, Any]) -> str | None:
        flows = state.get("data_flows") or []
        if len(flows) < 1:
            return "You must add at least one data flow using add_data_flows."
        return None


class TrustBoundariesMiddleware(TaskMiddleware):
    """Validates that trust boundaries have been added."""

    def validate_completion(self, state: dict[str, Any]) -> str | None:
        boundaries = state.get("trust_boundaries") or []
        if len(boundaries) < 1:
            return (
                "You must add at least one trust boundary using add_trust_boundaries."
            )
        return None


class ThreatSourcesMiddleware(TaskMiddleware):
    """Validates that at least 4 threat sources have been added."""

    def validate_completion(self, state: dict[str, Any]) -> str | None:
        sources = state.get("threat_sources") or []
        if len(sources) < 4:
            return f"Need at least 4 threat sources. Currently have {len(sources)}."
        return None


class _DynamicThreatsMiddleware(TaskMiddleware):
    """Base middleware that constrains the add_threats tool schema.

    Builds dynamic Pydantic models with Literal enums for target/source
    from the current state on task start, then swaps the tool in the
    model's view via wrap_model_call.
    """

    _dynamic_add_threats_tool = None

    def on_start(self, state: dict[str, Any]) -> None:
        """Build a constrained add_threats tool from the current assets and sources."""
        assets = state.get("assets") or []
        sources = state.get("threat_sources") or []
        asset_names = frozenset(a["name"] for a in assets)
        source_cats = frozenset(s["category"] for s in sources)

        if asset_names or source_cats:
            try:
                _, DynThreatsList = _create_constrained_threat_model(
                    asset_names, source_cats
                )
                self._dynamic_add_threats_tool = _create_dynamic_add_threats_tool(
                    DynThreatsList
                )
            except Exception:
                self._dynamic_add_threats_tool = None

    def wrap_model_call(self, request, handler):
        """Swap add_threats with the constrained version for the model's view."""
        if self._dynamic_add_threats_tool is not None:
            tools = [
                self._dynamic_add_threats_tool
                if getattr(t, "name", "") == "add_threats"
                else t
                for t in request.tools
            ]
            request = request.override(tools=tools)
        return handler(request)


class ThreatsMiddleware(_DynamicThreatsMiddleware):
    """Validates threat catalog: STRIDE coverage, optional gap_analysis gate,
    and iteration-based improvement nudging.

    In auto mode (iteration=0): requires gap_analysis before completion.
    In iteration mode (iteration>0): nudges the agent N times to improve the
    catalog before allowing completion.
    """

    def __init__(self, require_gap_analysis: bool = True, iteration: int = 0):
        self._require_gap_analysis = require_gap_analysis
        self._iteration = iteration
        self._passes_done = 0

    def validate_completion(self, state: dict[str, Any]) -> str | None:
        threats = state.get("threats") or []

        if not threats:
            return "Threat catalog is empty. Add threats using add_threats."

        # All STRIDE categories must be covered
        stride_cats = {t["stride_category"] for t in threats}
        missing = set(STRIDE_CATEGORIES) - stride_cats
        if missing:
            return f"Missing STRIDE categories: {', '.join(sorted(missing))}. Add threats to cover these."

        # Gap analysis gate (auto mode only)
        if self._require_gap_analysis:
            gap_count = state.get("gap_analysis_count", 0)
            if gap_count == 0:
                return "You must call gap_analysis at least once before completing."

        # Iteration mode: nudge N-1 times (iteration=1 means no nudge,
        # iteration=2 means one nudge, etc.)
        if self._passes_done < self._iteration - 1:
            self._passes_done += 1
            return _improvement_nudge()

        return None


# ============================================================================
# Task Definitions
# ============================================================================

THREAT_TOOLS_ITER = [add_threats, remove_threat, read_threat_catalog, catalog_stats]
THREAT_TOOLS_AUTO = THREAT_TOOLS_ITER + [gap_analysis]


def _build_tasks(iteration: int = 0, built_model: BuiltModel | None = None) -> list:
    """Build the task list. iteration=0 → auto mode with gap_analysis,
    iteration>0 → iteration mode with improvement nudges."""
    auto = iteration == 0

    low_settings = built_model.adaptive_model_settings("low") if built_model else None

    return [
        Task(
            name="summary",
            instruction=summary_instruction(),
            tools=[save_summary],
            model_settings=low_settings,
            middleware=SummaryMiddleware(),
        ),
        Task(
            name="assets",
            instruction=assets_instruction(),
            tools=[save_assets],
            model_settings=low_settings,
            middleware=AssetsMiddleware(),
        ),
        Task(
            name="data_flows",
            instruction=data_flows_instruction(),
            model_settings=low_settings,
            tools=[add_data_flows, delete_data_flows],
            middleware=DataFlowsMiddleware(),
        ),
        Task(
            name="trust_boundaries",
            instruction=trust_boundaries_instruction(),
            tools=[add_trust_boundaries, delete_trust_boundaries],
            middleware=TrustBoundariesMiddleware(),
        ),
        Task(
            name="threat_sources",
            instruction=threat_sources_instruction(),
            tools=[add_threat_sources, delete_threat_sources],
            middleware=ThreatSourcesMiddleware(),
        ),
        Task(
            name="threats",
            instruction=threats_instruction() if auto else threats_iter_instruction(),
            tools=THREAT_TOOLS_AUTO if auto else THREAT_TOOLS_ITER,
            middleware=ThreatsMiddleware(
                require_gap_analysis=auto, iteration=iteration
            ),
        ),
    ]


# ============================================================================
# Agent Builder
# ============================================================================


# Module-level model reference used by gap_analysis for its inner LLM call.
# Set by build_agent() before the agent runs.
_gap_model: Any = None
_gap_on_result = None


def build_agent(
    model_id: str = "global.anthropic.claude-opus-4-6-v1",
    region: str = "us-east-1",
    reasoning_effort: str = "medium",
    application_type: str = "hybrid",
    iteration: int = 0,
    aws_profile: str | None = None,
    provider: str = "bedrock",
    openai_api_key: str | None = None,
):
    """Build the threat modeling agent.

    Args:
        model_id: Provider-specific model ID.
        region: AWS region for the Bedrock endpoint (Bedrock only).
        reasoning_effort: Reasoning effort (off/low/medium/high/max).
        application_type: Application type (internal/public_facing/hybrid).
        iteration: Number of improvement passes (0 = auto mode with gap_analysis).
        aws_profile: Optional AWS profile name for credentials (Bedrock only).
        provider: "bedrock" or "openai".
        openai_api_key: Optional API key for OpenAI (falls back to OPENAI_API_KEY env).

    Returns:
        A compiled LangGraph agent.
    """
    global _gap_model

    built = build_chat_model(
        provider=provider,
        model_id=model_id,
        reasoning_effort=reasoning_effort,
        aws_region=region,
        aws_profile=aws_profile,
        openai_api_key=openai_api_key,
    )

    # Gap analysis uses the same model for its inner structured-output call (auto mode)
    _gap_model = built.model

    tasks = _build_tasks(iteration, built_model=built)
    middleware_chain: list = []
    if built.is_bedrock:
        middleware_chain.append(BedrockPromptCachingMiddleware())
    middleware_chain.append(TaskSteeringMiddleware(tasks=tasks))

    return create_agent(
        model=built.model,
        middleware=middleware_chain,
        system_prompt=system_prompt(application_type),
    )


# ============================================================================
# Image Helpers
# ============================================================================


def load_image(image_path: str) -> tuple[str, str]:
    """Load and base64-encode an image file."""
    with open(image_path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    mime, _ = mimetypes.guess_type(image_path)
    image_type = (mime or "image/jpeg").split("/")[1]
    return data, image_type


def build_input_message(
    image_data: str,
    image_type: str,
    description: str = "",
    assumptions: list[str] | None = None,
) -> HumanMessage:
    """Build the initial HumanMessage with the architecture diagram and context."""
    content: list[dict] = [image_url_block(image_data, f"image/{image_type}")]

    if description:
        content.append(
            {"type": "text", "text": f"<description>{description}</description>"}
        )

    if assumptions:
        assumptions_text = "\n".join(f"- {a}" for a in assumptions)
        content.append(
            {
                "type": "text",
                "text": f"<assumptions>\n{assumptions_text}\n</assumptions>",
            }
        )

    content.append(
        {
            "type": "text",
            "text": (
                "Analyze this architecture diagram and perform a complete STRIDE-based "
                "threat model. Work through each task in order: summarize the architecture, "
                "identify assets, define data flows, trust boundaries, threat sources, "
                "and finally produce a comprehensive threat catalog."
            ),
        }
    )

    return HumanMessage(content=content)


# ============================================================================
# Runner
# ============================================================================


def run_pipeline(
    image_path: str,
    description: str = "",
    assumptions: list[str] | None = None,
    model_id: str = "global.anthropic.claude-opus-4-6-v1",
    region: str = "us-east-1",
    reasoning_effort: str = "medium",
    application_type: str = "hybrid",
    iteration: int = 0,
    on_event: "callable | None" = None,
    on_ai_message: "callable | None" = None,
    aws_profile: str | None = None,
    stop_event: "threading.Event | None" = None,
    provider: str = "bedrock",
    openai_api_key: str | None = None,
) -> dict:
    """Run the threat modeling pipeline.

    Args:
        image_path: Path to the architecture diagram image.
        description: Optional text description of the architecture.
        assumptions: Optional list of assumptions.
        model_id: Bedrock model ID.
        region: AWS region.
        reasoning_effort: Adaptive thinking effort level.
        on_event: Optional callback ``(event_type: str, detail: str) -> None``
                  for progress reporting.
        aws_profile: Optional AWS profile name for credentials.
        stop_event: Optional threading.Event to signal cancellation.

    Returns:
        Dict with keys: summary, assets, data_flows, trust_boundaries,
        threat_sources, threats.
    """
    agent = build_agent(
        model_id=model_id,
        region=region,
        reasoning_effort=reasoning_effort,
        application_type=application_type,
        iteration=iteration,
        aws_profile=aws_profile,
        provider=provider,
        openai_api_key=openai_api_key,
    )

    # Wire gap analysis result callback
    global _gap_on_result
    if on_ai_message:
        _gap_on_result = lambda result_text: on_ai_message("gap_result", result_text)
    else:
        _gap_on_result = None

    image_data, image_type = load_image(image_path)
    human_message = build_input_message(
        image_data, image_type, description, assumptions
    )

    auto = iteration == 0
    initial_state = {
        "messages": [human_message],
        "image_data": image_data,
        "image_type": image_type,
        "description": description,
        "assumptions": assumptions or [],
        "threats": [],
        "data_flows": [],
        "trust_boundaries": [],
        "threat_sources": [],
        "add_threats_count": 0,
        "gap_analysis_count": 0,
        "gap_analysis_enabled": auto,
        "application_type": application_type,
    }

    usage_tracker = UsageTracker()
    config = {"recursion_limit": 200}

    # Stream and collect state updates
    result: dict[str, Any] = {}
    prev_statuses: dict[str, str] = {}
    _seen_tc_ids: set = set()

    with prevent_sleep():
        for mode, data in agent.stream(
            initial_state, config, stream_mode=["messages", "updates"]
        ):
            if stop_event and stop_event.is_set():
                break
            if mode == "updates":
                for node_name, delta in data.items():
                    if not isinstance(delta, dict):
                        continue
                    # Track non-message state fields
                    for key in (
                        "summary",
                        "assets",
                        "data_flows",
                        "trust_boundaries",
                        "threat_sources",
                        "threats",
                        "task_statuses",
                    ):
                        if key in delta:
                            result[key] = delta[key]

                    # Collect usage from AI messages in state updates
                    for msg in delta.get("messages", []):
                        um = getattr(msg, "usage_metadata", None)
                        if um and um.get("input_tokens"):
                            usage_tracker.add(um)

                    # Report task transitions
                    statuses = delta.get("task_statuses")
                    if statuses and on_event:
                        for task_name, status in statuses.items():
                            prev = prev_statuses.get(task_name)
                            if status != prev:
                                on_event("task", f"{task_name} -> {status}")
                        prev_statuses = dict(statuses)

            elif mode == "messages":
                msg_chunk, metadata = data

                # Skip tool-result messages (ToolMessage / ToolMessageChunk)
                if getattr(msg_chunk, "tool_call_id", None):
                    continue

                # Tool call names (real-time, as soon as name is available)
                if (
                    hasattr(msg_chunk, "tool_call_chunks")
                    and msg_chunk.tool_call_chunks
                ):
                    for tc_chunk in msg_chunk.tool_call_chunks:
                        tc_id = tc_chunk.get("id") or ""
                        tc_name = (tc_chunk.get("name") or "").strip()
                        if tc_id and tc_id not in _seen_tc_ids and tc_name:
                            _seen_tc_ids.add(tc_id)
                            if on_event:
                                on_event("tool", tc_name)

                # AI content (thinking + text)
                if on_ai_message and hasattr(msg_chunk, "content"):
                    content = msg_chunk.content
                    if isinstance(content, str) and content:
                        on_ai_message("text", content)
                    elif isinstance(content, list):
                        for block in content:
                            if not isinstance(block, dict):
                                continue
                            btype = block.get("type", "")
                            if btype == "reasoning_content":
                                rc = block.get("reasoning_content", {})
                                text = (
                                    rc.get("text", "") if isinstance(rc, dict) else ""
                                )
                                if text:
                                    on_ai_message("thinking", text)
                            elif btype == "thinking":
                                text = block.get("thinking", "") or block.get(
                                    "text", ""
                                )
                                if text:
                                    on_ai_message("thinking", text)
                            elif btype == "text" and block.get("text"):
                                on_ai_message("text", block["text"])

    return {
        "summary": result.get("summary"),
        "assets": result.get("assets", []),
        "data_flows": result.get("data_flows", []),
        "trust_boundaries": result.get("trust_boundaries", []),
        "threat_sources": result.get("threat_sources", []),
        "threats": result.get("threats", []),
        "token_usage": usage_tracker.to_dict(),
    }


# ============================================================================
# Model Format Conversion
# ============================================================================


def to_model_format(
    result: dict,
    *,
    job_id: str,
    name: str,
    description: str = "",
    assumptions: list | None = None,
    app_type: str = "hybrid",
    image_path: str = "",
) -> dict:
    """Convert flat pipeline result to the nested model format for storage/export.

    The rest of the CLI (export, list, attack trees) expects:
      assets       -> {"assets": [...]}
      architecture -> {"data_flows": [...], "trust_boundaries": [...], "threat_sources": [...]}
      threats      -> {"threats": [...]}
    """
    return {
        "id": job_id,
        "status": "COMPLETE",
        "created_at": datetime.now().isoformat(),
        "title": name,
        "name": name,
        "description": description,
        "assumptions": assumptions or [],
        "application_type": app_type,
        "summary": result.get("summary"),
        "assets": {"assets": result.get("assets", [])},
        "system_architecture": {
            "data_flows": result.get("data_flows", []),
            "trust_boundaries": result.get("trust_boundaries", []),
            "threat_sources": result.get("threat_sources", []),
        },
        "threat_list": {"threats": result.get("threats", [])},
        "image_path": image_path,
        "token_usage": result.get("token_usage"),
    }
