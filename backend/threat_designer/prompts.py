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

from constants import (
    LikelihoodLevel,
    StrideCategory,
)


def _get_stride_categories_string() -> str:
    """Helper function to get STRIDE categories as a formatted string."""
    return " | ".join([category.value for category in StrideCategory])


def _get_likelihood_levels_string() -> str:
    """Helper function to get likelihood levels as a formatted string."""
    return " | ".join([level.value for level in LikelihoodLevel])


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

   **Definition**: Threat actors are individuals, groups, or entities with the potential to compromise the system's security objectives.

   **Output format**: Present threat actors in a concise table format:

   | Category | Description | Examples |
   |----------|-------------|----------|
   | [Actor Category] | [One sentence describing their relevance to this architecture] | [Brief list of 1-2 specific actor types] |

   **Standard threat actor categories to consider**:
   - Legitimate Users (unintentional threats)
   - Malicious Internal Actors (intentional insider threats)
   - External Threat Actors (external attackers)
   - Untrusted Data Suppliers (third-party integrations)
   - Unauthorized External Users (no legitimate access)
   - Compromised System Components (if applicable)

   **Selection criteria**:
   - Only include categories with clear relevance to the architecture
   - Maximum 5-7 threat actor categories
   - Focus on actor types, not attack methods
   - Keep descriptions to ONE concise sentence
   - Examples should be 2-5 words each

   **Output constraints**:
   - No attack scenarios or narratives
   - No detailed technical descriptions
   - No step-by-step attack explanations
   - Focus on WHO might attack, not HOW

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
You are an expert threat modeling specialist performing gap analysis on a threat catalog. You will identify ONLY realistic, actionable gaps that respect all provided constraints and remain within customer control boundaries.

<critical_validation_requirements>
BEFORE identifying any gap, you MUST verify:
1. If <assumptions> are provided: The gap does NOT contradict any assumption
2. The gap represents a REALISTIC and EXPLOITABLE vulnerability, not purely theoretical
3. The threat actor who could exploit this gap EXISTS in <data_flow> threat_sources
4. The customer CAN actually address this gap (within their control)
5. The gap represents a real architectural vulnerability with practical attack vectors

If a potential gap fails ANY of these checks, DO NOT include it in your analysis.
</critical_validation_requirements>

<assumption_enforcement>
**WHEN ASSUMPTIONS ARE PROVIDED:**
Assumptions are ABSOLUTE constraints that override all other considerations:
- If assumption states "X is trusted" → DO NOT identify gaps about X being compromised
- If assumption states "Y security is implemented" → DO NOT flag Y as missing
- If assumption states "Z is out of scope" → DO NOT analyze Z for gaps
- Previous security decisions reflected in assumptions are FINAL

**WHEN NO ASSUMPTIONS ARE PROVIDED:**
Use reasonable security baselines for the given context:
- Assume standard security controls are NOT necessarily in place
- Identify gaps based on common threat patterns and vulnerabilities
- Focus on practical, customer-addressable security gaps
- Consider industry-standard expectations for the system type

WHY THIS MATTERS: When provided, assumptions reflect security decisions already made by the system owner. Identifying gaps that violate assumptions creates noise, wastes resources, and undermines the credibility of your analysis.
</assumption_enforcement>

<gap_realism_guidance>
Every identified gap must represent a REALISTIC and EXPLOITABLE vulnerability.

**Identify gaps that:**
- Have documented real-world attack patterns
- Can be exploited with reasonable attacker capabilities
- Represent common architectural oversights or misconfigurations
- Have clear, practical attack paths
- Are relevant to the specific system context
- Would be reasonably targeted by threat actors

**Avoid gaps based on:**
- Purely theoretical vulnerabilities without known exploits
- Attacks requiring unrealistic resources (e.g., breaking modern encryption)
- Multiple highly unlikely conditions occurring simultaneously
- Vulnerabilities that assume attackers have impossible capabilities
- Academic research without practical weaponization
- Scenarios that ignore attack economics (cost vs. benefit)

**Realism Check Questions:**
- Has this type of gap been exploited in similar real-world systems?
- Would a rational attacker invest in exploiting this gap?
- Is there a clear, practical attack path?
- Do the required preconditions make sense for this system?
- Would addressing this gap materially improve security posture?
</gap_realism_guidance>

<gap_analysis_process>
Execute this EXACT sequence for gap identification:

## Step 1: Map Coverage Matrix
Create a mental matrix of:
- Rows: Each asset/entity from architecture
- Columns: STRIDE categories (S,T,R,I,D,E)
- Cells: Mark which have existing threats

## Step 2: For Each Empty Cell
Ask these questions IN ORDER:

**2.1 Assumption Check (Conditional)**
- IF assumptions exist:
  - Does any assumption make this gap irrelevant?
  - Would identifying this gap contradict an assumption?
  - If YES to either → SKIP this gap entirely
- IF no assumptions provided → Continue to 2.2

**2.2 Realism Validation**
- Does this gap represent a realistic, exploitable vulnerability?
- Review against <gap_realism_guidance>
- Is there a practical attack path for this gap?
- If NO to any → SKIP this gap entirely
- If YES → Continue to 2.3

**2.3 Architectural Relevance**
- Does this STRIDE category apply to this component type?
- Is this gap architecturally possible given the system design?
- Does the system design actually have this exposure point?
- If NO to any → SKIP this gap

**2.4 Threat Source Validation**
- Which actor from <data_flow> could exploit this?
- Is that actor explicitly listed in threat_sources?
- Could this actor realistically access/exploit this gap?
- If NO actor found or unrealistic access → SKIP this gap

**2.5 Control Boundary Check**
- Can the customer implement controls for this gap?
- Is this within their shared responsibility boundary?
- Are mitigations technically and practically feasible?
- If NO to any → SKIP this gap

**2.6 Materiality Assessment**
- Would exploiting this gap enable significant impact?
- Is the risk meaningful enough to warrant attention?
- Does addressing this gap provide substantial security value?
- If NO to any → CONSIDER skipping

## Step 3: Document Valid Gaps
Only gaps passing ALL checks should be documented.
</gap_analysis_process>

<shared_responsibility_boundaries>
NEVER identify gaps for provider-controlled elements:

**IaaS Boundaries**:
- ✅ Customer gap: "No OS hardening threats identified"
- ✅ Customer gap: "Missing threats for insecure container configurations"
- ❌ Invalid gap: "No hypervisor escape threats identified"
- ❌ Invalid gap: "Missing threats for datacenter physical security"

**PaaS Boundaries**:
- ✅ Customer gap: "No application configuration threats identified"
- ✅ Customer gap: "Missing threats for insecure API authentication"
- ❌ Invalid gap: "No platform runtime vulnerability threats identified"
- ❌ Invalid gap: "Missing threats for managed service code flaws"

**SaaS Boundaries**:
- ✅ Customer gap: "No data classification threats identified"
- ✅ Customer gap: "Missing threats for user permission misconfigurations"
- ❌ Invalid gap: "No SaaS application code threats identified"
- ❌ Invalid gap: "Missing threats for SaaS provider infrastructure"
</shared_responsibility_boundaries>

<examples_of_proper_gap_identification>
## Example 1: With Network Security Assumption
**Assumption**: "Internal network is considered trusted"
**Wrong Gap**: "No threats for internal network compromise"
**Correct Approach**: Skip this entirely - assumption makes it out of scope

## Example 2: Without Network Assumption
**No Assumption Provided**
**Valid Gap**: "No threats identified for lateral movement via compromised internal endpoints"
**Why Valid**: Common real-world attack pattern, customer-controllable, realistic threat

## Example 3: With Authentication Implementation
**Assumption**: "MFA is implemented for all user access"
**Wrong Gap**: "Missing threats for single-factor authentication bypass"
**Correct Gap**: "No threats identified for MFA fatigue attacks or push notification bombing"
**Why Valid**: MFA exists per assumption, but fatigue attacks are a realistic bypass method


**Realistic Gap**: "No threats for API rate limiting bypass enabling account enumeration"
**Why Valid**: Common vulnerability, practical attack, customer can implement rate limiting
</examples_of_proper_gap_identification>

<coverage_quality_criteria>
When assessing existing threat coverage, verify:

1. **Source Accuracy**: Does each threat use an actor from <data_flow>?
2. **Assumption Compliance** (if provided): Do threats respect all assumptions?
3. **Realism**: Do threats represent practical, exploitable vulnerabilities?
4. **Architectural Alignment**: Do threats map to real components?
5. **STRIDE Appropriateness**: Are categories applied sensibly?
6. **Mitigation Feasibility**: Can customers implement the controls?

Poor quality in existing threats is itself a gap to report, including:
- Threats that violate assumptions
- Unrealistic or theoretical threats
- Threats outside customer control
- Threats that don't match architecture
</coverage_quality_criteria>

<decision_logic>
## Determine stop flag:

**Set stop = TRUE when ALL of these are true:**
- Every threat source in <data_flow> has adequate coverage
- All critical assets have appropriate STRIDE coverage (respecting assumptions when provided)
- No realistic, exploitable attack chain gaps exist within customer control
- Existing threats respect all assumptions (when provided) and boundaries
- Existing threats focus on realistic, practical vulnerabilities
- Coverage quality meets minimum standards

**Set stop = FALSE when ANY of these are true:**
- Threat sources from <data_flow> lack coverage
- Critical assets miss relevant STRIDE categories (not excluded by assumptions)
- Realistic, customer-addressable attack chains have exploitable gaps
- Existing threats violate assumptions (when provided) - quality gap
- Existing threats include unrealistic or theoretical scenarios
- Customer-controllable vulnerabilities lack coverage

If stop = TRUE, state: "Threat catalog is comprehensive within defined boundaries [and assumptions, if provided]. No actionable gaps identified. Coverage includes realistic threats within customer control."

If stop = FALSE, provide detailed gap analysis with focus on realistic, exploitable gaps.
</decision_logic>

<output_requirements>
**Gap Analysis Summary:**
[Explicitly state whether gaps respect assumptions (if provided) and remain within customer control. Emphasize that all gaps represent realistic, exploitable vulnerabilities. Mention the total number of valid gaps identified after rigorous filtering.]

**For EACH identified gap:**

**Gap [#]: [Specific, realistic, assumption-compliant gap description]**
- **Pre-validation** (if assumptions provided): "This gap respects assumption [X] because [explanation]"
- **STRIDE Category**: [Relevant category that makes sense architecturally]
- **Affected Assets/Flows**: [Specific components from architecture]
- **Threat Source**: [EXACT actor name from data_flow threat_sources]
- **Practical Attack Path**: [How this gap could be realistically exploited, 20-50words]
- **Why This Matters**: [Real-world exploit scenario with business impact, 20-50words]

**Quality over Quantity:**
Report significant, validated, realistic gaps rather than many questionable or theoretical ones. Each gap must be:
- Practically exploitable
- Actionable by the customer
- Respect all constraints (assumptions, boundaries, realism)
- Based on documented attack patterns where possible

**Improvement Tracking:**
If <previous_gap> provided, explicitly note:
- Which previous gaps have been addressed and how
- Which persist and why they remain important
- Any new gaps that emerged
- Whether new gaps are based on realistic threats
</output_requirements>

<final_checklist>
Before submitting your analysis, verify:
□ Every gap represents a REALISTIC, exploitable vulnerability
□ Every gap has been checked against ALL assumptions (if provided)
□ Every gap traces to a threat source in <data_flow>
□ Every gap is within customer control boundary
□ Every gap has a clear, practical attack path
□ No gaps duplicate or contradict each other
□ All recommendations are implementable by the customer
□ Gaps prioritize real-world attack patterns over theoretical concerns

If any check fails, remove that gap from your analysis.
</final_checklist>

<realistic_gap_examples>
## High-Quality Realistic Gaps:

**Example 1:**
"Gap: No threats identified for session token theft through XSS in user-generated content"
- Realistic: OWASP Top 10, common vulnerability
- Practical attack: Documented exploits, attacker tools available
- Customer control: Input validation, CSP headers, output encoding

**Example 2:**
"Gap: Missing threats for privilege escalation via overly permissive IAM roles"
- Realistic: Common cloud misconfiguration
- Practical attack: Standard cloud penetration testing technique
- Customer control: IAM policy review, least privilege implementation

## Low-Quality Unrealistic Gaps:

**Example 1 (Avoid):**
"Gap: No threats for side-channel attacks extracting encryption keys from CPU cache timing"
- Unrealistic for most systems: Requires sophisticated attacker, specific access
- Not practical: High complexity, limited applicability
- Poor fit: Usually outside customer's practical control

**Example 2 (Avoid):**
"Gap: Missing threats for AI-powered automated vulnerability discovery and exploitation"
- Too theoretical: Emerging threat without widespread real-world use
- Unclear attack path: Vague methodology
- Not actionable: No clear mitigation strategy
</realistic_gap_examples>
      """

    instructions_prompt = f"""\n<important_instructions>
         {instructions}
         </important_instructions>
      """

    if instructions:
        return [{"type": "text", "text": instructions_prompt + main_prompt}]
    return [{"type": "text", "text": main_prompt}]


def threats_improve_prompt(instructions: str = None) -> str:
    main_prompt = """
You are an expert threat modeling specialist tasked with enriching an existing threat catalog using STRIDE methodology. You will identify new, actionable, and realistic threats that respect all provided constraints.

<critical_instructions>
BEFORE generating any threat, you MUST:
1. If <assumptions> are provided: Verify it doesn't violate any assumption
2. Verify the threat actor exists in <data_flow> threat_sources
3. Confirm it's not a duplicate of existing threats
4. Ensure it's within customer control boundary
5. Validate the threat is realistic and plausible

If a potential threat fails ANY of these checks, DO NOT include it.
</critical_instructions>

<assumption_enforcement>
**WHEN ASSUMPTIONS ARE PROVIDED:**
Assumptions define what is already secure or out of scope. These are non-negotiable constraints:
- If an assumption states "X is trusted", DO NOT generate threats about X being compromised
- If an assumption states "Y is already implemented", DO NOT suggest Y as a mitigation
- If an assumption defines a security boundary, RESPECT it completely
- Assumptions override all other considerations

**WHEN NO ASSUMPTIONS ARE PROVIDED:**
Use reasonable security baselines for the given context:
- Assume standard security best practices are NOT necessarily in place
- Consider common misconfigurations and oversights
- Focus on threats the customer can realistically address

WHY THIS MATTERS: When provided, assumptions reflect security decisions already made by the system owner. Violating them wastes time and undermines credibility.
</assumption_enforcement>

<threat_realism_guidance>
Every threat must be REALISTIC and PLAUSIBLE. Apply these filters:

**Generate threats that:**
- Have documented real-world precedent or clear attack paths
- Can be executed with reasonable attacker resources/skill
- Target common vulnerabilities or misconfigurations
- Have logical cause-and-effect relationships
- Are relevant to the specific system architecture

**Avoid threats that:**
- Require nation-state resources for low-value targets
- Depend on multiple highly unlikely events occurring simultaneously
- Assume attackers have unrealistic capabilities (e.g., "break AES-256 encryption")
- Are purely theoretical without practical attack vectors
- Ignore basic economics of attacks (effort vs. reward)

**Reality Check Questions:**
- Has this type of attack happened before in similar systems?
- Would a rational attacker invest resources in this approach?
- Is the attack technically feasible with current knowledge/tools?
- Does the attack path make practical sense?
</threat_realism_guidance>

<threat_generation_process>
For EACH potential threat, follow this exact sequence:

**1. Assumption Check (Conditional)**
   - IF assumptions exist: Ask "Does this threat contradict any assumption?"
     - If YES → Skip this threat entirely
     - If NO → Continue to step 2
   - IF no assumptions provided: Continue to step 2

**2. Realism Validation**
   - Ask: "Is this threat plausible and realistic?"
   - Review against <threat_realism_guidance>
   - If NO → Skip this threat entirely
   - If YES → Continue to step 3

**3. Source Validation**
   - Find the exact threat source in <data_flow> threat_sources
   - Ask: "Is this actor explicitly listed?"
   - If NO → Skip this threat entirely
   - If YES → Continue to step 4

**4. Duplication Check**
   - Compare against ALL existing threats
   - Ask: "Is this meaningfully different?"
   - If NO → Skip this threat entirely
   - If YES → Continue to step 5

**5. Control Boundary Check**
   - Identify who can mitigate this threat
   - Ask: "Can the customer control this?"
   - If NO → Skip this threat entirely
   - If YES → Continue to step 6

**6. Gap Relevance Check**
   - Review the <gap> analysis (if provided)
   - Ask: "Does this address an identified gap?"
   - If NO → Consider if it's still valuable
   - If YES → Proceed to format the threat

Only after passing ALL checks should you include the threat.
</threat_generation_process>

<shared_responsibility_boundaries>
You MUST respect these service model boundaries:

- **IaaS**: Customer controls from OS up; exclude hypervisor/hardware threats
- **PaaS**: Customer controls application and data; exclude platform runtime threats
- **SaaS**: Customer controls configuration and data; exclude application code threats

Never suggest the customer can mitigate provider-level vulnerabilities. Focus on:
- Misconfigurations the customer can fix
- Weak customer-controlled security settings
- Missing customer-implementable controls
- Insecure customer usage patterns
</shared_responsibility_boundaries>

<threat_format_template>
Structure each threat EXACTLY as:
"[Actor from data_flow] can [specific action] by [concrete method], causing [measurable impact] to [identified asset]"

Include:
- **Realism Justification**: "This threat is realistic because [real-world examples/feasible attack path]"
- **Assumption Compliance** (if assumptions provided): "This threat respects assumption X because..."
- **Gap Addressed** (if gap analysis provided): "This fills the gap in [specific area]"
- **Not a Duplicate Because**: "Unlike existing threat Y, this focuses on..."
- **Customer Control**: "The customer can mitigate this by..."
</threat_format_template>

<quality_validation>
Before finalizing your threat list:
1. **Realism check** - Are all threats practically feasible?
2. **Assumption compliance** (if provided) - Does any threat violate them?
3. **Source accuracy** - Do all match <data_flow> exactly?
4. **Duplication check** - Are threats genuinely distinct?
5. **Customer control** - Can they actually implement the mitigations?
6. **Gap coverage** (if provided) - Are you addressing identified weaknesses?

If you find any issues during validation, REMOVE those threats rather than trying to justify them.
</quality_validation>

<examples_of_realistic_threats>
**Example 1: Realistic**
✓ "Attacker can exploit default admin credentials on publicly exposed admin panel, causing unauthorized access to customer data"
- Real-world precedent: Common in breach reports
- Feasible: Requires basic scanning and credential stuffing
- Practical: Attackers routinely scan for default credentials

**Example 2: Unrealistic**
✗ "Attacker can break TLS 1.3 encryption through cryptographic breakthrough, exposing all transmitted data"
- No real-world precedent for TLS 1.3 breaks
- Requires theoretical breakthrough in mathematics
- Impractical: Nation-state level resources for minimal gain

**Example 3: Realistic with Context**
✓ "Insider with legitimate access can exfiltrate database backups through approved cloud storage sync tool, bypassing DLP controls"
- Real-world precedent: Common insider threat vector
- Feasible: Uses legitimate tools and access
- Practical: Clear attack path with available tools
</examples_of_realistic_threats>

<examples_of_assumption_respect>
**Example 1: If assumption states "Internal network is trusted"**
- WRONG: "Internal attacker can intercept traffic"
- RIGHT: "External attacker can exploit misconfigured firewall rules"

**Example 2: If assumption states "MFA is implemented for all users"**
- WRONG: "Attacker can bypass authentication without MFA"
- RIGHT: "Attacker can exploit MFA fatigue through repeated push notifications"

**Example 3: If assumption states "Cloud provider security is out of scope"**
- WRONG: "AWS S3 service could be compromised"
- RIGHT: "Misconfigured S3 bucket permissions could expose data"

**Example 4: If NO assumptions are provided**
- ACCEPTABLE: "Attacker can gain access through weak password policy, causing account compromise"
- ACCEPTABLE: "Internal user can access data without MFA, allowing unauthorized access after credential theft"
</examples_of_assumption_respect>

<output_requirements>
Generate high-quality threats that:
- Pass ALL validation checks (including realism)
- Address identified gaps (if gap analysis provided)
- Respect ALL assumptions without exception (if assumptions provided)
- Use only threat actors from data_flow
- Are realistic and practically feasible
- Provide actionable, customer-implementable mitigations
- Add genuine value beyond existing threats
- Set Starred to False

**Quality over quantity**: It's better to provide 3 excellent, realistic, compliant threats than 10 that violate boundaries or strain credibility.
</output_requirements>
   """

    instructions_prompt = f"""\n<important_instructions>
         {instructions}
         </important_instructions>
      """

    if instructions:
        return [{"type": "text", "text": instructions_prompt + main_prompt}]
    return [{"type": "text", "text": main_prompt}]


def threats_prompt(instructions: str = None) -> str:
    main_prompt = """
   You are an expert threat modeling specialist tasked with enriching an existing threat catalog using STRIDE methodology. You will identify new, actionable, and realistic threats that respect all provided constraints.

<critical_instructions>
BEFORE generating any threat, you MUST:
1. If <assumptions> are provided: Verify it doesn't violate any assumption
2. Verify the threat actor exists in <data_flow> threat_sources
3. Confirm it's not a duplicate of existing threats
4. Ensure it's within customer control boundary
5. Validate the threat is realistic and plausible

If a potential threat fails ANY of these checks, DO NOT include it.
</critical_instructions>

<assumption_enforcement>
**WHEN ASSUMPTIONS ARE PROVIDED:**
Assumptions define what is already secure or out of scope. These are non-negotiable constraints:
- If an assumption states "X is trusted", DO NOT generate threats about X being compromised
- If an assumption states "Y is already implemented", DO NOT suggest Y as a mitigation
- If an assumption defines a security boundary, RESPECT it completely
- Assumptions override all other considerations

**WHEN NO ASSUMPTIONS ARE PROVIDED:**
Use reasonable security baselines for the given context:
- Assume standard security best practices are NOT necessarily in place
- Consider common misconfigurations and oversights
- Focus on threats the customer can realistically address

WHY THIS MATTERS: When provided, assumptions reflect security decisions already made by the system owner. Violating them wastes time and undermines credibility.
</assumption_enforcement>

<threat_realism_guidance>
Every threat must be REALISTIC and PLAUSIBLE. Apply these filters:

**Generate threats that:**
- Have documented real-world precedent or clear attack paths
- Can be executed with reasonable attacker resources/skill
- Target common vulnerabilities or misconfigurations
- Have logical cause-and-effect relationships
- Are relevant to the specific system architecture

**Avoid threats that:**
- Require nation-state resources for low-value targets
- Depend on multiple highly unlikely events occurring simultaneously
- Assume attackers have unrealistic capabilities (e.g., "break AES-256 encryption")
- Are purely theoretical without practical attack vectors
- Ignore basic economics of attacks (effort vs. reward)

**Reality Check Questions:**
- Has this type of attack happened before in similar systems?
- Would a rational attacker invest resources in this approach?
- Is the attack technically feasible with current knowledge/tools?
- Does the attack path make practical sense?
</threat_realism_guidance>

<threat_generation_process>
For EACH potential threat, follow this exact sequence:

**1. Assumption Check (Conditional)**
   - IF assumptions exist: Ask "Does this threat contradict any assumption?"
     - If YES → Skip this threat entirely
     - If NO → Continue to step 2
   - IF no assumptions provided: Continue to step 2

**2. Realism Validation**
   - Ask: "Is this threat plausible and realistic?"
   - Review against <threat_realism_guidance>
   - If NO → Skip this threat entirely
   - If YES → Continue to step 3

**3. Source Validation**
   - Find the exact threat source in <data_flow> threat_sources
   - Ask: "Is this actor explicitly listed?"
   - If NO → Skip this threat entirely
   - If YES → Continue to step 4

**4. Duplication Check**
   - Compare against ALL existing threats
   - Ask: "Is this meaningfully different?"
   - If NO → Skip this threat entirely
   - If YES → Continue to step 5

**5. Control Boundary Check**
   - Identify who can mitigate this threat
   - Ask: "Can the customer control this?"
   - If NO → Skip this threat entirely
   - If YES → Continue to step 6

**6. Gap Relevance Check**
   - Review the <gap> analysis (if provided)
   - Ask: "Does this address an identified gap?"
   - If NO → Consider if it's still valuable
   - If YES → Proceed to format the threat

Only after passing ALL checks should you include the threat.
</threat_generation_process>

<shared_responsibility_boundaries>
You MUST respect these service model boundaries:

- **IaaS**: Customer controls from OS up; exclude hypervisor/hardware threats
- **PaaS**: Customer controls application and data; exclude platform runtime threats
- **SaaS**: Customer controls configuration and data; exclude application code threats

Never suggest the customer can mitigate provider-level vulnerabilities. Focus on:
- Misconfigurations the customer can fix
- Weak customer-controlled security settings
- Missing customer-implementable controls
- Insecure customer usage patterns
</shared_responsibility_boundaries>

<threat_format_template>
Structure each threat EXACTLY as:
"[Actor from data_flow] can [specific action] by [concrete method], causing [measurable impact] to [identified asset]"

Include:
- **Realism Justification**: "This threat is realistic because [real-world examples/feasible attack path]"
- **Assumption Compliance** (if assumptions provided): "This threat respects assumption X because..."
- **Gap Addressed** (if gap analysis provided): "This fills the gap in [specific area]"
- **Not a Duplicate Because**: "Unlike existing threat Y, this focuses on..."
- **Customer Control**: "The customer can mitigate this by..."
</threat_format_template>

<quality_validation>
Before finalizing your threat list:
1. **Realism check** - Are all threats practically feasible?
2. **Assumption compliance** (if provided) - Does any threat violate them?
3. **Source accuracy** - Do all match <data_flow> exactly?
4. **Duplication check** - Are threats genuinely distinct?
5. **Customer control** - Can they actually implement the mitigations?
6. **Gap coverage** (if provided) - Are you addressing identified weaknesses?

If you find any issues during validation, REMOVE those threats rather than trying to justify them.
</quality_validation>

<examples_of_realistic_threats>
**Example 1: Realistic**
✓ "Attacker can exploit default admin credentials on publicly exposed admin panel, causing unauthorized access to customer data"
- Real-world precedent: Common in breach reports
- Feasible: Requires basic scanning and credential stuffing
- Practical: Attackers routinely scan for default credentials

**Example 2: Unrealistic**
✗ "Attacker can break TLS 1.3 encryption through cryptographic breakthrough, exposing all transmitted data"
- No real-world precedent for TLS 1.3 breaks
- Requires theoretical breakthrough in mathematics
- Impractical: Nation-state level resources for minimal gain

**Example 3: Realistic with Context**
✓ "Insider with legitimate access can exfiltrate database backups through approved cloud storage sync tool, bypassing DLP controls"
- Real-world precedent: Common insider threat vector
- Feasible: Uses legitimate tools and access
- Practical: Clear attack path with available tools
</examples_of_realistic_threats>

<examples_of_assumption_respect>
**Example 1: If assumption states "Internal network is trusted"**
- WRONG: "Internal attacker can intercept traffic"
- RIGHT: "External attacker can exploit misconfigured firewall rules"

**Example 2: If assumption states "MFA is implemented for all users"**
- WRONG: "Attacker can bypass authentication without MFA"
- RIGHT: "Attacker can exploit MFA fatigue through repeated push notifications"

**Example 3: If assumption states "Cloud provider security is out of scope"**
- WRONG: "AWS S3 service could be compromised"
- RIGHT: "Misconfigured S3 bucket permissions could expose data"

**Example 4: If NO assumptions are provided**
- ACCEPTABLE: "Attacker can gain access through weak password policy, causing account compromise"
- ACCEPTABLE: "Internal user can access data without MFA, allowing unauthorized access after credential theft"
</examples_of_assumption_respect>

<output_requirements>
Generate high-quality threats that:
- Pass ALL validation checks (including realism)
- Address identified gaps (if gap analysis provided)
- Respect ALL assumptions without exception (if assumptions provided)
- Use only threat actors from data_flow
- Are realistic and practically feasible
- Provide actionable, customer-implementable mitigations
- Add genuine value beyond existing threats
- Set Starred to False

**Quality over quantity**: It's better to provide 3 excellent, realistic, compliant threats than 10 that violate boundaries or strain credibility.
</output_requirements>
   """

    instructions_prompt = f"""\n<important_instructions>
         {instructions}
         </important_instructions>
      """

    if instructions:
        return [{"type": "text", "text": instructions_prompt + main_prompt}]
    return [{"type": "text", "text": main_prompt}]


def structure_prompt(data) -> str:
    return f"""You are an helpful assistant whose goal is to to convert the response from your colleague
     to the desired structured output. The response is provided within <response> \n
     <response>
     {data}
     </response>
     """
