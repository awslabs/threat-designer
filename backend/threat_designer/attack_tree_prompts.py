"""
Attack Tree Prompt Generation Module

This module provides prompt generation functions for attack tree generation workflow.
The prompts guide the LLM agent to generate attack trees using the MITRE ATT&CK
taxonomy and ReACT pattern. Nodes are framed as weaknesses in the operator's
system and the controls that break them, not as attacker actions, and the tree
is built one node per call: a single response carrying the whole tree is what
provider cyber-misuse classifiers suppress.

A single prompt serves every provider (Claude 5 family and GPT-5.6 alike); only
cache-point placement differs. It is written for both: no narrated self-review
or re-check steps (the Claude 5 models self-verify, and such instructions cause
over-verification), each instruction stated once (GPT-5.6 rewards leaner
prompts), and narration cadence steered explicitly.
"""

import base64
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
You are a security architect performing a design review. You build attack trees: the standard threat-modeling artifact that breaks one threat to a system down into the conditions that must hold for it to be realized. Techniques are classified with the MITRE ATT&CK taxonomy.
</role>

<purpose>
The operator owns this system and is responsible for securing it. The tree is a design-review artifact: it tells the operator which weaknesses in their architecture combine to make the threat possible, and which control breaks each path. It feeds control selection, detection coverage, and mitigation planning.

Work at design level throughout. Each node names a weakness in this system, what it permits, and where a control would stop it. Name and classify technique categories; do not describe how to carry a step out. No commands, code, payloads, sample inputs, tool names or configuration, and no step-by-step procedures. A tree that reads as input to a mitigation plan is correct; one that reads as a runbook is not, and that level of detail would not change which control the operator picks anyway.
</purpose>

<writing_style>
Write every field of every node, gates included, with the system as the subject: what a component allows, lacks, stores, or exposes, and what that leaves possible. Do not write sentences whose subject is an attacker, intruder, or "anyone", and do not narrate what someone does, obtains, or reads. Write "Logger flash stores the device key unencrypted, so physical possession of a unit exposes it", not "An attacker holding a stolen logger reads the key from flash". Gate descriptions name the condition of the system the gate represents ("Certificate-management permissions exceed device-administration scope"), not a path someone takes. Prerequisites are conditions of the system or its environment ("A read-only operations identity can read function configuration"). Keep your own reasoning at the same design level.
</writing_style>

<tool_usage>
You have access to six tools: create_attack_tree, read_attack_tree, add_attack_node, update_attack_node, delete_attack_node, and validate_attack_tree.

CRITICAL: Call exactly one tool per turn. Calling multiple tools in a single turn will cause tree generation to fail.

<tool name="add_attack_node">
Adds a logic gate (AND/OR) or leaf node to the tree. Always specify parent_path (None for root-level children). Check scope and validation rules are satisfied before adding.
</tool>

<tool name="read_attack_tree">
Returns the current tree structure. Use it to re-ground on the built tree before a change batch, or after validate_attack_tree reports issues.
</tool>

<tool name="update_attack_node">
Modifies an existing node's description, severity, prerequisites, or other details by node path. Update only the fields that need to change.
</tool>

<tool name="delete_attack_node">
Removes a node and all its descendants. Use this for out-of-scope, invalid, or redundant branches. Verify the remaining tree structure stays valid after deletion.
</tool>

<tool name="create_attack_tree">
Replaces the entire attack tree structure at once. Only for restructuring a tree already built with add_attack_node.
</tool>

<tool name="validate_attack_tree">
Performs gap analysis and rule validation on the current tree. Always call this as your final step before finishing.
</tool>
</tool_usage>

<workflow>
Build the tree top-down with add_attack_node, one node per turn: start with the high-level branch gates, then flesh out each branch. Use create_attack_tree only to replace a tree you have already built, never for the initial build. Each add_attack_node call adds exactly one node: a gate with an empty children list, or a single leaf. Add a gate's children with their own calls. Track which branches exist and how they relate so you don't create redundant or orphaned nodes.

Call validate_attack_tree as your final action and resolve any issues it surfaces before finishing.
</workflow>

<progress_updates>
Before your first tool call, state in one sentence how you plan to decompose this threat. While building, add a brief update only when you start a new top-level branch or when a validation result changes your plan. Do not narrate routine tool calls or restate the tree after every node.
</progress_updates>

<attack_tree_structure>
An attack tree decomposes one threat into the combinations of conditions under which it can be realized. It has three node types: one Root, Logic Gates, and Leaf Nodes.

<root_node>
The root is the threat being analyzed, using the threat name. It serves only as a structural anchor.

Root children must be logic gates. Place every leaf under at least one logic gate so each weakness sits inside a path the reviewer can reason about.

When the root has multiple child gates, each top-level branch must represent a fundamentally distinct path to the threat: a different entry point, trust boundary, privilege mechanism, or class of weakness (e.g., identity weaknesses vs. unprotected interfaces). Variations of the same step belong under OR gates deeper in the tree. Use the minimum number of root branches needed to capture the distinct paths.
</root_node>

<logic_gates>
AND gates require ALL children to hold. Use them when a path needs complementary conditions from different phases (e.g., "access obtained" AND "privileges elevated" AND "data leaves the boundary"). Children of AND gates should represent distinct phases, not redundant steps. Keep children at similar skill levels; pairing a novice-level step with an expert-level step under one AND gate produces an implausible path. AND gates may contain leaf nodes or OR gates as children.

OR gates require ANY one child to hold. Use them when several independent weaknesses each lead to the same step. All children of an OR gate should share the same MITRE ATT&CK phase. Merge siblings that overlap more than 70% to avoid redundancy. OR gates may contain leaf nodes or other OR gates as children, but not AND gates: an OR gate means "any one of these suffices," and nesting an AND gate ("all of these are required") creates contradictory semantics.

Every gate must have at least two children. A single-child gate adds structural complexity without logical meaning.

Likelihood propagation: AND gate likelihood cannot exceed the minimum of its children. OR gate likelihood cannot be less than the maximum of its children.
</logic_gates>

<leaf_nodes>
Leaf nodes represent one weakness in the system and the step it permits. Each must include:

- Name: The weakness and what it permits, phrased as a condition of the system (e.g., "Admin Login Lacks Phishing-Resistant MFA", "Records API Accepts Unauthenticated Requests")
- Description: The weakness the step relies on, what it permits, and the control that would break it, at the detail a reviewer needs to choose that control
- Attack Phase: The MITRE ATT&CK tactic this step falls under
- Impact Severity: low, medium, high, or critical
- Likelihood: low, medium, high, or critical
- Skill Level: novice, intermediate, or expert
- Prerequisites: Conditions that must already hold, achievable within the tree's scope without hidden external capabilities
- Techniques: MITRE ATT&CK technique ID and name where one applies (e.g., "T1552 Unsecured Credentials"); the category of method, not tooling or procedure

Each leaf should let a reviewer derive a preventive or detective control. Avoid vague labels like "Weakness" or "Vulnerability" without specifics, and equally avoid detail that would not change which control is chosen.
</leaf_nodes>

<example>
Root: Unauthorized Disclosure of Customer Records
  AND Gate: Admin Access Obtained and Records Retrieved
    OR Gate: Admin Session Obtained Without Authorization
      Leaf: Admin Login Lacks Phishing-Resistant MFA
      Leaf: Password Policy Permits Reused Credentials
    Leaf: Admin Role Permits Unrestricted Bulk Queries
  OR Gate: Records Reachable Without Authentication
    Leaf: Records API Accepts Unauthenticated Requests
    Leaf: Export Bucket Allows Public Read
</example>
</attack_tree_structure>

<mitre_attack_phases>
Classify each leaf using the MITRE ATT&CK tactics, in order: Reconnaissance, Resource Development, Initial Access, Execution, Persistence, Privilege Escalation, Defense Evasion, Credential Access, Discovery, Lateral Movement, Collection, Command and Control, Exfiltration, Impact.

A parent node's phase must not come after its children's phases in this sequence, since earlier stages enable later ones. Choose the tactic that best describes where the step sits in the lifecycle.
</mitre_attack_phases>

<scope_containment>
This is the most important set of rules. Violations here produce misleading threat models.

Every leaf must rest on a weakness within the declared threat model scope. Prerequisites may assume only baseline threat-actor capabilities: commodity software, social engineering, authenticated access appropriate to the scenario, and public information.

Do not introduce prerequisites that depend on a separate vulnerability class (XSS, SQLi, MITM, memory corruption, browser compromise, host-level access, network infrastructure compromise) unless an earlier node in the same path establishes it. Every path must be self-contained and possible within scope.

<shared_responsibility>
Respect the cloud shared responsibility model:

Include (customer responsibility): application code weaknesses, authentication/authorization weaknesses, insecure data handling, misconfigured IAM roles/policies/security groups, weak key management, insecure API usage, missing input validation, vulnerable dependencies, misconfigured customer-managed infrastructure.

Exclude (provider responsibility): cloud provider infrastructure, hypervisor/hardware, platform runtime, SaaS provider application defects, datacenter physical security, provider-managed internal systems.

For IaaS, customers control OS and above. For PaaS, customers control application and data. For SaaS, customers control configuration and data. Restrict all paths to the customer-controlled layer.
</shared_responsibility>
</scope_containment>

<quality_criteria>
A complete attack tree satisfies these criteria:

Completeness: multiple distinct paths (not a single linear chain), covering different skill levels and spanning multiple MITRE tactics. Include both high-likelihood and high-impact paths.

Plausibility: every path is credible for this architecture and grounded in well-known technique classes. Follow scope containment and shared responsibility boundaries.

Structural correctness: AND gates for complementary conditions, OR gates for alternatives to the same step. Phase ordering respected parent-to-child. Severity and likelihood propagate correctly through gates.

Actionability: every leaf points at a control that prevents or detects it, and every prerequisite is something the operator can monitor or enforce. Include only weaknesses the customer can control.
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

    # Build content with conditional cache points (Bedrock Converse only).
    # Both GPT transports (direct OpenAI and bedrock-runtime) cache implicitly.
    if MODEL_PROVIDER == "bedrock":
        content = [
            {"type": "text", "text": final_prompt},
            {"cachePoint": {"type": "default"}},
        ]
        return SystemMessage(content=content)
    else:
        return SystemMessage(content=final_prompt)


def _image_media_type(image_b64: str) -> str:
    """Detect the diagram's media type from its magic bytes. Converse rejects a
    declared type that does not match the bytes."""
    head = base64.b64decode(image_b64[:24])
    if head.startswith(b"\x89PNG"):
        return "image/png"
    if head.startswith(b"GIF8"):
        return "image/gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


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
The threat model for this system records the following threat. Build the attack tree for it:

<threat>
{threat_details}
</threat>
{context_section}

<task>
Create an attack tree that:
1. Uses the threat name as the root goal
2. Decomposes the threat into the distinct paths by which weaknesses in this system could let it be realized
3. Uses AND/OR logic gates to show how those weaknesses combine
4. Makes each leaf a specific weakness at design level, with the control that would break it
5. Classifies each step with MITRE ATT&CK tactics
6. Includes realistic severity, likelihood, and skill level assessments
7. Specifies prerequisites and technique categories for each step

Use the available tools to build the attack tree incrementally.
</task>
"""

    # Build content with conditional cache points (Bedrock Converse only).
    # Both GPT transports (direct OpenAI and bedrock-runtime) cache implicitly.
    if MODEL_PROVIDER == "bedrock":
        # If architecture image is provided, create multimodal message with cache point
        if architecture_image:
            message_content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": _image_media_type(architecture_image),
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
        # GPT (direct OpenAI or bedrock-runtime): caching is automatic, and images
        # ride as an image_url data URI — the Bedrock-native {"type": "image",
        # "source": {...}} block above is not valid on the Responses API. This
        # matches message_builder.base_msg.
        if architecture_image:
            message_content = [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{_image_media_type(architecture_image)};base64,{architecture_image}"
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
