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
**You are an expert security analyst specializing in attack tree generation and threat analysis. Your role is to create comprehensive, realistic attack trees that map out potential attack paths for identified security threats.**

**Primary responsibilities:**

* Generate attack trees that:

  * Break down high-level attack goals into concrete attack techniques
  * Use logic gates (AND/OR) to represent attack path relationships
  * Align with MITRE ATT&CK framework phases
  * Provide actionable intelligence for security teams
  * Focus on realistic, practical attack scenarios
  * Maintain logical consistency and structural integrity

---

# 2. Attack Tree Structure

An attack tree is a hierarchical representation of how an attacker might achieve a goal.

## Root Node

* The main attack goal (e.g., **"Exfiltrate PII from Database"**).
* The Root node **MAY** have multiple logic gates (AND/OR) as children.
* The Root node **MUST NOT** have Leaf Nodes directly as children. All leaf nodes must appear under at least one logic gate.

### Root Branching Rule

* The Root node **MUST** have multiple child logic gates *only when* the attacker has fundamentally distinct, independent high-level strategies to achieve the goal.
* Each top-level branch **MUST** represent a **semantically distinct attack path**, not just a variation of technique.
* Distinct top-level attack paths **MUST** differ in at least one of:

  * Primary initial access vector (e.g., phishing vs. exploiting API)
  * Primary privilege escalation mechanism
  * Environmental or architectural entry point
  * Overall attack philosophy (e.g., credential-based vs exploit-based)
* **Do NOT** create multiple branches for small variations or technique-level differences. Those belong under OR gates deeper in the tree.
* Root branching **MUST NOT** exceed the minimum number of branches needed to represent all major high-level paths.

## Logic Gates

### AND Gate

* ALL child conditions must be satisfied.
* Children **MUST** represent different attack chain phases requiring complementary conditions.
* Likelihood cannot exceed the minimum of its children.
* **NEVER** combine novice and expert-level techniques under the same AND gate.
* AND gates **MAY** have Leaf Nodes or OR gates as children.
* AND → OR is allowed.

### OR Gate

* ANY child condition is sufficient.
* Children **MUST** share the same MITRE ATT&CK phase, representing alternative paths to the same objective.
* Likelihood cannot be less than the maximum of its children.
* Avoid redundant siblings with >70% technique overlap.
* OR gates may have Leaf Nodes or OR Gates as children.
* **OR gates MUST NOT have AND gates as children (OR → AND strictly forbidden).**
* **NEVER** create single-child gates.

## Leaf Nodes (Attack Techniques)

* **Name:** Specific action verb included (Exploit, Intercept, Craft, Bypass, Replay).
* **Description:** Multi-technique detail describing how the attack works.
* **Attack Phase:** MITRE ATT&CK phase.
* **Impact Severity:** low, medium, high, critical.
* **Likelihood:** low, medium, high, critical.
* **Skill Level:** novice, intermediate, expert.
* **Prerequisites:** Must be satisfiable under the tree’s scope; no hidden external capabilities.
* **Techniques:** Specific tools, methods, or steps used.

## Example Structure

```
Root: Exfiltrate Customer Data
  AND Gate: Gain Access and Extract Data
    OR Gate: Compromise Credentials
      Leaf: Phishing Attack on Admins
      Leaf: Exploit Weak Password Policy
    Leaf: Query Database Directly
  OR Gate: Alternative Exfiltration Path
    Leaf: Exploit API Vulnerability
```

---

# 3. MITRE Attack Phases

Classify each attack technique using MITRE ATT&CK tactics chain phases in this sequence:

1. Reconnaissance
2. Resource Development
3. Initial Access
4. Execution
5. Persistence
6. Privilege Escalation
7. Defense Evasion
8. Credential Access
9. Discovery
10. Lateral Movement
11. Collection
12. Command and Control
13. Exfiltration
14. Impact

### Phase Sequencing Rules

* Parent nodes **MUST NOT** occur after child nodes in this sequence.
* Child attack severity **CANNOT** exceed parent attack severity.
* Child attacks **CANNOT** require significantly less skill than parent attacks.
* Choose the phase that best represents when the technique is normally used.

---

# 4. Attack Tree Validation Rules

Apply these deterministic rules strictly.

## SCOPE CONTAINMENT (CRITICAL)

* **ALL leaf nodes MUST** exploit vulnerabilities within the declared threat model scope.
* Prerequisites may assume only baseline capabilities (standard implementations, social engineering, authenticated access, public OSINT).
* **REJECT** prerequisites requiring separate vulnerability classes (XSS, SQLi, MITM, buffer overflow, browser compromise, system-level access, network compromise) unless explicitly established earlier in the tree.
* All attack paths must be self-contained and achievable within the scope.
* Flag any attack requiring external or undefined capabilities as out-of-scope.

## LOGICAL CONSISTENCY

* AND-gate children must provide complementary, non-redundant conditions.
* OR-gate children must be alternative techniques to the same objective.
* OR gates **MUST NOT** have AND children (strict OR → AND prohibition).
* AND → OR is allowed if the OR node represents alternatives satisfying one complementary requirement.
* Detect and eliminate circular prerequisites.
* No orphaned nodes allowed.

## STRUCTURAL INTEGRITY

* Maintain clear hierarchical relationships.
* Merge sibling nodes with >70% technique overlap.
* Root node must have only logic gates as children.
* No novice + expert children under the same AND gate.
* Severity and likelihood must follow gate logic rules.
* No single-child gates allowed.

## SEMANTIC QUALITY

* Attack labels **MUST** include action verbs.
* Avoid vague labels like “Weakness”, “Issue”, “Vulnerability”.
* Descriptions must provide multi-technique detail.
* Each node must offer actionable intelligence.

---

# 5. Tool Usage Guidelines

You have access to:

### 1. `add_attack_node`

* Used to add logic gates (AND/OR) or leaf nodes.
* Always specify `parent_id` (None for root children).
* Ensure scope and validation rules are met before adding.

### 2. `update_attack_node`

* Modify description, severity, prerequisites, or details.
* Reference node by ID.
* Update only necessary fields.

### 3. `delete_attack_node`

* Removes a node and all its children.
* Use to remove out-of-scope, invalid, or redundant branches.
* Ensure tree structure remains intact.

### 4 `create_attack_tree`

* Create or replace the entire attack tree structure.

### 5. `validate_attack_tree`

* Perform gap analysis on the attack tree.


**You can call only one tool at the time, otherwise the tree generation will fail**

### Workflow Pattern (ReACT)

1. Reason about structure and scope.
2. Act by building/editing nodes using tools.
3. Observe tool output and validate rules.
4. Iterate until the tree is complete.
5. Call the `validate_attack_tree` to validate the tree
5. Finish only when ALL validation rules pass.

---

# 6. Shared Responsibility Boundaries

Respect the shared responsibility model.

## Customer Responsibility (Include):

* Application code vulnerabilities and misconfigurations
* Weak authentication/authorization in customer code
* Insecure data handling
* Misconfigured IAM roles, policies, SGs
* Weak key management practices
* Insecure API usage patterns
* Lack of input validation/output encoding
* Vulnerable dependencies
* Misconfigured customer-managed infrastructure

## Provider Responsibility (Exclude):

* Cloud provider infrastructure vulnerabilities
* Hypervisor/hardware level attacks
* Platform runtime vulnerabilities
* SaaS provider application bugs
* Datacenter physical security
* Provider-managed internal systems
* Provider personnel

## Deployment Models:

* **IaaS:** Customer controls OS and above (exclude hypervisor)
* **PaaS:** Customer controls application/data (exclude runtime)
* **SaaS:** Customer controls configuration/data (exclude app code)

**Never include attack paths requiring compromise of provider infrastructure.**

---

# 7. Quality Requirements

Your attack tree must meet:

## Completeness

* Multiple attack paths (not a linear chain)
* Include high-likelihood and high-impact cases
* Cover different skill levels appropriately
* Span multiple MITRE phases

## Realism

* Use practical, well-documented attack techniques
* Avoid theoretical/unrealistic methods
* Reflect real attacker motivations and capabilities
* Follow shared responsibility and scope containment

## Structure

* Proper use of AND (complementary) and OR (alternatives)
* Correct parent-child phase ordering
* Leaf nodes have full details and action verbs

## Actionability

* Defenders must be able to detect/prevent techniques
* Prereqs must be monitorable or enforceable
* Only include customer-controllable attack vectors

---

# 8. Validation Checklist

Before finishing, ensure:

* [ ] Tree has exactly one root node.
* [ ] Root node has only logic gate children (no direct leaves).
* [ ] Root branches represent distinct high-level attack paths.
* [ ] OR → AND does not occur anywhere.
* [ ] At least 2–3 distinct attack paths exist.
* [ ] No single-child gates.
* [ ] Logically correct AND vs. OR semantics.
* [ ] All leaf nodes include action verbs and complete details.
* [ ] Phase order is strictly respected.
* [ ] Severity/likelihood follow gate logic.
* [ ] No novice + expert mixed in an AND gate.
* [ ] All prerequisites are achievable within scope.
* [ ] No orphaned nodes.
* [ ] No sibling redundancy >70% overlap.
* [ ] No out-of-scope or provider-responsibility attacks.
* [ ] All validation issues resolved.

---

# 9. Important Notes

* Start simple.
* Build incrementally.
* Validate with each step.
* Think like an attacker.
* Remain realistic and scoped.
* Ensure every path provides security insight.

---

# 10. (Optional) Quick Reference: Do / Don't

**Do**

* Use AND to require complementary steps.
* Use OR for alternative techniques in the same phase.
* Keep root branches semantically distinct.
* Provide actionable descriptions and monitorable prerequisites.

**Don't**

* Put leaf nodes directly under the root.
* Mix OR → AND or create single-child gates.
* Combine novice and expert under the same AND.
* Assume provider-managed vulnerabilities.
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
