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

from constants import (SUMMARY_MAX_WORDS_DEFAULT, THREAT_DESCRIPTION_MAX_WORDS,
                       THREAT_DESCRIPTION_MIN_WORDS, LikelihoodLevel,
                       StrideCategory)


def _get_stride_categories_string() -> str:
    """Helper function to get STRIDE categories as a formatted string."""
    return " | ".join([category.value for category in StrideCategory])


def _get_likelihood_levels_string() -> str:
    """Helper function to get likelihood levels as a formatted string."""
    return " | ".join([level.value for level in LikelihoodLevel])


def summary_prompt() -> str:
    return f"""<instruction>
Use the information provided by the user to generate a short headline summary of max {SUMMARY_MAX_WORDS_DEFAULT} words.
</instruction> \n
    """


def asset_prompt() -> str:
    return """<instruction>
You are an expert in all security domains and threat modeling. Your role is to carefully review a given architecture and identify key assets and entities that require protection. Follow these steps:

1. Review the provided <description> and <assumptions> to understand the solution and security context.

2. Identify the most critical assets within the system, such as sensitive data, databases, communication channels, or APIs. These are components that need protection.

3. Identify the key entities involved, such as users, services, or systems interacting with the system.

4. For each identified asset or entity, provide the following information in the specified format:

Type: [Asset or Entity]
Name: [Asset/Entity Name]
Description: [Brief description of the asset/entity]
</instruction> \n
    """


def flow_prompt(assets_state) -> str:
    return f"""<task>
You are an expert in all security domains and threat modeling. Analyze the given system architecture and provide the following information:

1. Data Flow Definitions:
- Describe the flow of data through the system, including the source and target entities, and the assets involved.
- Use the following format for each data flow:
<data_flow_definition>
flow_description: [Description of the data flow]
source_entity: [Source entity name]
target_entity: [Target entity name]
assets: [List of assets involved]
</data_flow_definition>

2. Trust Boundaries:
- Identify the trust boundaries where data crosses between different trust zones.
- Use the following format for each trust boundary:
<trust_boundary>
purpose: [Purpose of the trust boundary]
source_entity: [Source entity name]
target_entity: [Target entity name]
</trust_boundary>

3. Threat Actors:
- Identify the relevant threat actors, which are individuals, groups, or entities that have the intent, capability, and opportunity to harm the system's security.
- Use the following format for each threat actor category:
<threat_actor>
category: [Threat actor category]
description: [Description of the threat actor category]
examples: [Examples of the threat actor]
</threat_actor>

Consider the following information provided:
<description> [Description of the solution provided by the user]
<assumptions> [Assumptions provided by the user]

<identified_assets_and_entities>
{assets_state}
</identified_assets_and_entities>
    """


def gap_prompt(gap, assets, system_architecture) -> str:
    return f"""
<task>
You are an expert in all security domains and threat modeling. Your goal is to validate the comprehensiveness of a provided threat catalog for a given architecture. You'll assess the threat model against the STRIDE framework and identify any gaps in coverage, ensuring the threat catalog reflects plausible threats grounded in the described architecture and context.
</task>

<instructions>

1. Review the inputs carefully:

   * <identified_assets_and_entities>{assets}</identified_assets_and_entities>: Inventory of key assets and entities in the architecture.
   * <data_flow>{system_architecture}</data_flow>: Descriptions of data movements between components.
   * <threats>Threat Catalog</threats>: The existing threat catalog to be assessed.
   * <solution_description>: Contextual overview of the system (if provided).
   * <assumptions>: Security assumptions and boundary considerations (if provided).
   * <previous_gap>{gap}</previous_gap>: Previous gap analysis, if available.

2. Assessment criteria and framework:

   * Use the **STRIDE model** as your assessment framework: {_get_stride_categories_string()}.
   * Ensure threats are **plausible and grounded** in the described architecture, avoiding speculative or unrealistic scenarios.
   * Check for **comprehensive coverage** of both technology-specific threats and fundamental security principles.
   * Verify proper **mapping of threats to identified threat actors** using an attacker-centric approach.
   * Assess **balance between concrete technical mitigations** and broader security concepts.
   * Evaluate **completeness across all potential attack vectors**, not just technology-specific ones.

3. Gap analysis approach:

   * For each asset or entity, verify coverage across all relevant STRIDE categories.
   * For each data flow, confirm threats to data in transit and between trust boundaries are addressed.
   * Cross-reference assumptions — ensure threats respect the stated security context and boundaries.
   * Identify any missing threat scenarios that would be plausible given the architecture.

4. Format your gap analysis as follows:

   Gap Analysis Summary:
   [Overall assessment of the threat catalog's completeness and quality]

   Identified Gaps:
   
   Gap 1: [Clear description of the missing coverage]
   - STRIDE Category: [Relevant category]
   - Affected Assets/Flows: [Specific components affected]
   - Recommendation: [How to address this gap]
   
   Gap 2: [Clear description of the missing coverage]
   ...

5. Quality control checklist:

   * [ ] Have all assets been assessed against all relevant STRIDE categories?
   * [ ] Are all data flows properly threat-modeled?
   * [ ] Do the threats respect the stated assumptions and boundaries?
   * [ ] Is there appropriate balance between technology-specific and fundamental threats?
   * [ ] Are the identified gaps based on plausible attack scenarios?
   * [ ] Do recommendations for addressing gaps include practical and relevant mitigations?

6. Final recommendations:
   
   * Provide actionable guidance on how to improve the threat catalog's comprehensiveness.
   * Suggest any methodological improvements for future threat modeling efforts.

7. Decision on threat catalog completeness:

   After conducting your analysis, you must make one of two decisions:
     
     A. If you have identified any gaps in the threat catalog:
        - Set "stop" to FALSE
        - Provide a detailed gap analysis in the "gap" field using the format in section 4
        - Focus on the most critical or significant gap first
        - Be specific and actionable in your recommendations
     
     B. If the threat catalog is comprehensive and complete:
        - Set "stop" to TRUE
        - No gap analysis is required
        - Briefly explain why you believe the catalog is comprehensive

   Your assessment should be thorough and methodical - do not rush to declare the catalog complete unless you have systematically verified coverage across all assets, data flows, and STRIDE categories.
</instructions>
    """


def threats_improve_prompt(gap, threat_list, assets, flows) -> str:
    return f"""
<task>
You are an expert in all security domains and threat modeling. Your goal is to enrich an existing threat catalog by identifying new threats that may have been missed, using the STRIDE model. Your output must reflect plausible threats grounded in the described architecture and context. Avoid overly speculative or technically unrealistic scenarios.
</task>

<instructions>
1.Review the inputs carefully:

   * <identified_assets_and_entities>{assets}</identified_assets_and_entities>: Inventory of key assets and entities in the architecture.
   * <data_flow>{flows}</data_flow>: Descriptions of data movements between components.
   * <solution_description>: Contextual overview of the system (if provided).
   * <assumptions>: Security assumptions and boundary considerations (if provided).
   * <threats>{threat_list}</threats>: The existing threat catalog to be enhanced.
   * <gap>{gap}</gap>: Leverage any gap analysis information to improve the threat catalog.

2. Threat modeling scope and realism constraints:

   * Use the **STRIDE model** as your framework: {_get_stride_categories_string()}.
   * **Only include threats that are plausible** given the architecture, technologies, and trust boundaries described.
   * **Avoid theoretical or unlikely threats** (e.g., highly improbable zero-days, advanced nation-state actions unless context supports it).
   * For each threat, describe **why it is feasible** in the context of the architecture.
   * Focus on identifying **new** relevant threats that may have been missed in the existing catalog.

3. Use this grammar template for each threat:

   <threat_grammar>
   [threat actor category] [prerequisites] can [threat action] which leads to [threat impact], negatively impacting [impacted assets].
   </threat_grammar>

   Be exhaustive but grounded. Maximize detail without assuming undefined components or unprovided context.

4. Format each threat as follows:

   Threat Name: [Clear descriptive title]  
   STRIDE Category: [{_get_stride_categories_string()}]  
   Description: [Use <threat_grammar>; ensure {THREAT_DESCRIPTION_MIN_WORDS}–{THREAT_DESCRIPTION_MAX_WORDS} words; technically realistic]  
   Target: [Specific asset or component]  
   Impact: [Consequences if threat is realized]  
   Likelihood: [{_get_likelihood_levels_string()} — based on feasibility and context]  
   Mitigations:  
   1. [Mitigation strategy 1]  
   2. [Mitigation strategy 2]  
   ...  

5. Threat coverage approach:

   * Address each asset or entity explicitly with at least one relevant STRIDE category.
   * For each **data flow**, consider threats to data **in transit** and between **trust boundaries**.
   * **Cross-reference assumptions** — e.g., if a boundary assumes no internet exposure, do not generate external network-based threats.
   * Analyze the existing threats carefully to avoid duplication and focus on identifying gaps.

6. Quality control checklist:

   * [ ] Is the threat grounded in the described architecture?
   * [ ] Is the actor capable of performing the attack under realistic conditions?
   * [ ] Is the STRIDE category appropriate?
   * [ ] Is the grammar and word count followed?
   * [ ] Are mitigations practical and relevant?
   * [ ] Does this threat add value beyond what's already in the catalog?
</instructions>
"""


def threats_prompt(assets, flows) -> str:
    return f"""
<task>
You are an expert in all security domains and threat modeling. Your goal is to generate a focused, comprehensive, and realistic list of security threats for a given architecture by analyzing the provided inputs, using the STRIDE model. Your output must reflect plausible threats grounded in the described architecture and context. Avoid overly speculative or technically unrealistic scenarios.
</task>


<instructions>

1. Review the inputs carefully:

   * <identified_assets_and_entities>{assets}</identified_assets_and_entities>: Inventory of key assets and entities in the architecture.
   * <data_flow>{flows}</data_flow>: Descriptions of data movements between components.
   * <solution_description>: Contextual overview of the system (if provided).
   * <assumptions>: Security assumptions and boundary considerations (if provided).

2. Threat modeling scope and realism constraints:

   * Use the **STRIDE model** as your framework: {_get_stride_categories_string()}.
   * **Only include threats that are plausible** given the architecture, technologies, and trust boundaries described.
   * **Avoid theoretical or unlikely threats** (e.g., highly improbable zero-days, advanced nation-state actions unless context supports it).
   * For each threat, describe **why it is feasible** in the context of the architecture.

3. Use this grammar template for each threat:

   <threat_grammar>
   [threat actor category] [prerequisites] can [threat action] which leads to [threat impact], negatively impacting [impacted assets].
   </threat_grammar>

   Be exhaustive but grounded. Maximize detail without assuming undefined components or unprovided context.

4. Format each threat as follows:


   Threat Name: [Clear descriptive title]  
   STRIDE Category: [{_get_stride_categories_string()}]  
   Description: [Use <threat_grammar>; ensure {THREAT_DESCRIPTION_MIN_WORDS}–{THREAT_DESCRIPTION_MAX_WORDS} words; technically realistic]  
   Target: [Specific asset or component]  
   Impact: [Consequences if threat is realized]  
   Likelihood: [{_get_likelihood_levels_string()} — based on feasibility and context]  
   Mitigations:  
   1. [Mitigation strategy 1]  
   2. [Mitigation strategy 2]  
   ...  

5. Threat coverage approach:

   * Address each asset or entity explicitly with at least one relevant STRIDE category.
   * For each **data flow**, consider threats to data **in transit** and between **trust boundaries**.
   * **Cross-reference assumptions** — e.g., if a boundary assumes no internet exposure, do not generate external network-based threats.

6. Quality control checklist:

   * [ ] Is the threat grounded in the described architecture?
   * [ ] Is the actor capable of performing the attack under realistic conditions?
   * [ ] Is the STRIDE category appropriate?
   * [ ] Is the grammar and word count followed?
   * [ ] Are mitigations practical and relevant?
<instructions>
"""


def structure_prompt(data) -> str:
    return f"""You are an helpful assistant whose goal is to to convert the response from your colleague
     to the desired structured output. The response is provided within <response> \n
     <response>
     {data}
     </response>
     """
