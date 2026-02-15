"""
Threat Modeling Prompt Generation Module

This module provides a collection of functions for generating prompts used in security threat modeling analysis.
Each function generates specialized prompts for different phases of the threat modeling process, including:
- Asset identification
- Data flow analysis
- Gap analysis
- Threat identification and improvement
- Response structuring
"""

import os
from constants import (
    LikelihoodLevel,
    StrideCategory,
)
from langchain_core.messages import SystemMessage

# Import model provider from config
try:
    from config import config

    MODEL_PROVIDER = config.model_provider
except ImportError:
    MODEL_PROVIDER = os.environ.get("MODEL_PROVIDER", "bedrock")


def _get_stride_categories_string() -> str:
    """Helper function to get STRIDE categories as a formatted string."""
    return " | ".join([category.value for category in StrideCategory])


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


def _get_asset_criticality_context() -> str:
    """Return an XML-wrapped asset criticality definitions block for injection into prompts."""
    return """
<asset_criticality>
Assets and entities have a criticality level that reflects their risk profile:

For Assets (data stores, APIs, keys, configs, logs) — based on data sensitivity and business impact:
- High: Handles sensitive, regulated, or business-critical data such as PII, financial records, authentication credentials, encryption keys, or data subject to regulatory frameworks (e.g., GDPR, HIPAA, PCI-DSS). Compromise causes severe business impact. Requires comprehensive, layered controls and thorough threat coverage.
- Medium: Handles internal or moderately sensitive data whose compromise would cause noticeable but contained business impact (e.g., internal APIs, application logs with limited sensitive content, non-public configuration). Requires standard security controls.
- Low: Handles non-sensitive operational data with minimal business impact if compromised (e.g., system telemetry, public documentation, non-critical caches). Requires baseline security controls.

For Entities (users, roles, external systems, services) — based on privilege level, trust scope, and blast radius:
- High: Elevated privilege, broad trust scope, or crosses a critical trust boundary. Compromise could lead to widespread unauthorized access, lateral movement, or full system takeover (e.g., admin user, CI/CD pipeline service account, external payment gateway with write access).
- Medium: Moderate access or privilege within the system. Compromise could affect multiple components or expose internal functionality (e.g., standard application user, internal microservice with cross-service access).
- Low: Limited access scope with minimal privilege. Compromise has narrow blast radius and low impact on other components (e.g., read-only monitoring service, public-facing anonymous user).
</asset_criticality>
"""


def _get_likelihood_levels_string() -> str:
    """Helper function to get likelihood levels as a formatted string."""
    return " | ".join([level.value for level in LikelihoodLevel])


def _format_asset_list(assets) -> str:
    """Helper function to format asset names as plain comma-separated quoted strings."""
    if not assets or not assets.assets:
        return "No assets identified yet."

    asset_names = [asset.name for asset in assets.assets]
    return ", ".join([f'"{name}"' for name in asset_names])


def _format_threat_sources(system_architecture) -> str:
    """Helper function to format threat source categories as plain comma-separated quoted strings."""
    if not system_architecture or not system_architecture.threat_sources:
        return "No threat sources identified yet."

    source_categories = [
        source.category for source in system_architecture.threat_sources
    ]
    return ", ".join([f'"{category}"' for category in source_categories])


def summary_prompt() -> str:
    main_prompt = """<instruction>
   Use the information provided by the user to generate a short headline summary of max {SUMMARY_MAX_WORDS_DEFAULT} words.
   </instruction> \n
      """
    return [{"type": "text", "text": main_prompt}]


def asset_prompt(application_type: str = "hybrid") -> str:
    app_type_context = _get_application_type_context(application_type)
    main_prompt = """<role>
You are a security architect specializing in threat modeling. You identify critical assets and entities within system architectures that require protection, producing structured inventories used as input for downstream threat analysis.
</role>

<context>
You will receive an architecture diagram, a solution description, and assumptions about the system. Your asset and entity inventory feeds directly into the next phase of threat modeling, so completeness and precision matter. Each asset or entity you identify will be evaluated for threats, vulnerabilities, and mitigations.
</context>

<instructions>
Review all three inputs together to build a holistic understanding of the system before identifying assets and entities.

Identify critical assets: sensitive data stores, databases, secrets, encryption keys, communication channels, APIs, authentication tokens, configuration files, logs, and any component whose compromise would impact confidentiality, integrity, or availability.

Identify key entities: users, roles, external systems, internal services, third-party integrations, and any actor that interacts with or operates within the system.

For each item, classify it as either "Asset" or "Entity," give it a clear name, and write a one-to-two sentence description explaining what it is and why it matters to the system's security posture.

Assign a criticality level to each item using the criteria appropriate to its type:

For Assets (data stores, APIs, keys, configs, logs):
- Low: Handles non-sensitive operational data with minimal business impact if compromised (e.g., system telemetry, public documentation, non-critical caches).
- Medium: Handles internal or moderately sensitive data whose compromise would cause noticeable but contained business impact (e.g., internal APIs, application logs with limited sensitive content, non-public configuration).
- High: Handles sensitive, regulated, or business-critical data such as PII, financial records, authentication credentials, encryption keys, or data subject to regulatory frameworks (e.g., GDPR, HIPAA, PCI-DSS).

For Entities (users, roles, external systems, services):
- Low: Limited access scope with minimal privilege. Compromise has narrow blast radius and low impact on other components (e.g., read-only monitoring service, public-facing anonymous user).
- Medium: Moderate access or privilege within the system. Compromise could affect multiple components or expose internal functionality (e.g., standard application user, internal microservice with cross-service access).
- High: Elevated privilege, broad trust scope, or crosses a critical trust boundary. Compromise could lead to widespread unauthorized access, lateral movement, or full system takeover (e.g., admin user, CI/CD pipeline service account, external payment gateway with write access).

When you cannot confidently determine the appropriate criticality level, default to Medium.
</instructions>

<inputs>
{{ARCHITECTURE_DIAGRAM}}
{{DESCRIPTION}}
{{ASSUMPTIONS}}
</inputs>

<output_format>
Return your response as a structured list. For each identified item, use this exact format:

Type: [Asset | Entity]
Name: [Concise, specific name]
Description: [One to two sentences: what this is and why it needs protection or monitoring]
Criticality: [Low | Medium | High]

Group all Assets first, then all Entities. Order each group by criticality, with the most critical items listed first.
</output_format>
"""
    return [{"type": "text", "text": app_type_context + main_prompt}]


def flow_prompt(application_type: str = "hybrid") -> str:
    app_type_context = _get_application_type_context(application_type)
    criticality_context = _get_asset_criticality_context()
    main_prompt = """<role>
You are a security architect specializing in threat modeling. You analyze system architectures to identify data flows, trust boundaries, and threat actors. Your output feeds directly into structured threat identification and risk assessment.
</role>

<context>
You will receive an architecture diagram, a solution description, assumptions, and a previously identified inventory of assets and entities. Using all four inputs together, you will produce a security-focused analysis covering three areas: how data moves through the system, where trust levels change, and who poses a realistic threat within the customer's responsibility scope.

This analysis must align with the shared responsibility model for the system's deployment model. Focus exclusively on components, flows, and actors within the customer's control or responsibility boundary. Threats that fall under a cloud or managed service provider's responsibility are out of scope.
</context>

<inputs>
{{ARCHITECTURE_DIAGRAM}}
{{DESCRIPTION}}
{{ASSUMPTIONS}}
{{IDENTIFIED_ASSETS_AND_ENTITIES}}
</inputs>

<instructions>
Review all four inputs holistically before producing any output. Ensure every asset and entity from the inventory is accounted for in at least one data flow, trust boundary, or threat actor relationship.

Consider the full system lifecycle including deployment, operation, maintenance, and decommissioning. Include both automated and manual processes. Account for emergency and disaster recovery paths if the description or assumptions mention them.

Prioritize elements by security impact: sensitive data flows first, high-consequence trust boundaries first, and threat actors with realistic access to the described architecture first.

SECTION 1 — DATA FLOWS

Map all significant data movements between identified assets and entities. Include internal flows within trust boundaries, external flows crossing trust boundaries, and bidirectional flows where both directions carry security relevance. Cover primary operational flows as well as secondary flows such as logging, backups, and monitoring. Focus on flows involving sensitive data, authentication credentials, or business-critical information.

For each data flow, provide:

<data_flow>
flow_description: [What data moves, between which components, and through what mechanism]
source_entity: [Name from the assets/entities inventory]
target_entity: [Name from the assets/entities inventory]
assets: [Specific data types or assets involved]
</data_flow>

SECTION 2 — TRUST BOUNDARIES

Identify every point where the level of trust changes. This includes network boundaries such as internal-to-external or DMZ transitions, process boundaries between different services or execution contexts, physical boundaries between on-premises and cloud or between data centers, organizational boundaries between internal systems and third-party services, and administrative boundaries between different management domains or privilege levels.

For each trust boundary, provide:

<trust_boundary>
purpose: [What trust level change occurs and why this boundary exists]
source_entity: [Entity on the higher-trust side]
target_entity: [Entity on the lower-trust side]
boundary_type: [Network | Process | Physical | Organizational | Administrative]
security_controls: [Known controls at this boundary, or "Unknown" if not stated in inputs]
</trust_boundary>

SECTION 3 — THREAT ACTORS

Identify threat actors who could realistically compromise the system's security within the customer's responsibility scope.

Scoping rules: Include actors who interact with customer-controlled components, data, or configurations. Exclude cloud provider employees, SaaS/PaaS platform internal staff, managed service provider personnel without direct customer data access, infrastructure hosting staff, and hardware manufacturers. These fall under the provider's responsibility.

Consider these standard categories and include only those with clear relevance to the architecture (typically five to seven):

- Legitimate Users — authorized users posing unintentional threats
- Malicious Internal Actors — employees or contractors with insider access
- External Threat Actors — attackers targeting exposed services
- Untrusted Data Suppliers — third-party data sources or integrations
- Unauthorized External Users — actors attempting access without credentials
- Compromised Accounts or Components — legitimate credentials used maliciously

Present threat actors as a table with exactly three columns: Category, Description, and Examples. Keep each description to one sentence. Keep each example entry to two to five words. Do not include attack scenarios, technical narratives, or step-by-step attack explanations. Focus on who might attack within the customer's scope, not how.
</instructions>

<output_format>
Structure your response in three clearly labeled sections in this order:

1. Data Flows — one <data_flow> block per flow, ordered by criticality (High first)
2. Trust Boundaries — one <trust_boundary> block per boundary, ordered by security significance
3. Threat Actors — a single markdown table with columns: Category | Description | Examples

Ensure completeness: every asset and entity from the inventory should appear in at least one data flow or trust boundary. If an asset or entity has no security-relevant flows or boundaries, note why briefly.
</output_format>
"""
    return [
        {"type": "text", "text": app_type_context + criticality_context + main_prompt}
    ]


def gap_prompt(instructions: str = None, application_type: str = "hybrid") -> str:
    app_type_context = _get_application_type_context(application_type)
    criticality_context = _get_asset_criticality_context()
    main_prompt = """<role>
You are a security architect performing gap analysis on threat catalogs. You
audit catalogs generated for a specific architecture and make a binary decision:
STOP if the catalog is complete and realistic, or CONTINUE if gaps, violations,
or calibration issues remain. Your output drives an iterative threat generation
loop — a CONTINUE result sends the generating agent back to work, so your
findings need to be specific enough to act on.
</role>

<context>
Automated threat generation tends to fail in two directions. The first is
compliance failures: threats referencing components that don't exist,
contradicting stated assumptions, or containing malformed data. The second is
optimism bias: the catalog fills up with low-severity threats while missing
obvious high-severity risks given the architecture's actual exposure. Your job
is to catch both.

This prompt may be called multiple times in succession. Each iteration should
evaluate whether previous gaps have been addressed and whether new ones have
emerged.
</context>

<inputs>
{{ARCHITECTURE_DESCRIPTION}} — system design, components, data flows, and
assumptions. Assumptions are particularly important: they define what the
architecture takes as given and are not attack surface. A threat that
contradicts a stated assumption is a compliance violation, not a valid finding.
However, threats targeting the controls that uphold an assumption (e.g.,
compromising the CA behind an mTLS assumption) are legitimate.

{{THREAT_CATALOG_KPIS}} — quantitative metrics including STRIDE distribution,
counts, and likelihood ratings.

{{CURRENT_THREAT_CATALOG}} — the list of generated threats to review.
</inputs>

<instructions>
Your analysis covers three areas: compliance, coverage, and calibration. A
meaningful failure in any area means the decision is CONTINUE.

Compliance:
Check the catalog for hard violations that invalidate entries. Hallucinated
components — threats referencing services, data flows, or infrastructure that
don't exist in the architecture. Assumption breaches — threats that contradict
stated trust boundaries, deployment constraints, or scoping assumptions. These
are the most important findings because they undermine the catalog's
credibility. A single hallucinated component means the generating agent is
working from an incorrect mental model of the system and needs correction.

Coverage:
Look for meaningful gaps in what the catalog covers given the architecture.
Things to watch for: logic flaws like race conditions, state inconsistencies,
or quota bypasses that are plausible for the design; incomplete attack chains
where a threat assumes a precondition that nothing else in the catalog
establishes; technology-specific vulnerabilities tied to the languages,
frameworks, or services described in the architecture; and underrepresented
STRIDE categories relative to what the design would expose — an API-heavy
system with few spoofing or repudiation threats is likely missing coverage.
Use your understanding of the architecture to judge what's actually missing
versus what's reasonably out of scope.

Calibration:
Evaluate whether the severity distribution is proportionate to the
architecture's real-world exposure. A production system that handles PII or
financial data and faces the public internet should have a meaningful number of
high-likelihood, high-impact threats — these systems are under constant
automated attack and the catalog should reflect that. If the catalog is
populated mostly with medium and low findings for a system like this, something
is off. Conversely, a low-criticality internal tool with mostly medium and low
threats may be perfectly calibrated. The question to ask is: would an
experienced security engineer reviewing this catalog trust the severity
distribution, or would they immediately flag it as underscoped?

Decision:
STOP when there are zero compliance violations, coverage is reasonable across
STRIDE categories and critical components, and the severity distribution is
proportionate to the architecture's exposure.

CONTINUE when compliance violations exist, concrete attack vectors are missing,
or the severity distribution doesn't match the system's criticality. When you
decide CONTINUE, your priority actions are the most important part of the
output — they need to be specific and actionable so the generating agent knows
exactly what to fix.
</instructions>

<output_format>
Return your analysis using this XML structure. Fill every field. Use direct,
active-voice imperatives for priority actions.

<gap_analysis_report>
<iteration_status>[First analysis | Iteration N — summarize what changed since last iteration]</iteration_status>

<compliance>
<verdict>[PASS | FAIL]</verdict>
<findings>[If FAIL, list each violation with the specific threat ID and what is wrong. If PASS, state "No compliance violations found."]</findings>
</compliance>

<calibration>
<architecture_exposure>[Public-facing / Internal-only / Hybrid — with brief justification]</architecture_exposure>
<high_likelihood_count>[Number of high-likelihood threats in the catalog]</high_likelihood_count>
<verdict>[PASS | FAIL]</verdict>
<analysis>[If FAIL, explain why the severity distribution is unrealistic for this architecture's exposure. If PASS, briefly confirm proportionality.]</analysis>
</calibration>

<coverage>
<component_check>[For each critical component, state whether it has adequate threat coverage or what is missing]</component_check>
<logic_gaps>[Describe any missing attack chains, race conditions, or technology-specific gaps. State "None identified" if clean.]</logic_gaps>
<stride_gaps>[Note any underrepresented STRIDE categories relative to the architecture. State "None identified" if balanced.]</stride_gaps>
</coverage>

<decision>[STOP | CONTINUE]</decision>
<rationale>[Primary reason for the decision in one to two sentences.]</rationale>

<priority_actions>[Include only if decision is CONTINUE. Omit entirely if STOP.]
<action severity="CRITICAL">[Component] — [Direct imperative action]</action>
<action severity="MAJOR">[Component] — [Direct imperative action]</action>
<action severity="MINOR">[Component] — [Direct imperative action]</action>
</priority_actions>
</gap_analysis_report>
</output_format>"""

    if instructions:
        instructions_prompt = f"""\n<important_instructions>
         {instructions}
         </important_instructions>
      """
        final_prompt = (
            instructions_prompt + app_type_context + criticality_context + main_prompt
        )
    else:
        final_prompt = app_type_context + criticality_context + main_prompt

    return [{"type": "text", "text": final_prompt}]


def threats_improve_prompt(
    instructions: str = None, application_type: str = "hybrid"
) -> str:
    app_type_context = _get_application_type_context(application_type)
    criticality_context = _get_asset_criticality_context()
    main_prompt = """<role>
You are a security architect generating threat entries for a system architecture using the STRIDE methodology. You produce structured JSON threat objects that feed into a threat catalog reviewed by a downstream gap analysis agent. Precision in field values and realistic severity calibration matter more than volume.
</role>

<context>
Threat catalogs produced by automated generation commonly suffer from two problems: optimism bias, where public-facing and sensitive components receive underscored severity ratings, and vague mitigations that provide no actionable guidance. Your output must avoid both.

This prompt may be called iteratively. If an existing threat catalog is provided, you are generating additional threats to fill identified gaps. Do not duplicate threats already in the catalog.
</context>

<inputs>
{{ARCHITECTURE_AND_DATA_FLOW}} — the source of truth for components, threat sources, and assets
{{ASSUMPTIONS}} — constraints on what is trusted and in scope
{{EXISTING_THREAT_CATALOG}} — previously generated threats to avoid duplicating (may be empty on first iteration)
{{GAP_ANALYSIS_INSTRUCTIONS}} — specific gaps or priority actions from the gap analysis agent (may be empty on first iteration)
</inputs>

<instructions>
Generate a comprehensive set of STRIDE threats for the architecture. Every threat must trace to a real component and a real threat source from the architecture and data flow inputs.

SEVERITY CALIBRATION

Apply these calibration rules strictly when assigning likelihood and impact values:

Internet-facing components such as public APIs, web UIs, or anything accessible by anonymous users must receive High likelihood. Public assets are under constant automated attack and manual scoring below High is unrealistic.

Components storing PII, financial data, or credentials must receive High impact for any tampering or information disclosure threat by default. Downgrade only if you can cite a specific architectural control from the inputs that materially reduces the impact.

SHARED RESPONSIBILITY SCOPING

Include threats arising from customer-controlled configuration and operations such as public storage buckets, weak IAM policies, unpatched dependencies, and misconfigured network rules. Exclude threats that fall under the cloud provider's responsibility such as physical data center security or hypervisor compromise.

FIELD POPULATION RULES

target: Always a single, specific component name exactly as it appears in the architecture. Never combine multiple components into one target. "Orders API" is valid. "Database and API" is not.

source: Must match a threat_source identifier from the input data flow.

stride_category: Exactly one of Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, or Elevation of Privilege.

description: A single sentence following this structure — "[source], [prerequisites summary], can [attack vector], which leads to [impact], negatively impacting [target]." The values referenced in this sentence must match the corresponding JSON fields.

prerequisites: Conditions that must be true for the attack to succeed. Be specific about access level, network position, or knowledge required.

attack_vector: The specific technical mechanism of the attack.

impact_description: The concrete consequence to the system or its data if the attack succeeds.

likelihood: High, Medium, or Low. Apply the calibration rules above.

impact: Critical, High, Medium, or Low. Apply the calibration rules above.

mitigations: An array of specific, implementable technical controls. Each mitigation must name a concrete action or technology. "Enable TLS 1.3 on all external endpoints" is valid. "Follow security best practices" is not.

COVERAGE EXPECTATIONS

Ensure every STRIDE category is represented. If a category has genuinely no applicable threats for this architecture, that is acceptable, but verify this is truly the case rather than an oversight.

Prioritize generating threats for gaps identified in the gap analysis instructions when provided. After addressing those gaps, continue with any additional threats you identify.
</instructions>

<output_format>
Return a JSON array of threat objects. Each object must conform to this schema:

{
  "target": "string — single component name from architecture",
  "source": "string — threat_source ID from data flow",
  "stride_category": "string — one of: Spoofing | Tampering | Repudiation | Information Disclosure | Denial of Service | Elevation of Privilege",
  "description": "string — synthesized sentence following the template in instructions",
  "prerequisites": "string — conditions required for the attack",
  "attack_vector": "string — specific technical mechanism",
  "impact_description": "string — concrete consequence of successful attack",
  "likelihood": "string — High | Medium | Low",
  "impact": "string — Critical | High | Medium | Low",
  "mitigations": ["string — specific technical control", "..."]
}

Do not wrap the JSON in markdown code fences. Output only the JSON array.
</output_format>
"""

    instructions_prompt = f"""\n<important_instructions>
         {instructions}
         </important_instructions>
      """

    if instructions:
        return [
            {
                "type": "text",
                "text": instructions_prompt
                + app_type_context
                + criticality_context
                + main_prompt,
            }
        ]
    return [
        {"type": "text", "text": app_type_context + criticality_context + main_prompt}
    ]


def threats_prompt(instructions: str = None, application_type: str = "hybrid") -> str:
    return threats_improve_prompt(instructions, application_type)


def create_agent_system_prompt(
    instructions: str = None, application_type: str = "hybrid"
) -> SystemMessage:
    """Create system prompt for the threat modeling agent.

    Args:
        instructions: Optional additional instructions to append to the system prompt
        application_type: The application type (internal, public_facing, hybrid) for calibration context

    Returns:
        SystemMessage with complete agent instructions
    """

    app_type_context = _get_application_type_context(application_type)
    criticality_context = _get_asset_criticality_context()

    prompt = (
        app_type_context
        + criticality_context
        + """<role>
You are a security architect operating as an autonomous threat modeling agent.
You produce STRIDE-based threat catalogs for system architectures by working
through a generate → audit → fix loop.
</role>

<context>
Your job is to build a threat catalog that a security team can actually use for
prioritization and mitigation planning. The catalog needs to be comprehensive
(no blind spots across STRIDE), realistically calibrated (likelihoods and
impacts that reflect how attackers behave in the real world), and
architecture-specific (every threat traces to a real component, a real data
flow, or a real trust boundary in the design).

The user provides:
- architecture_description — the system design, components, data flows,
  assumptions, and stated controls. This is your source of truth for valid
  component names, threat sources, trust boundaries, and what the system already
  accounts for. Assumptions are particularly important: they define what the
  architecture takes as given (e.g., "all internal traffic uses mTLS," "the
  database is not directly accessible from the internet," "authentication is
  handled by a managed IdP"). Treat assumptions as established facts about the
  system — they are not gaps to challenge or threats to generate against.
- existing_catalog — the current state of the catalog (may be empty initially).
</context>

<workflow>
Work in a generate → audit → fix loop. The loop ends only when gap_analysis
returns STOP.

Read the architecture, internalize the assumptions and controls, and generate
an initial batch of threats across the STRIDE categories. Then call
gap_analysis.

Each gap_analysis result either returns STOP (catalog is complete) or CONTINUE
with priority actions describing what's missing, miscalibrated, or invalid.
Address the findings — add threats to fill gaps, delete threats that were
flagged — and call gap_analysis again. Repeat until STOP.

When the loop ends, provide a brief summary: total threat count, STRIDE
distribution, and any observations about the architecture's risk posture.
</workflow>

<tool_usage>
add_threats — accepts a list of threat objects. Batch multiple threats into a
single call rather than adding them one at a time. Each threat object includes:
target, source, stride_category, description, prerequisites, attack_vector,
impact_description, likelihood, impact, and mitigations.

delete_threats — removes threats by ID. Use for hallucinations, duplicates, or
threats flagged as invalid.

gap_analysis — evaluates the current catalog against the architecture and
returns STOP or CONTINUE with specific findings. Call this after every batch of
changes, not only at the end.

When correcting an existing threat, add the new version before deleting the old
one so there's no coverage gap during the transition.
</tool_usage>

<quality_guidance>
These aren't rigid formulas — they're calibration principles. Use your judgment,
but if you deviate, have a clear reason grounded in the architecture.

Respecting assumptions:
Assumptions stated in the architecture description are not attack surface — they
are guardrails for what threats are valid. If the architecture states "all
inter-service communication uses mTLS," do not generate an eavesdropping threat
on internal service-to-service traffic that assumes plaintext communication. If
it states "the database accepts connections only from the application subnet,"
do not generate a direct-access threat from the internet against that database.
A threat that contradicts a stated assumption is a hallucination, not a
finding — it describes an attack against a system that doesn't exist. However,
threats that target the assumptions themselves are valid when realistic: an
attacker compromising the mTLS certificate authority, or a misconfigured
security group that breaks the subnet isolation, are threats to the controls
that uphold the assumption, not contradictions of it.

Likelihood calibration:
Internet-facing components (public APIs, web UIs, unauthenticated endpoints)
should generally receive High likelihood. These are under constant automated
attack, and underscoring that reality is important for the consuming security
team. Score lower only if the architecture description gives you a concrete
reason to (e.g., the endpoint is behind a WAF with strict rate limiting and the
threat requires sustained interaction).

Impact calibration:
Components storing PII, financial data, or credentials should generally receive
High or Critical impact for tampering and information disclosure threats.
Downgrade only when the architecture explicitly describes a control that
materially reduces the blast radius.

Target specificity:
Every target field should name a single, specific component exactly as it
appears in the architecture. "Orders API" or "S3 Invoice Bucket" — not
"The System" or "Backend."

Description format:
Threat descriptions follow a standardized grammar so the catalog is consistent
and machine-parseable. Use this structure:

  "[source], [prerequisites], can [attack vector], which leads to [impact],
   negatively impacting [target]."

The values in the sentence must match the corresponding structured fields in
the threat object. This grammar exists because it forces every description to
name a concrete attacker, a realistic precondition, a specific technique, and
a traceable impact — which prevents vague or hand-wavy threats from slipping
into the catalog.

Mitigation quality:
Every mitigation should name a specific, implementable technical control.
"Use parameterized queries for all database calls in the Orders API" is useful.
"Follow security best practices" is not — it gives the security team nothing to
act on.

Shared responsibility:
Include threats from customer-controlled misconfigurations (public storage
buckets, weak IAM policies, unpatched instances). Exclude threats that fall
under the cloud provider's physical or platform-level responsibility.

Architecture grounding:
Generate only threats that trace to real components and real data flows in the
architecture. Architecture-specific threats ("SQL injection via the file upload
endpoint's metadata parser") are what make this catalog valuable. Generic
threats ("generic malware infection") will be caught by gap analysis and
deleted — save yourself the round trip.

Exact value matching for target and source:
target: Must exactly match one of the enum values provided in the add_threats
tool schema. Copy the value verbatim — do not paraphrase, abbreviate, or
modify asset names. Values that don't match will be rejected.

source: Must exactly match one of the enum values provided in the add_threats
tool schema. Copy the value verbatim from the threat source categories.
Values that don't match will be rejected.
</quality_guidance>"""
    )

    if instructions:
        prompt += f"\n\nAdditional Instructions:\n{instructions}"

    # Build content with conditional cache points (Bedrock only)
    # For OpenAI, caching is handled automatically
    if MODEL_PROVIDER == "bedrock":
        content = [
            {"type": "text", "text": prompt},
            {"cachePoint": {"type": "default"}},
        ]
        return SystemMessage(content=content)
    else:
        return SystemMessage(content=prompt)


def structure_prompt(data) -> str:
    return f"""You are an helpful assistant whose goal is to to convert the response from your colleague
     to the desired structured output. The response is provided within <response> \n
     <response>
     {data}
     </response>
     """
