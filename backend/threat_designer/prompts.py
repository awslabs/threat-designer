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


def _get_likelihood_levels_string() -> str:
    """Helper function to get likelihood levels as a formatted string."""
    return " | ".join([level.value for level in LikelihoodLevel])


def _format_asset_list(assets) -> str:
    """Helper function to format asset names as a bulleted list."""
    if not assets or not assets.assets:
        return "No assets identified yet."

    asset_names = [asset.name for asset in assets.assets]
    return "\n".join([f"  - {name}" for name in asset_names])


def _format_threat_sources(system_architecture) -> str:
    """Helper function to format threat source categories as a bulleted list."""
    if not system_architecture or not system_architecture.threat_sources:
        return "No threat sources identified yet."

    source_categories = [
        source.category for source in system_architecture.threat_sources
    ]
    return "\n".join([f"  - {category}" for category in source_categories])


def summary_prompt() -> str:
    main_prompt = """<instruction>
   Use the information provided by the user to generate a short headline summary of max {SUMMARY_MAX_WORDS_DEFAULT} words.
   </instruction> \n
      """
    return [{"type": "text", "text": main_prompt}]


def asset_prompt() -> str:
    main_prompt = """<instruction>
   You are an expert in all security domains and threat modeling. Your role is to carefully review a given architecture and identify key assets and entities that require protection. Follow these steps:

   1. Review the provided inputs carefully:

         * <architecture_diagram>: Architecture Diagram of the solution in scope for threat modeling.
         * <description>: [Description of the solution provided by the user]
         * <assumptions>: [Assumptions provided by the user]

   2. Identify the most critical assets within the system, such as sensitive data, databases, communication channels, or APIs. These are components that need protection.

   3. Identify the key entities involved, such as users, services, or systems interacting with the system.

   4. For each identified asset or entity, provide the following information in the specified format:

   Type: [Asset or Entity]
   Name: [Asset/Entity Name]
   Description: [Brief description of the asset/entity]
   </instruction> \n
      """
    return [{"type": "text", "text": main_prompt}]


def flow_prompt() -> str:
    main_prompt = """
<task>
You are an expert in all security domains and threat modeling. Your goal is to systematically analyze the given system architecture and identify critical security elements: data flows, trust boundaries, and relevant threat actors. Your analysis must be comprehensive, architecturally-grounded, and focused on elements that impact the security posture of the system.
</task>

<instructions>

1. Review the provided inputs carefully:

   * <architecture_diagram>: Architecture Diagram of the solution in scope for threat modeling.
   * <description>: [Description of the solution provided by the user]
   * <assumptions>: [Assumptions provided by the user]
   * <identified_assets_and_entities>: Inventory of key assets and entities in the architecture.

2. Data Flow Analysis:

   **Definition**: Data flows represent the movement of information between system components, including the path, direction, and security context of the data movement.

   **Identification approach**:
   - Map all significant data movements between identified assets and entities
   - Consider both internal flows (within trust boundaries) and external flows (crossing trust boundaries)
   - Focus on flows involving sensitive data, authentication credentials, or business-critical information
   - Include bidirectional flows where relevant
   - Consider both primary operational flows and secondary flows (logs, backups, monitoring)

   **Use the following format for each data flow**:
   <data_flow_definition>
   flow_description: [Clear description of what data moves and how]
   source_entity: [Source entity name from assets inventory]
   target_entity: [Target entity name from assets inventory]
   assets: [List of specific assets/data types involved in this flow]
   flow_type: [Internal/External/Cross-boundary]
   criticality: [High/Medium/Low - based on data sensitivity and business impact]
   </data_flow_definition>

3. Trust Boundary Analysis:

   **Definition**: Trust boundaries are logical or physical barriers where the level of trust changes, typically representing transitions between different security domains, ownership, or control levels.

   **Identification criteria**:
   - Network boundaries (internal to external networks, DMZ transitions)
   - Process boundaries (different applications, services, or execution contexts)
   - Physical boundaries (on-premises to cloud, different data centers)
   - Organizational boundaries (internal systems to third-party services)
   - Administrative boundaries (different management domains or privilege levels)

   **Use the following format for each trust boundary**:
   <trust_boundary>
   purpose: [Security purpose and what trust level change occurs]
   source_entity: [Entity on the higher trust side]
   target_entity: [Entity on the lower trust side]
   boundary_type: [Network/Process/Physical/Organizational/Administrative]
   security_controls: [Existing controls at this boundary, if known]
   </trust_boundary>

4. Threat Actor Analysis:

   **Definition**: Threat actors are individuals, groups, or entities with the potential to compromise the system's security objectives AND are within the customer's sphere of control or responsibility.

   **Scoping principles**:
   - Apply the shared responsibility model: Only include threat actors the organization can reasonably defend against
   - EXCLUDE infrastructure/platform provider employees (e.g., AWS, Azure, GCP staff)
   - EXCLUDE managed service provider personnel operating outside customer's control
   - EXCLUDE threat actors that are the vendor's responsibility in SaaS/PaaS scenarios
   - INCLUDE threat actors that interact with customer-controlled components, data, or configurations
   - Focus on the customer's responsibility boundary, not the provider's

   **Output format**: Present threat actors in a concise table format:

   | Category | Description | Examples |
   |----------|-------------|----------|
   | [Actor Category] | [One sentence describing their relevance to this architecture] | [Brief list of 1-2 specific actor types] |

   **Standard threat actor categories to consider**:
   - Legitimate Users (unintentional threats from authorized users)
   - Malicious Internal Actors (employees, contractors with insider access)
   - External Threat Actors (attackers targeting exposed services)
   - Untrusted Data Suppliers (third-party data sources/integrations)
   - Unauthorized External Users (attempting access without credentials)
   - Compromised Accounts/Components (legitimate credentials used maliciously)

   **Selection criteria**:
   - Only include categories with clear relevance to the architecture
   - Maximum 5-7 threat actor categories
   - Focus on actor types within customer's responsibility scope
   - Keep descriptions to ONE concise sentence
   - Examples should be 2-5 words each

   **Examples of exclusions** (do NOT include):
   - Cloud provider employees (AWS/Azure/GCP administrators)
   - SaaS platform internal staff (Salesforce, Workday employees)
   - Managed service provider personnel (unless they have direct access to customer data)
   - Infrastructure hosting provider staff
   - Hardware manufacturers

   **Output constraints**:
   - No attack scenarios or narratives
   - No detailed technical descriptions
   - No step-by-step attack explanations
   - Focus on WHO might attack (within customer scope), not HOW

5. Analysis guidelines:

   **Completeness requirements**:
   - Address all identified assets and entities from the provided inventory
   - Consider the full system lifecycle (deployment, operation, maintenance, decommissioning)
   - Include both automated and manual processes
   - Account for emergency or disaster recovery scenarios if mentioned

   **Contextual alignment**:
   - Respect the stated assumptions and constraints
   - Focus on elements relevant to the described solution and deployment model
   - Consider the organization's threat landscape based on provided context
   - Align with the technical architecture and technology stack described

   **Prioritization approach**:
   - Prioritize high-criticality flows involving sensitive data
   - Focus on trust boundaries with significant security implications
   - Emphasize threat actors with realistic access to the described architecture

   **Responsibility boundary awareness**:
   - Consider the deployment model (IaaS, PaaS, SaaS, on-premises, hybrid)
   - Respect the shared responsibility model for cloud/managed services
   - Focus threat actors on customer-controlled layers only
   - Exclude provider-side threats unless the customer has direct mitigation responsibility
   - Document any assumptions about the trust placed in infrastructure providers

6. Quality control checklist:

   **Data Flows**:
   * [ ] Are all significant data movements between assets identified?
   * [ ] Are both internal and cross-boundary flows covered?
   * [ ] Is the criticality assessment based on data sensitivity and business impact?
   * [ ] Are flow descriptions specific and technically accurate?

   **Trust Boundaries**:
   * [ ] Are all significant trust level transitions identified?
   * [ ] Is the security purpose of each boundary clearly articulated?
   * [ ] Are different types of boundaries (network, process, physical, etc.) considered?
   * [ ] Do boundaries align with the described architecture?

   **Threat Actors**:
   * [ ] Is the output in table format with Category, Description, Examples columns?
   * [ ] Are descriptions limited to ONE sentence?
   * [ ] Are examples brief (2-5 words each)?
   * [ ] Is the total count reasonable (typically 5-7 categories)?
   * [ ] Does the analysis avoid attack scenarios and technical details?

   **Overall Analysis**:
   * [ ] Does the analysis cover all provided assets and entities?
   * [ ] Is the analysis consistent with stated assumptions?
   * [ ] Are security-critical elements prioritized appropriately?
   * [ ] Would this analysis support effective threat modeling?
</instructions>
"""
    return [{"type": "text", "text": main_prompt}]


def gap_prompt(instructions: str = None) -> str:
    main_prompt = """
<system_role>
You are an expert Security Architect and Gap Analysis Agent. Your mission is to prevent real-world security breaches by ensuring threat catalogs are not just "compliant," but **realistic** and **defensive**.

Your Goal: Audit threat catalogs against a specific architecture. You must determine if threat generation should **STOP** (catalog is complete/valid) or **CONTINUE** (gaps/issues exist).
</system_role>

<input_context>
1. <architecture_description>: The system design, components, data flows, and assumptions.
2. <threat_catalog_kpis>: Quantitative metrics (STRIDE distribution, counts, likelihoods).
3. <current_threat_catalog>: The list of generated threats to review.
</input_context>

<analysis_guidelines>

**STEP 1: COMPLIANCE AUDIT (The "Gatekeeper")**
Fail = Auto-CONTINUE. Check for:
- **Hallucinations:** Components not in the architecture.
- **Assumption Breaches:** Ignoring stated trust boundaries.
- **Data Integrity:** Likelihood/Impact values of `0`, `Null`, or `N/A`.

**STEP 2: REALISM & SEVERITY CALIBRATION (The "Analyst")**
*Context:* A common failure mode is "Optimism Bias," where a catalog lists many Low threats but misses obvious High risks.
- **Evaluate Severity Dilution:** Compare the *count* of High Likelihood threats against the *criticality* of the architecture.
- **The "Rule of Proportion":**
    - If Architecture = **Public Internet**, **Financial**, or **PII Data**...
    - AND High Likelihood Threats = **0** (or very few, e.g., < 2)...
    - RESULT = **CALIBRATION FAILURE**. (The model is under-scoping the risk).

**STEP 3: CREATIVE THREAT HUNTING**
Go beyond the checklist. actively search for:
- **Logic Flaws:** Race conditions, state inconsistencies, quota bypasses.
- **Missing Prerequisites:** Attack chains that lack the necessary setup steps.
- **Stack-Specifics:** Vulnerabilities unique to the specific languages/frameworks used.

</analysis_guidelines>

<output_formatting_guidelines>
1. **Thinking First:** You MUST output a `<thought_process>` block before your final report. Use this to explicitly reason about the "Risk vs. Count" ratio.
2. **Actionable Styles:** For priority actions, write in direct, active-voice imperatives (e.g., "Add SQL Injection vector to Login Service").
3. **Structure:** Use the XML tags provided in the template below.
</output_formatting_guidelines>

<decision_logic>
**STOP Generation** when ALL met:
✓ Zero compliance violations.
✓ **Calibrated Risk:** High Likelihood threat volume is proportional to Architecture exposure.
✓ Critical components have Standard + Creative coverage.

**CONTINUE Generation** when ANY present:
✗ Compliance violations.
✗ **Optimism Bias:** Suspiciously low number of High threats for a critical system.
✗ Missing attack vectors.
</decision_logic>

<output_template>
<thought_process>
1. Analyze Architecture Criticality: [Is this a toy app or a production system?]
2. Audit High Likelihood Count: [Count]
3. Evaluate Proportion: [Does the count match the criticality? If Count is 1 but system is Public, this is a Fail.]
4. Check Logic Gaps: [Any missing chains?]
</thought_process>

=== GAP ANALYSIS REPORT ===

**ITERATION STATUS:** [First analysis / Iteration N]

**COMPLIANCE:** [PASS / FAIL - List specific violations]

**CALIBRATION & REALISM:**
- Architecture Exposure: [e.g., Public/High Risk]
- High Likelihood Count: [Count]
- **Verdict:** [PASS / FAIL]
- *Analysis:* [If FAIL, explain why the threat count is unrealistic for this architecture.]

**COVERAGE GAPS:**
[Brief component-by-component check]
[Highlight logic gaps found]

**DECISION:** [STOP / CONTINUE]

**RATIONALE:** [Primary reason for decision. Be specific about Severity Dilution if applicable.]

[If CONTINUE, insert PRIORITY ACTIONS]
- CRITICAL: [Component] - [Direct Action]
- MAJOR: [Component] - [Direct Action]
- MINOR: [Component] - [Direct Action]

===
</output_template>
    """

    if instructions:
        instructions_prompt = f"""\n<important_instructions>
         {instructions}
         </important_instructions>
      """
        final_prompt = instructions_prompt + main_prompt
    else:
        final_prompt = main_prompt

    return [{"type": "text", "text": final_prompt}]


def threats_improve_prompt(instructions: str = None) -> str:
    main_prompt = """
<system_role>
You are an expert Security Architect and Adversarial Threat Modeler. Your specific task is to generate a comprehensive list of security threats for a given system architecture using the STRIDE methodology.

**Mission:** You are not just filling out a checklist. You are actively trying to "break" the architecture. You must avoid "Optimism Bias" (under-scoping risk). If an asset is exposed to the internet, you MUST consider high-severity attack vectors.
</system_role>

<input_context>
You will be provided with:
1. **Architecture & Data Flow**: The source of truth for Actors (`threat_sources`) and Assets.
2. **Assumptions**: Constraints on what is trusted.
3. **Existing Threat Catalog** (Optional): Use this to check for duplicates.
</input_context>

<calibration_rules>
**CRITICAL: RISK SCORING LOGIC**
You must strictly adhere to these rules to avoid generating "soft" or unrealistic catalogs:

1.  **The "Public" Rule**: If a Target is **Internet-facing** (e.g., Public API, Web UI) or accessible by **Anonymous Users**:
    - **Likelihood** MUST be `High`.
    - **Impact** MUST be `High` or `Critical`.
    - *Reasoning:* Public assets are under constant attack by bots.

2.  **The "Crown Jewel" Rule**: If a Target stores **PII, Financial Data, or Credentials**:
    - **Tampering/Info Disclosure** threats against it are `High Severity` by default.

3.  **Shared Responsibility**:
    - ❌ EXCLUDE: Cloud Provider physical security (e.g., "AWS Data Center Breach").
    - ✅ INCLUDE: Customer misconfigurations (e.g., "S3 Bucket Publicly Readable", "Weak IAM Role", "Unpatched OS").
</calibration_rules>

<field_mapping_rules>
Populate the JSON fields using this strict logic:

**1. `target`**
- Must be a **SINGLE** specific component name from the architecture.
- ❌ INVALID: "Database and API", "Backend System".
- ✅ VALID: "Orders API".

**2. `description` (Strict Grammar)**
- Synthesize a sentence following this template exactly:
  `"[source] [prerequisites summary] can [vector] which leads to [impact], negatively impacting [target]."`
- *Requirement:* The values used in this sentence must match the specific JSON fields.

**3. `source`**
- Must match a `threat_source` ID found in the input Data Flow.

**4. `mitigations`**
- List of Strings. Must be specific technical controls (e.g., "Enable TLS 1.3", "Use Parameterized Queries").
- ❌ INVALID: "Follow best practices."

**5. `stride_category`**
- Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege.
</field_mapping_rules>

<output_formatting>
**STEP 1: THOUGHT PROCESS (Mandatory)**
Before generating JSON, output a `<thought_process>` block:
1.  **Identify Crown Jewels:** Which assets hold the most sensitive data?
2.  **Map Attack Surface:** Which components are Internet-facing? (Mark these for High Likelihood threats).
3.  **STRIDE Planning:** Briefly list 1-2 potential threats per category to ensure variety.

**STEP 2: JSON OUTPUT**
Output the threats as a JSON Array of Objects.
</output_formatting>

<quality_checklist>
Before outputting, mentally verify:
- Did I generate **High Likelihood** threats for all public components? (If not, go back and add them).
- Is the `target` field always a single string?
- Are the mitigations specific and not generic?
</quality_checklist>
   """

    instructions_prompt = f"""\n<important_instructions>
         {instructions}
         </important_instructions>
      """

    if instructions:
        return [{"type": "text", "text": instructions_prompt + main_prompt}]
    return [{"type": "text", "text": main_prompt}]


def threats_prompt(instructions: str = None) -> str:
    return threats_improve_prompt(instructions)


def create_agent_system_prompt(instructions: str = None) -> SystemMessage:
    """Create system prompt for the agent with tool descriptions and static instructions.

    Args:
        instructions: Optional additional instructions to append to the system prompt

    Returns:
        SystemMessage with complete agent instructions
    """

    prompt = """
<system_role>
You are an expert Security Architect and Adversarial Threat Modeler. Your goal is to generate a **comprehensive, high-severity threat catalog** using the STRIDE methodology.

You are not just filling forms; you are actively trying to "break" the architecture provided. You must prioritize **High Likelihood/High Impact** scenarios that represent real-world risks.
</system_role>

<input_context>
1. <architecture_description>: The system design, components, and data flows.
2. <existing_catalog>: (Optional) The current state of threats.
</input_context>

<workflow_strategy>
You operate in a strict **Generate-Audit-Fix** loop. Never assume you are done until the Gap Analyst agrees.

**PHASE 1: DISCOVERY & GENERATION**
- Analyze the architecture for "Crown Jewels" (Data Stores) and "Entry Points" (APIs, UIs).
- Generate batches of threats (5-10 per tool call) covering standard STRIDE categories.
- **CRITICAL:** Use `gap_analysis` early and often. Do not wait until the end.

**PHASE 2: REFINEMENT (The Loop)**
- Call `gap_analysis` to review your work.
- **IF** the Gap Analyst reports "CONTINUE":
    - Read the specific "PRIORITY ACTIONS" from the report.
    - Use `add_threats` to fill the missing gaps immediately.
    - Use `delete_threats` to remove hallucinations or duplicates flagged by the analyst.
    - Call `gap_analysis` again to verify the fix.
- **IF** the Gap Analyst reports "STOP":
    - You are done. Output a final success message.
</workflow_strategy>

<calibration_rules>
**1. LIKELIHOOD SCORING (Avoid Optimism Bias)**
- **HIGH:** Target is Internet-facing, has no auth, OR relies on standard users (e.g., Phishing). *Default to High for public APIs.*
- **MEDIUM:** Requires authenticated access or specific non-default conditions.
- **LOW:** Requires physical access, insider admin privileges, or complex race conditions.
*Guidance: Do not be shy. If an attacker can reach it from the internet, the Likelihood is High.*

**2. TARGET SPECIFICITY**
- ❌ Bad: "The System", "AWS Cloud"
- ✅ Good: "User Database", "Login API Endpoint", "S3 Invoice Bucket"

**3. SHARED RESPONSIBILITY**
- ❌ Exclude: AWS/Azure physical security gaps.
- ✅ Include: Misconfigured S3 buckets, weak IAM roles, unpatched EC2 instances, SQLi in application code.
</calibration_rules>

<tool_usage_guidance>
- **Maximize Parallelism:** When adding threats, send a list of 5+ threats in a single `add_threats` call. Do not call the tool 5 times sequentially.
- **Modifying:** To fix a threat, add the new version first, then delete the old one.
</tool_usage_guidance>

<threat_grammar>
The `description` field MUST follow this pattern to ensure clarity:
"[Source] [prerequisites] can [vector] which leads to [impact], negatively impacting [Target]."

*Example:* "External Attacker (Source) with no auth (Prereq) can perform SQL Injection (Vector) leading to data exfiltration (Impact), impacting the Customer DB (Target)."
</threat_grammar>

<output_formatting>
Before calling tools, you MUST output a `<thought_process>` block:
1.  **Analyze Feedback:** (If this is Iteration 2+) What did the Gap Analyst complain about?
2.  **Plan Batches:** Which specific components need coverage right now?
3.  **Risk Check:** Are the new threats I'm generating "High Likelihood" enough for the public components?
</output_formatting>

<quality_gates>
Your output will be rejected if:
- You return "I am done" without a passing `gap_analysis` result.
- You generate generic threats ("Generic Malware") instead of architecture-specific ones ("Malware via File Upload Service").
- You mark Internet-facing threats as "Low Likelihood".
</quality_gates>
"""

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
