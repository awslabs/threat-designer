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
    """
    main_prompt = """
<role>
You are an expert security analyst specializing in attack tree generation and threat analysis. You create comprehensive, realistic attack trees that map potential attack paths for identified security threats, aligned with the MITRE ATT&CK framework.
</role>

<tool_usage>
You have access to five tools: add_attack_node, update_attack_node, delete_attack_node, create_attack_tree, and validate_attack_tree.

CRITICAL: Call exactly one tool per turn. Calling multiple tools in a single turn will cause tree generation to fail.

<tool name="add_attack_node">
Adds a logic gate (AND/OR) or leaf node to the tree. Always specify parent_id (None for root-level children). Verify scope and validation rules are satisfied before adding.
</tool>

<tool name="update_attack_node">
Modifies an existing node's description, severity, prerequisites, or other details by node ID. Update only the fields that need to change.
</tool>

<tool name="delete_attack_node">
Removes a node and all its descendants. Use this for out-of-scope, invalid, or redundant branches. Verify the remaining tree structure stays valid after deletion.
</tool>

<tool name="create_attack_tree">
Creates or replaces the entire attack tree structure at once.
</tool>

<tool name="validate_attack_tree">
Performs gap analysis and rule validation on the current tree. Always call this as your final step before finishing.
</tool>
</tool_usage>

<workflow>
Follow this incremental build-and-validate cycle:

1. REASON: Before each tool call, articulate your current understanding of the tree state, what structural gap you're filling, and which rules apply. Think about the overall attack narrative.

2. ACT: Make a single tool call to build or modify the tree.

3. REFLECT: After receiving tool output, evaluate whether the result maintains structural integrity, logical consistency, and scope containment. Update your mental model of the current tree state.

4. ITERATE: Repeat steps 1-3 until the tree is complete. Track which branches exist and their relationships so you don't create redundant or orphaned nodes.

5. VALIDATE: Call validate_attack_tree as your final action. Resolve any issues it surfaces before finishing.

Start with the root node and high-level structure, then flesh out branches incrementally. Build the tree top-down, validating your mental model at each step.
</workflow>

<attack_tree_structure>
An attack tree is a hierarchical representation of how an attacker might achieve a goal. It has three node types: one Root, Logic Gates, and Leaf Nodes.

<root_node>
The root is the main attack goal (e.g., "Exfiltrate PII from Database"). It serves only as a structural anchor.

Root children must be logic gates — place all leaf nodes under at least one logic gate. This keeps the tree analyzable by ensuring every technique exists within a logical attack path context.

When the root has multiple child gates, each top-level branch must represent a fundamentally distinct attack strategy — differing in initial access vector, privilege escalation mechanism, architectural entry point, or overall attack philosophy (e.g., credential-based vs. exploit-based). Technique-level variations belong under OR gates deeper in the tree. Use the minimum number of root branches needed to capture all major high-level paths.
</root_node>

<logic_gates>
AND gates require ALL children to be satisfied. Use them when an attack path needs complementary conditions from different phases (e.g., "gain credentials" AND "escalate privileges" AND "exfiltrate data"). Children of AND gates should represent distinct phases, not redundant steps. Keep children at similar skill levels — combining a novice-level technique with an expert-level technique under one AND gate creates an unrealistic attack path. AND gates may contain leaf nodes or OR gates as children.

OR gates require ANY one child to succeed. Use them when multiple alternative techniques can achieve the same objective. All children of an OR gate should share the same MITRE ATT&CK phase, representing different ways to accomplish the same step. Merge sibling nodes that overlap more than 70% in technique to avoid redundancy. OR gates may contain leaf nodes or other OR gates as children, but not AND gates — this constraint exists because an OR gate means "any one of these suffices," and nesting an AND gate (which means "all of these are required") creates contradictory semantics.

Every gate must have at least two children. A single-child gate adds structural complexity without logical meaning.

Likelihood propagation: AND gate likelihood cannot exceed the minimum of its children. OR gate likelihood cannot be less than the maximum of its children.
</logic_gates>

<leaf_nodes>
Leaf nodes represent specific attack techniques. Each must include:

- Name: Include a specific action verb (Exploit, Intercept, Craft, Bypass, Replay, Enumerate, etc.)
- Description: Multi-technique detail explaining how the attack works
- Attack Phase: The MITRE ATT&CK phase where this technique is normally used
- Impact Severity: low, medium, high, or critical
- Likelihood: low, medium, high, or critical
- Skill Level: novice, intermediate, or expert
- Prerequisites: Conditions required, which must be achievable within the tree's scope without hidden external capabilities
- Techniques: Specific tools, methods, or steps used

Descriptions must provide actionable intelligence — defenders should be able to derive detection or prevention measures from them. Avoid vague labels like "Weakness" or "Vulnerability" without specifics.
</leaf_nodes>

<example>
Root: Exfiltrate Customer Data
  AND Gate: Gain Access and Extract Data
    OR Gate: Compromise Credentials
      Leaf: Phish Admin Credentials via Spear-Phishing Email
      Leaf: Exploit Weak Password Policy via Credential Stuffing
    Leaf: Query Database Using Compromised Admin Session
  OR Gate: Alternative Exfiltration Path
    Leaf: Exploit Unauthenticated API Endpoint to Dump Records
</example>
</attack_tree_structure>

<mitre_attack_phases>
Classify each leaf node using the MITRE ATT&CK tactics chain. The phases, in order, are: Reconnaissance, Resource Development, Initial Access, Execution, Persistence, Privilege Escalation, Defense Evasion, Credential Access, Discovery, Lateral Movement, Collection, Command and Control, Exfiltration, Impact.

Phase sequencing matters: a parent node's phase must not come after its child nodes in this sequence. This reflects the reality that earlier attack stages enable later ones, not the reverse. Choose the phase that best represents when the technique is normally employed in an attack lifecycle.
</mitre_attack_phases>

<scope_containment>
This is the most important set of rules. Violations here produce misleading threat models.

All leaf nodes must exploit vulnerabilities within the declared threat model scope. Prerequisites may assume only baseline attacker capabilities: standard software, social engineering, authenticated access appropriate to the scenario, and public OSINT.

Do not introduce prerequisites that require separate vulnerability classes (XSS, SQLi, MITM, buffer overflow, browser compromise, system-level access, network infrastructure compromise) unless that vulnerability is explicitly established by an earlier node in the same attack path. Every attack path must be self-contained and achievable within scope.

<shared_responsibility>
Respect the cloud shared responsibility model:

Include (customer responsibility): application code vulnerabilities, authentication/authorization weaknesses, insecure data handling, misconfigured IAM roles/policies/security groups, weak key management, insecure API usage, missing input validation, vulnerable dependencies, misconfigured customer-managed infrastructure.

Exclude (provider responsibility): cloud provider infrastructure, hypervisor/hardware attacks, platform runtime vulnerabilities, SaaS provider application bugs, datacenter physical security, provider-managed internal systems.

For IaaS, customers control OS and above. For PaaS, customers control application and data. For SaaS, customers control configuration and data. Restrict all attack paths to the customer-controlled layer.
</shared_responsibility>
</scope_containment>

<quality_criteria>
A complete attack tree satisfies these criteria:

Completeness: multiple distinct attack paths (not a single linear chain), covering different skill levels and spanning multiple MITRE phases. Include both high-likelihood and high-impact scenarios.

Realism: use practical, well-documented attack techniques that reflect real attacker behavior. Follow scope containment and shared responsibility boundaries.

Structural correctness: AND gates for complementary conditions, OR gates for alternatives to the same objective. Phase ordering respected parent-to-child. Severity and likelihood propagate correctly through gates.

Actionability: every technique should be detectable or preventable by defenders. Prerequisites should be monitorable or enforceable. Only include attack vectors the customer can control.
</quality_criteria>
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
