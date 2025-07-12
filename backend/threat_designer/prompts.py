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

from constants import (THREAT_DESCRIPTION_MAX_WORDS,
                       THREAT_DESCRIPTION_MIN_WORDS, LikelihoodLevel,
                       StrideCategory)


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

      **Definition**: Threat actors are individuals, groups, or entities with the intent, capability, and opportunity to compromise the system's security objectives.

      **Standard threat actor categories to consider**:
      - **Internal users**: Employees, contractors, business partners with legitimate access
      - **External attackers**: Cybercriminals, hacktivists, competitors without legitimate access
      - **Supply chain actors**: Vendors, service providers, software suppliers in the ecosystem
      - **Physical access actors**: Those with physical proximity to infrastructure

      **Assessment criteria**:
      - **Intent**: Motivation to target this specific system or organization
      - **Capability**: Technical skills and resources to execute attacks
      - **Opportunity**: Access points and attack surfaces available in the architecture

      **Use the following format for each relevant threat actor category**:
      <threat_actor>
      category: [Threat actor category from standard list]
      description: [Why this actor is relevant to the described architecture]
      intent: [Likely motivations for targeting this system]
      capability: [Technical capabilities relevant to this architecture]  
      opportunity: [Access points or attack surfaces they could exploit]
      examples: [Specific examples relevant to the system context]
      </threat_actor>

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
      * [ ] Are only architecturally-relevant threat actors included?
      * [ ] Is the intent-capability-opportunity assessment realistic?
      * [ ] Are examples specific to the system context?
      * [ ] Are threat actors aligned with the organization's likely threat landscape?

      **Overall Analysis**:
      * [ ] Does the analysis cover all provided assets and entities?
      * [ ] Is the analysis consistent with stated assumptions?
      * [ ] Are security-critical elements prioritized appropriately?
      * [ ] Would this analysis support effective threat modeling?
   </instructions>
      """

    return [{"type": "text", "text": main_prompt}]


def gap_prompt() -> str:
    main_prompt = f"""
   <task>
   You are an expert in all security domains and threat modeling. Your goal is to validate the comprehensiveness of a provided threat catalog for a given architecture. You'll assess the threat model against the STRIDE framework and identify any gaps in coverage, ensuring the threat catalog reflects plausible threats grounded in the described architecture and context.
   </task>

   <instructions>

   1. Review the inputs carefully:

      * <architecture_diagram>: Architecture Diagram of the solution in scope for threat modeling.
      * <identified_assets_and_entities>: Inventory of key assets and entities in the architecture.
      * <data_flow>: Descriptions of data movements between components.
      * <threats>Threat Catalog</threats>: The existing threat catalog to be assessed.
      * <description>: Contextual overview of the system (if provided).
      * <assumptions>: Security assumptions and boundary considerations (if provided).
      * <previous_gap>: Previous gap analysis, if available.

   2. Assessment framework and criteria:

      * Use the **STRIDE model** as your assessment framework: {_get_stride_categories_string()}.
      
      **STRIDE Categories Defined:**
      - **Spoofing**: Impersonating users, systems, or services
      - **Tampering**: Unauthorized modification of data, systems, or communications
      - **Repudiation**: Denying actions, transactions, or events without proof
      - **Information Disclosure**: Unauthorized access to confidential information
      - **Denial of Service**: Preventing legitimate access to resources or services
      - **Elevation of Privilege**: Gaining unauthorized access levels or permissions

      **Threat Actor Coverage Assessment:**
      Verify coverage across these threat actor types where architecturally relevant:
      - **Internal users**: Malicious or compromised employees, contractors, or insiders
      - **External attackers**: Opportunistic cybercriminals or targeted threat actors
      - **Supply chain actors**: Compromised vendors, partners, or third-party services
      - **Physical access actors**: Those with physical proximity to systems or facilities

   3. Comprehensive assessment criteria:

      **Coverage Completeness:**
      - Are all critical assets addressed with appropriate STRIDE categories?
      - Are all significant data flows analyzed for security threats?
      - Are trust boundaries and their associated risks properly covered?
      - Are different threat actor types considered where architecturally relevant?

      **Threat Quality:**
      - Are threats realistic and grounded in the described architecture?
      - Do threat descriptions follow proper structure and technical accuracy?
      - Are STRIDE categories correctly assigned?
      - Are likelihood assessments reasonable based on architecture and context?

      **Attack Chain Coverage:**
      - Are potential attack escalation paths considered?
      - Are threats that enable subsequent attacks identified?
      - Are dependencies between threats properly addressed?

      **Architectural Alignment:**
      - Do threats respect the stated assumptions and boundaries?
      - Are threats consistent with the described technology stack and deployment model?
      - Are there threats that assume capabilities not supported by the architecture?

      **Mitigation Quality:**
      - Are mitigations specific, actionable, and proportionate?
      - Are they properly categorized as preventive, detective, or corrective?
      - Do they address the actual threat vectors described?

   4. Gap analysis approach:

      * **Systematic Coverage Review**: For each asset or entity, verify coverage across all relevant STRIDE categories.
      * **Data Flow Analysis**: For each data flow, confirm threats to data in transit and between trust boundaries are addressed.
      * **Assumption Alignment**: Cross-reference assumptions — ensure threats respect the stated security context and boundaries.
      * **Attack Chain Analysis**: Identify missing threat scenarios that could enable attack progression.
      * **Actor-Centric Review**: Verify coverage from each relevant threat actor perspective.

   5. Format your gap analysis as follows:

      **Gap Analysis Summary:**
      [2-3 sentences providing overall assessment of the threat catalog's completeness, quality, and architectural alignment]

      **Identified Gaps:**
      
      **Gap 1**: [Clear, specific description of the missing coverage]
      - **STRIDE Category**: [Relevant category]
      - **Affected Assets/Flows**: [Specific components affected]
      - **Threat Actor**: [Which actor type could exploit this gap]
      - **Architectural Context**: [Why this gap is relevant to the described system]
      - **Recommendation**: [Specific, actionable guidance to address this gap]
      
      **Gap 2**: [Clear, specific description of the missing coverage]
      - **STRIDE Category**: [Relevant category]
      - **Affected Assets/Flows**: [Specific components affected]
      - **Threat Actor**: [Which actor type could exploit this gap]
      - **Architectural Context**: [Why this gap is relevant to the described system]
      - **Recommendation**: [Specific, actionable guidance to address this gap]
      
      [Continue for additional gaps...]

   6. Decision framework on threat catalog completeness:

      After conducting your systematic analysis, you must make one of two decisions:
      
      **A. If you have identified any significant gaps in the threat catalog:**
      - Set "stop" to **FALSE**
      - Provide a detailed gap analysis using the format in section 5
      - Prioritize the most critical gaps first (those affecting high-value assets or common attack vectors)
      - Be specific and actionable in your recommendations
      - Focus on gaps that represent realistic and architecturally-grounded threats
      
      **B. If the threat catalog is comprehensive and complete:**
      - Set "stop" to **TRUE**
      - No gap analysis is required
      - Provide a brief rationale explaining why the catalog adequately covers all critical aspects

      **Decision Criteria for Completeness:**
      - All critical assets have appropriate STRIDE coverage
      - All significant data flows are threat-modeled
      - All relevant threat actors are considered
      - Attack chains and escalation paths are addressed
      - Threats align with architectural constraints and assumptions
      - Mitigation quality meets professional standards

   **Assessment Approach:** Your assessment should be thorough and methodical. Systematically verify coverage across all assets, data flows, STRIDE categories, and threat actors before declaring the catalog complete. Focus on realistic, architecturally-grounded gaps rather than theoretical scenarios.

   </instructions>
      """

    return [{"type": "text", "text": main_prompt}]


def threats_improve_prompt() -> str:
    main_prompt = f"""
   <task>
   You are an expert in all security domains and threat modeling. Your goal is to enrich an existing threat catalog by identifying new threats that may have been missed, using the STRIDE model. Your output must reflect plausible threats grounded in the described architecture and context. Avoid overly speculative or technically unrealistic scenarios.
   </task>

   <instructions>

   1. Review the inputs carefully:

      * <architecture_diagram>: Architecture Diagram of the solution in scope for threat modeling.
      * <identified_assets_and_entities>: Inventory of key assets and entities in the architecture.
      * <data_flow>: Descriptions of data movements between components.
      * <description>: Contextual overview of the system (if provided).
      * <assumptions>: Security assumptions and boundary considerations (if provided).
      * <threats>: The existing threat catalog to be enhanced.
      * <gap>: Leverage any gap analysis information to improve the threat catalog.

   2. Threat modeling framework and scope:

      * Use the **STRIDE model** as your framework: {_get_stride_categories_string()}.
      
      **STRIDE Categories Defined:**
      - **Spoofing**: Impersonating users, systems, or services
      - **Tampering**: Unauthorized modification of data, systems, or communications
      - **Repudiation**: Denying actions, transactions, or events without proof
      - **Information Disclosure**: Unauthorized access to confidential information
      - **Denial of Service**: Preventing legitimate access to resources or services
      - **Elevation of Privilege**: Gaining unauthorized access levels or permissions

   3. Threat actor categories and realism constraints:

      **Consider these threat actor types:**
      - **Internal users**: Malicious or compromised employees, contractors, or insiders
      - **External attackers**: Opportunistic cybercriminals or targeted threat actors
      - **Supply chain actors**: Compromised vendors, partners, or third-party services
      - **Physical access actors**: Those with physical proximity to systems or facilities

      **Realism requirements:**
      * **Only include threats that are plausible** given the architecture, technologies, and trust boundaries described.
      * **Avoid theoretical or unlikely threats** (e.g., highly improbable zero-days, advanced nation-state actions unless context supports it).
      * For each threat, describe **why it is feasible** in the context of the architecture.
      * Focus on identifying **new** relevant threats that may have been missed in the existing catalog.

   4. Use this enhanced grammar template for each threat:

      <threat_grammar>
      [Actor with specific access/capability] can [specific attack method] by [attack vector/technique], leading to [specific impact], affecting [asset/stakeholder].
      </threat_grammar>

      **Attack chain considerations**: Consider how threats may enable subsequent attacks. Note when one successful threat creates prerequisites for others that may not be covered in the existing catalog.

   5. Format each threat as follows:

      **Threat Name**: [Clear descriptive title]  
      **STRIDE Category**: [{_get_stride_categories_string()}]  
      **Description**: [Use <threat_grammar>; ensure {THREAT_DESCRIPTION_MIN_WORDS}–{THREAT_DESCRIPTION_MAX_WORDS} words; technically realistic]  
      **Target**: [Specific asset or component]  
      **Impact**: [Consequences if threat is realized, including affected stakeholders]  
      **Likelihood**: [{_get_likelihood_levels_string()} — assessed based on attack complexity, required access, skill level, and existing barriers within the described architecture]  
      **Mitigations**:  
      1. [Preventive/Detective/Corrective mitigation strategy 1]  
      2. [Preventive/Detective/Corrective mitigation strategy 2]  
      ...  

   6. Gap analysis and coverage approach:

      * **Analyze existing threats carefully** to avoid duplication and identify coverage gaps.
      * Address each asset or entity that may be **under-represented** in the existing catalog.
      * For each **data flow**, verify threats to data **in transit** and between **trust boundaries** are adequately covered.
      * **Cross-reference assumptions** — e.g., if a boundary assumes no internet exposure, do not generate external network-based threats.
      * Look for **missing STRIDE categories** for critical assets.
      * Consider **attack chains and escalation paths** that may bridge gaps between existing threats.
      * Use gap analysis information to prioritize areas needing additional coverage.

   7. Mitigation quality requirements:

      Ensure mitigations are:
      * **Specific** to the described architecture and threat
      * **Categorized** as preventive (blocks threat), detective (identifies occurrence), or corrective (responds to realized threats)
      * **Proportionate** to the threat severity and architectural context
      * **Implementable** given the described system constraints

   8. Quality control checklist:
      * [ ] Is the threat grounded in the described architecture?
      * [ ] Is the actor capable of performing the attack under realistic conditions?
      * [ ] Is the STRIDE category appropriate?
      * [ ] Is the enhanced grammar template and word count followed?
      * [ ] Are mitigations practical, specific, and categorized appropriately?
      * [ ] Have attack chain implications been considered?

   </instructions>
   """

    return [{"type": "text", "text": main_prompt}]


def threats_prompt() -> str:
    main_prompt = f"""
   <task>
   You are an expert in all security domains and threat modeling. Your goal is to generate a focused, comprehensive, and realistic list of security threats for a given architecture by analyzing the provided inputs, using the STRIDE model. Your output must reflect plausible threats grounded in the described architecture and context. Avoid overly speculative or technically unrealistic scenarios.
   </task>

   <instructions>

   1. Review the inputs carefully:

      * <architecture_diagram>: Architecture Diagram of the solution in scope for threat modeling.
      * <identified_assets_and_entities>: Inventory of key assets and entities in the architecture.
      * <data_flow>: Descriptions of data movements between components.
      * <description>: Contextual overview of the system (if provided).
      * <assumptions>: Security assumptions and boundary considerations (if provided).

   2. Threat modeling framework and scope:

      * Use the **STRIDE model** as your framework: {_get_stride_categories_string()}.
      
      **STRIDE Categories Defined:**
      - **Spoofing**: Impersonating users, systems, or services
      - **Tampering**: Unauthorized modification of data, systems, or communications
      - **Repudiation**: Denying actions, transactions, or events without proof
      - **Information Disclosure**: Unauthorized access to confidential information
      - **Denial of Service**: Preventing legitimate access to resources or services
      - **Elevation of Privilege**: Gaining unauthorized access levels or permissions

   3. Threat actor categories and realism constraints:

      **Consider these threat actor types:**
      - **Internal users**: Malicious or compromised employees, contractors, or insiders
      - **External attackers**: Opportunistic cybercriminals or targeted threat actors
      - **Supply chain actors**: Compromised vendors, partners, or third-party services
      - **Physical access actors**: Those with physical proximity to systems or facilities

      **Realism requirements:**
      * **Only include threats that are plausible** given the architecture, technologies, and trust boundaries described.
      * **Avoid theoretical or unlikely threats** (e.g., highly improbable zero-days, advanced nation-state actions unless context supports it).
      * For each threat, describe **why it is feasible** in the context of the architecture.

   4. Use this enhanced grammar template for each threat:

      <threat_grammar>
      [Actor with specific access/capability] can [specific attack method] by [attack vector/technique], leading to [specific impact], affecting [asset/stakeholder].
      </threat_grammar>

      **Attack chain considerations**: Consider how threats may enable subsequent attacks. Note when one successful threat creates prerequisites for others.

   5. Format each threat as follows:

      **Threat Name**: [Clear descriptive title]  
      **STRIDE Category**: [{_get_stride_categories_string()}]  
      **Description**: [Use <threat_grammar>; ensure {THREAT_DESCRIPTION_MIN_WORDS}–{THREAT_DESCRIPTION_MAX_WORDS} words; technically realistic]  
      **Target**: [Specific asset or component]  
      **Impact**: [Consequences if threat is realized, including affected stakeholders]  
      **Likelihood**: [{_get_likelihood_levels_string()} — assessed based on attack complexity, required access, skill level, and existing barriers within the described architecture]  
      **Mitigations**:  
      1. [Preventive/Detective/Corrective mitigation strategy 1]  
      2. [Preventive/Detective/Corrective mitigation strategy 2]  
      ...  

   6. Threat coverage approach:

      * Address each asset or entity explicitly with at least one relevant STRIDE category.
      * For each **data flow**, consider threats to data **in transit** and between **trust boundaries**.
      * **Cross-reference assumptions** — e.g., if a boundary assumes no internet exposure, do not generate external network-based threats.
      * Consider both direct threats and those that enable attack chains.

   7. Mitigation quality requirements:

      Ensure mitigations are:
      * **Specific** to the described architecture and threat
      * **Categorized** as preventive (blocks threat), detective (identifies occurrence), or corrective (responds to realized threats)
      * **Proportionate** to the threat severity and architectural context
      * **Implementable** given the described system constraints

   8. Quality control checklist:

      * [ ] Is the threat grounded in the described architecture?
      * [ ] Is the actor capable of performing the attack under realistic conditions?
      * [ ] Is the STRIDE category appropriate?
      * [ ] Is the enhanced grammar template and word count followed?
      * [ ] Are mitigations practical, specific, and categorized appropriately?
      * [ ] Have attack chain implications been considered?

   </instructions>
   """

    return [{"type": "text", "text": main_prompt}]


def structure_prompt(data) -> str:
    return f"""You are an helpful assistant whose goal is to to convert the response from your colleague
     to the desired structured output. The response is provided within <response> \n
     <response>
     {data}
     </response>
     """
