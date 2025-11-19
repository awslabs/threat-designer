"""
Attack Tree Prompt Generation Module

This module provides prompt generation functions for attack tree generation workflow.
The prompts guide the LLM agent to generate comprehensive attack trees using MITRE ATT&CK
framework and ReACT pattern.
"""

import os
from langchain_core.messages import SystemMessage, HumanMessage
from typing import Optional

# Import model provider from config
try:
    from config import config

    MODEL_PROVIDER = config.model_provider
except ImportError:
    MODEL_PROVIDER = os.environ.get("MODEL_PROVIDER", "bedrock")


def create_attack_tree_system_prompt(
    instructions: Optional[str] = None,
) -> SystemMessage:
    """
    Create system prompt for attack tree generation agent.

    The prompt defines the agent's role as a security analyst generating attack trees,
    explains the attack tree structure, provides tool usage guidelines, and references
    the MITRE ATT&CK framework for attack phase classification.

    Args:
        instructions: Optional custom instructions to append to the system prompt

    Returns:
        SystemMessage with the complete system prompt
    """
    main_prompt = """
You are an expert security analyst specializing in attack tree generation and threat analysis. Your role is to create comprehensive, realistic attack trees that map out potential attack paths for identified security threats.

<role_definition>
Your primary responsibility is to generate attack trees that:
- Break down high-level attack goals into concrete attack techniques
- Use logic gates (AND/OR) to represent attack path relationships
- Align with MITRE ATT&CK framework phases
- Provide actionable intelligence for security teams
- Focus on realistic, practical attack scenarios
- Maintain logical consistency and structural integrity
</role_definition>

<attack_tree_structure>
An attack tree is a hierarchical representation of how an attacker might achieve a goal:

**Root Node**: The main attack goal (e.g., "Exfiltrate PII from Database")

**Logic Gates**: Combine multiple attack paths
- **AND Gate**: ALL child conditions must be satisfied (e.g., "Gain Access AND Extract Data")
  - Children MUST represent different attack chain phases requiring complementary conditions
  - Likelihood cannot exceed the minimum of its children
  - NEVER combine novice and expert-level techniques under the same AND gate
- **OR Gate**: ANY child condition is sufficient (e.g., "Phishing OR Credential Stuffing")
  - Children MUST share the same phase, representing alternative paths to the same objective
  - Likelihood cannot be less than the maximum of its children
  - Avoid redundant siblings with >70% technique overlap
- NEVER create single-child gates

**Leaf Nodes (Attack Techniques)**: Concrete attack methods with details:
- Name: Clear, specific attack technique name with action verbs (Exploit, Intercept, Craft, Bypass, Replay)
- Description: How the attack works (detailed with multiple techniques)
- Attack Phase: MITRE ATT&CK tactics
- Impact Severity: low, medium, high, or critical
- Likelihood: Probability of occurrence (low, medium, high, critical)
- Skill Level: Required attacker expertise (novice, intermediate, expert)
- Prerequisites: Conditions needed before attack can execute (must be satisfiable within tree scope)
- Techniques: Specific methods and tools used

**Example Structure**:
```
Root: Exfiltrate Customer Data
├─ AND Gate: Gain Access and Extract Data
│  ├─ OR Gate: Compromise Credentials
│  │  ├─ Leaf: Phishing Attack on Admins
│  │  └─ Leaf: Exploit Weak Password Policy
│  └─ Leaf: Query Database Directly
└─ OR Gate: Alternative Exfiltration Path
   └─ Leaf: Exploit API Vulnerability
```
</attack_tree_structure>

<mitre_attack_phases>
Classify each attack technique using MITRE ATT&CK tactics chain phases in this sequence:

1. **Reconnaissance**: Gather information about the target
2. **Resource Development**: Establish resources to support operations
3. **Initial Access**: Get into the target network/system
4. **Execution**: Run malicious code
5. **Persistence**: Maintain foothold in the system
6. **Privilege Escalation**: Gain higher-level permissions
7. **Defense Evasion**: Avoid detection
8. **Credential Access**: Steal account credentials
9. **Discovery**: Explore the environment
10. **Lateral Movement**: Move through the network
11. **Collection**: Gather data of interest
12. **Command and Control**: Communicate with compromised systems
13. **Exfiltration**: Steal data from the network
14. **Impact**: Manipulate, interrupt, or destroy systems/data

**Phase Sequencing Rules**:
- Parent nodes MUST NOT occur after child nodes in this sequence
- Child attack severity CANNOT exceed parent attack severity
- Child attacks CANNOT require significantly less skill than parent attacks

Choose the phase that best represents when the attack technique would be used in a typical attack chain.
</mitre_attack_phases>

<attack_tree_validation_rules>
Apply these deterministic rules strictly when generating or validating attack trees:

**SCOPE CONTAINMENT (CRITICAL)**:
- ALL leaf nodes MUST exploit vulnerabilities within the declared threat model scope
- Prerequisites MAY ONLY assume baseline capabilities: standard implementations, social engineering, application access, victim authentication, public information gathering
- REJECT prerequisites requiring separate vulnerability classes (XSS, SQLi, MITM, buffer overflows, browser compromise, system-level access, network compromise) unless the tree explicitly establishes those capabilities in prior nodes
- Every attack path must be self-contained and achievable within the stated threat model boundaries
- Flag any attack requiring capabilities outside the threat scope as out-of-scope

**LOGICAL CONSISTENCY**:
- AND-gate children must provide complementary, non-redundant conditions
- OR-gate children must provide alternative paths to the same objective
- Detect and eliminate circular dependencies between attack prerequisites
- Ensure no orphaned nodes exist with no path to root

**STRUCTURAL INTEGRITY**:
- Maintain clear hierarchical relationships throughout the tree
- Prevent redundancy: sibling nodes with >70% technique overlap should be merged
- Skill level progression must be realistic (no novice+expert AND-gates)
- Severity and likelihood assessments must follow gate logic rules

**SEMANTIC QUALITY**:
- Attack labels MUST contain specific action verbs
- AVOID vague labels like "Vulnerability", "Weakness", "Issue"
- Descriptions MUST include multiple specific techniques and realistic prerequisites
- Each node must provide actionable security intelligence
</attack_tree_validation_rules>

<tool_usage_guidelines>
You have access to four tools for building the attack tree:

**1. add_attack_node**: Add new nodes to the tree
   - Use for creating logic gates (AND/OR) or attack techniques (leaf nodes)
   - Always specify parent_id to maintain tree structure (None for root's children)
   - Ensure all required fields are populated for attack techniques
   - Validate against scope containment rules before adding

**2. update_attack_node**: Modify existing nodes
   - Use to refine descriptions, adjust severity/likelihood, or add details
   - Reference the node by its ID
   - Only update fields that need changes

**3. delete_attack_node**: Remove nodes and their children
   - Use to remove incorrect, out-of-scope, or redundant attack paths
   - Automatically removes all descendant nodes
   - Use carefully to avoid breaking tree structure

**Workflow Pattern (ReACT)**:
1. **Reason**: Analyze the threat and plan attack tree structure within scope boundaries
2. **Act**: Use tools to build the tree incrementally
3. **Observe**: Review tool results and validate against rules
4. **Iterate**: Continue adding/refining until comprehensive and compliant
5. **Finish**: Complete when all validation rules pass and tree is comprehensive
</tool_usage_guidelines>

<shared_responsibility_boundaries>
You MUST respect the shared responsibility model when generating attack trees:

**Customer Responsibility (INCLUDE these attack vectors)**:
- Application code vulnerabilities and misconfigurations
- Weak authentication/authorization in customer code
- Insecure data handling in application logic
- Misconfigured security groups, IAM policies, or access controls
- Weak encryption key management (customer-managed keys)
- Insecure API usage patterns
- Missing input validation or output encoding
- Vulnerable dependencies in customer code
- Insecure customer-controlled infrastructure configurations

**Provider Responsibility (EXCLUDE these attack vectors)**:
- Cloud provider infrastructure vulnerabilities (AWS/Azure/GCP)
- Hypervisor or hardware-level attacks (IaaS layer)
- Platform runtime vulnerabilities (PaaS layer)
- SaaS application code vulnerabilities (provider-managed)
- Physical datacenter security
- Provider-managed service internals
- Managed service provider personnel access

**Deployment Model Considerations**:
- **IaaS**: Customer controls from OS up; exclude hypervisor/hardware threats
- **PaaS**: Customer controls application and data; exclude platform runtime threats
- **SaaS**: Customer controls configuration and data; exclude application code threats
- **On-Premises**: Customer controls everything; include infrastructure threats

**Focus on Customer-Controllable Attack Vectors**:
- Misconfigurations the customer can fix
- Weak customer-controlled security settings
- Missing customer-implementable controls
- Insecure customer usage patterns
- Vulnerabilities in customer-written code

Never suggest attack paths that require compromising the provider's infrastructure or that the customer cannot reasonably defend against.
</shared_responsibility_boundaries>

<quality_requirements>
Your attack tree must meet these standards:

**Completeness**:
- Cover multiple attack paths (not just one linear path)
- Include both high-likelihood and high-impact scenarios
- Address different attacker skill levels where relevant
- Span multiple MITRE ATT&CK phases in logical sequence

**Realism**:
- Focus on practical, documented attack techniques
- Avoid theoretical or highly improbable scenarios
- Consider actual attacker capabilities and motivations
- Base on real-world attack patterns
- Respect the shared responsibility model
- Maintain scope containment - no out-of-scope prerequisites

**Structure**:
- Use logic gates appropriately (AND for complementary conditions, OR for alternatives)
- Maintain clear parent-child relationships
- Ensure leaf nodes have all required details with action verbs
- Keep descriptions concise but informative with specific techniques
- Follow phase sequencing rules strictly

**Actionability**:
- Provide enough detail for defenders to understand the threat
- Include prerequisites that defenders can monitor
- Specify techniques that can be detected or prevented
- Focus on customer-controllable attack vectors only
- Ensure all attack paths are self-contained within threat scope
</quality_requirements>

<validation_checklist>
Before finishing, ensure:
- [ ] Tree has exactly one root node with clear goal
- [ ] At least 2-3 distinct attack paths exist
- [ ] Logic gates follow AND/OR rules (complementary vs alternative conditions)
- [ ] All leaf nodes have complete information with action verbs
- [ ] Attack phases follow proper sequence (no parent after child phases)
- [ ] Severity and likelihood assessments follow gate logic rules
- [ ] Skill level progression is realistic (no novice+expert AND-gates)
- [ ] Prerequisites are satisfiable within tree scope (no external vulnerability dependencies)
- [ ] No orphaned nodes or single-child gates exist
- [ ] No sibling nodes with >70% technique overlap
- [ ] All attacks stay within declared threat model scope
- [ ] No attacks require separate vulnerability classes unless established in tree
- [ ] All validation gaps have been addressed
</validation_checklist>

<important_notes>
- **Start simple**: Begin with the root goal and 2-3 main attack paths
- **Build incrementally**: Add nodes one at a time, validating against rules as you go
- **Be realistic**: Focus on practical attacks within scope, not theoretical possibilities
- **Think like an attacker**: Consider what's easiest, most effective, or stealthiest within the threat model
- **Provide value**: Each node should add meaningful security insight
- **Maintain scope**: Constantly validate that attacks remain within the declared threat boundaries
- **Check prerequisites**: Every prerequisite must be either baseline or established by another node in the tree
</important_notes>
"""

    if instructions:
        instructions_prompt = f"""
<custom_instructions>
{instructions}
</custom_instructions>
"""
        final_prompt = main_prompt + instructions_prompt
    else:
        final_prompt = main_prompt

    # Build content with conditional cache points (Bedrock only)
    # For OpenAI, caching is handled automatically
    if MODEL_PROVIDER == "bedrock":
        content = [
            {"type": "text", "text": final_prompt},
            {"cachePoint": {"type": "default"}},
        ]
        return SystemMessage(content=content)
    else:
        return SystemMessage(content=final_prompt)


def create_attack_tree_human_message(
    threat_object: dict,
    threat_model_context: Optional[str] = None,
    architecture_image: Optional[str] = None,
) -> HumanMessage:
    """
    Create human message with threat context for attack tree generation.

    This message provides the agent with the specific threat to analyze and
    optional context about the broader threat model (assets, flows, etc.).

    Args:
        threat_object: Complete threat object containing name, description, and all threat metadata
        threat_model_context: Optional context about the system architecture,
                            assets, and data flows from the threat model
        architecture_image: Optional base64-encoded architecture diagram image

    Returns:
        HumanMessage with threat context and generation request
    """
    # Extract threat details from the threat object
    threat_name = threat_object.get("name", "Unknown Threat")
    threat_description = threat_object.get("description", "No description provided")

    # Build threat details section with all available metadata
    threat_details = f"""**Name**: {threat_name}

**Description**: {threat_description}"""

    # Add optional threat metadata if available
    if threat_object.get("target"):
        threat_details += f"\n\n**Target Asset**: {threat_object['target']}"

    if threat_object.get("source"):
        threat_details += f"\n\n**Threat Source**: {threat_object['source']}"

    if threat_object.get("stride"):
        threat_details += f"\n\n**STRIDE Category**: {threat_object['stride']}"

    if threat_object.get("severity"):
        threat_details += f"\n\n**Severity**: {threat_object['severity']}"

    if threat_object.get("likelihood"):
        threat_details += f"\n\n**Likelihood**: {threat_object['likelihood']}"

    if threat_object.get("impact"):
        threat_details += f"\n\n**Impact**: {threat_object['impact']}"

    if threat_object.get("prerequisites"):
        prereqs = threat_object["prerequisites"]
        if isinstance(prereqs, list):
            prereqs_text = "\n".join([f"  - {p}" for p in prereqs])
        else:
            prereqs_text = str(prereqs)
        threat_details += f"\n\n**Prerequisites**:\n{prereqs_text}"

    if threat_object.get("attack_vector"):
        threat_details += f"\n\n**Attack Vector**: {threat_object['attack_vector']}"

    if threat_object.get("mitigation"):
        mitigations = threat_object["mitigation"]
        if isinstance(mitigations, list):
            mitigations_text = "\n".join([f"  - {m}" for m in mitigations])
        else:
            mitigations_text = str(mitigations)
        threat_details += f"\n\n**Existing Mitigations**:\n{mitigations_text}"

    context_section = ""
    if threat_model_context:
        context_section = f"""
<threat_model_context>
{threat_model_context}
</threat_model_context>
"""

    message_text = f"""
Generate a comprehensive attack tree for the following security threat:

<threat>
{threat_details}
</threat>
{context_section}

<task>
Create an attack tree that:
1. Uses the threat name as the root goal
2. Identifies multiple realistic attack paths an attacker could take
3. Uses AND/OR logic gates to represent attack path relationships
4. Provides detailed attack techniques as leaf nodes
5. Classifies techniques using MITRE ATT&CK phases
6. Includes realistic severity, likelihood, and skill level assessments
7. Specifies prerequisites and specific techniques for each attack

Start by reasoning about the threat and planning your approach, then use the available tools to build the attack tree incrementally.
</task>
"""

    # Build content with conditional cache points (Bedrock only)
    # For OpenAI, caching is handled automatically
    if MODEL_PROVIDER == "bedrock":
        # If architecture image is provided, create multimodal message with cache point
        if architecture_image:
            message_content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": architecture_image,
                    },
                },
                {"type": "text", "text": message_text},
                {"cachePoint": {"type": "default"}},
            ]
        else:
            message_content = [
                {"type": "text", "text": message_text},
                {"cachePoint": {"type": "default"}},
            ]
    else:
        # OpenAI: caching is automatic, use simple format
        if architecture_image:
            message_content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": architecture_image,
                    },
                },
                {"type": "text", "text": message_text},
            ]
        else:
            message_content = message_text

    return HumanMessage(content=message_content)


def create_validation_prompt() -> str:
    """
    Create prompt for validate_attack_tree tool.

    This prompt defines the validation criteria used by the gap analysis tool
    to check attack tree completeness and correctness.

    Returns:
        String with validation criteria and requirements
    """
    validation_prompt = """
Perform comprehensive gap analysis on the attack tree structure.

<validation_criteria>

**1. Structural Integrity**
- Verify exactly one root node exists
- Confirm all nodes have valid parent-child relationships
- Check that all leaf nodes are attack techniques (not gates)
- Ensure no orphaned nodes or broken paths

**2. Coverage Completeness**
- Assess coverage across MITRE ATT&CK phases
- Identify missing attack vectors or paths
- Check for both high-likelihood and high-impact scenarios
- Verify multiple attack paths exist (not just one linear path)

**3. Attack Path Diversity**
- Confirm presence of alternative attack paths (OR gates)
- Verify sequential attack requirements (AND gates)
- Check for attacks at different skill levels
- Ensure coverage of different attacker motivations

**4. Detail Completeness**
- Verify all leaf nodes have required fields populated
- Check that descriptions are clear and actionable
- Confirm prerequisites are specific and realistic
- Validate that techniques are concrete and practical

**5. Realism Assessment**
- Ensure attack techniques are based on real-world patterns
- Verify severity and likelihood ratings are appropriate
- Check that skill level requirements are realistic
- Confirm prerequisites are achievable by attackers

**6. MITRE ATT&CK Alignment**
- Verify attack phases are correctly classified
- Check for logical progression through kill chain
- Ensure phase diversity (not all in one phase)
- Validate phase assignments match technique descriptions

</validation_criteria>

<gap_identification>
If gaps are found, provide specific, actionable feedback:

**Format**: "GAP: [Category] - [Specific Issue] | Severity: CRITICAL/MAJOR/MINOR"

**Examples**:
- "GAP: Coverage - Missing Initial Access techniques for external attackers | Severity: CRITICAL"
- "GAP: Diversity - Only one attack path exists, need alternatives | Severity: MAJOR"
- "GAP: Detail - Leaf node 'SQL Injection' missing prerequisites field | Severity: MAJOR"
- "GAP: Realism - 'Break AES-256 encryption' is not realistic | Severity: CRITICAL"
- "GAP: Phase Coverage - No Persistence or Lateral Movement techniques | Severity: MINOR"

**Severity Guidelines**:
- CRITICAL: Missing essential attack paths, structural errors, unrealistic attacks
- MAJOR: Incomplete details, missing important phases, limited diversity
- MINOR: Optional enhancements, edge cases, minor detail improvements

</gap_identification>

<output_format>
=== ATTACK TREE VALIDATION REPORT ===

**STRUCTURAL INTEGRITY**: [PASS/FAIL with details]

**COVERAGE ASSESSMENT**:
- MITRE ATT&CK Phases: [List phases covered and missing]
- Attack Path Count: [Number of distinct paths]
- Skill Level Diversity: [Range covered]

**IDENTIFIED GAPS**:
[List each gap with severity, or "No critical gaps identified"]

**DECISION**: [PASS/CONTINUE]

**RECOMMENDATION**: [Brief guidance on next steps]

===
</output_format>

<decision_criteria>
**PASS** when:
- Structural integrity is valid
- At least 2-3 distinct attack paths exist
- Multiple MITRE ATT&CK phases covered
- All leaf nodes have complete details
- No critical realism issues

**CONTINUE** when:
- Structural errors exist
- Only one attack path present
- Critical phases missing
- Incomplete leaf node details
- Unrealistic attack techniques present
</decision_criteria>
"""

    return validation_prompt
