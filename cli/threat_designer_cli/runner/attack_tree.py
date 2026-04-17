"""
Attack tree generator using create_agent — fully self-contained.

Generates attack trees for individual threats using a ReACT agent with
tools for building, modifying, and validating tree structures. Converts
the final logical tree to React Flow format for the frontend.
"""

import base64
import threading
from typing import Any, Literal, Optional, Union

from langchain.agents import AgentState, create_agent
from langchain.tools import tool, ToolRuntime
from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.types import Command
from pydantic import Field
from typing_extensions import NotRequired
from langchain_aws.middleware import BedrockPromptCachingMiddleware

from ..config import CLIConfig
from ..models import effort_label, lookup_model
from ._shared import Strict, UsageTracker, image_url_block
from .caffeinate import prevent_sleep
from .model_factory import build_chat_model


# ============================================================================
# Pydantic Models (logical tree structure)
# ============================================================================

MitrePhase = Literal[
    "Reconnaissance",
    "Resource Development",
    "Initial Access",
    "Execution",
    "Persistence",
    "Privilege Escalation",
    "Defense Evasion",
    "Credential Access",
    "Discovery",
    "Lateral Movement",
    "Collection",
    "Command and Control",
    "Exfiltration",
    "Impact",
]


class AttackTechnique(Strict):
    """A concrete attack technique (leaf node)."""

    name: str = Field(..., description="Name of the attack technique")
    description: str = Field(
        ..., description="Detailed description of how the attack works"
    )
    attack_phase: MitrePhase = Field(..., description="MITRE ATT&CK kill chain phase")
    impact_severity: Literal["low", "medium", "high", "critical"] = Field(
        ..., description="Impact if attack succeeds"
    )
    likelihood: Literal["low", "medium", "high", "critical"] = Field(
        ..., description="Probability of attack occurring"
    )
    skill_level: Literal["novice", "intermediate", "expert"] = Field(
        ..., description="Skill level required"
    )
    prerequisites: list[str] = Field(
        ..., description="Conditions required before attack can be executed"
    )
    techniques: list[str] = Field(
        ..., description="Specific techniques and methods used"
    )


class LogicGate(Strict):
    """A logic gate combining multiple attack paths."""

    gate_type: Literal["AND", "OR"] = Field(
        ..., description="AND = all children required, OR = any child sufficient"
    )
    description: str = Field(..., description="What this gate represents")
    children: list[Union["LogicGate", AttackTechnique]] = Field(
        ..., description="Child nodes (gates or attack techniques)"
    )


class AttackTreeLogical(Strict):
    """Logical attack tree structure."""

    goal: str = Field(..., description="The main attack goal (root node)")
    children: list[Union[LogicGate, AttackTechnique]] = Field(
        ..., description="Top-level attack paths"
    )


LogicGate.model_rebuild()


# ============================================================================
# React Flow Converter
# ============================================================================


class AttackTreeConverter:
    """Converts logical attack tree to React Flow {nodes, edges} format."""

    def __init__(self):
        self.node_counter = 0
        self.nodes: list[dict] = []
        self.edges: list[dict] = []

    def _next_id(self) -> str:
        self.node_counter += 1
        return str(self.node_counter)

    def convert(self, logical_tree: AttackTreeLogical) -> dict:
        self.node_counter = 0
        self.nodes = []
        self.edges = []

        root_id = self._next_id()
        self.nodes.append(
            {"id": root_id, "type": "root", "data": {"label": logical_tree.goal}}
        )

        for child in logical_tree.children:
            child_id = self._process_node(child)
            self._create_edge(root_id, child_id, None)

        return {"nodes": self.nodes, "edges": self.edges}

    def _process_node(self, node: Union[LogicGate, AttackTechnique]) -> str:
        node_id = self._next_id()

        if isinstance(node, LogicGate):
            self.nodes.append(
                {
                    "id": node_id,
                    "type": f"{node.gate_type.lower()}-gate",
                    "data": {"label": node.description, "gateType": node.gate_type},
                }
            )
            for child in node.children:
                child_id = self._process_node(child)
                self._create_edge(node_id, child_id, node.gate_type)
        else:
            self.nodes.append(
                {
                    "id": node_id,
                    "type": "leaf-attack",
                    "data": {
                        "label": node.name,
                        "description": node.description,
                        "attackChainPhase": node.attack_phase,
                        "impactSeverity": node.impact_severity,
                        "likelihood": node.likelihood,
                        "skillLevel": node.skill_level,
                        "prerequisites": node.prerequisites,
                        "techniques": node.techniques,
                    },
                }
            )

        return node_id

    def _create_edge(
        self, source_id: str, target_id: str, gate_type: Optional[str]
    ) -> None:
        if gate_type == "AND":
            color = "#7eb3d5"
        elif gate_type == "OR":
            color = "#c97a9e"
        else:
            color = "#555"

        self.edges.append(
            {
                "id": f"e{source_id}-{target_id}",
                "source": source_id,
                "target": target_id,
                "type": "smoothstep",
                "style": {
                    "stroke": color,
                    "strokeWidth": 2,
                    "strokeDasharray": "5, 5",
                },
                "markerEnd": {
                    "type": "arrowclosed",
                    "width": 25,
                    "height": 25,
                    "color": color,
                },
                "animated": True,
            }
        )


# ============================================================================
# Agent State
# ============================================================================


class AttackTreeState(AgentState):
    attack_tree: NotRequired[AttackTreeLogical | None]
    tool_use: NotRequired[int]
    validate_tool_use: NotRequired[int]


# ============================================================================
# Tools
# ============================================================================


@tool(
    name_or_callable="create_attack_tree",
    description=(
        "Create or replace the entire attack tree structure at once. "
        "Use this to build the complete attack tree in a single operation."
    ),
)
def create_attack_tree(
    goal: str,
    children: list[Union[LogicGate, AttackTechnique]],
    runtime: ToolRuntime,
) -> Command:
    """Create or replace the entire attack tree."""
    tool_use = runtime.state.get("tool_use", 0)
    attack_tree = AttackTreeLogical(goal=goal, children=children)
    return Command(
        update={
            "attack_tree": attack_tree,
            "tool_use": tool_use + 1,
            "messages": [
                ToolMessage(
                    f"Created attack tree with goal '{goal}' and {len(children)} top-level children.",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


@tool(
    name_or_callable="read_attack_tree",
    description=(
        "Read the current attack tree structure. Use this to inspect the tree "
        "before making modifications."
    ),
)
def read_attack_tree(runtime: ToolRuntime) -> Command:
    """Read and return a summary of the current attack tree."""
    attack_tree: AttackTreeLogical | None = runtime.state.get("attack_tree")

    if not attack_tree:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        "Attack tree is empty. No structure has been created yet.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    def describe_node(
        node: Union[LogicGate, AttackTechnique], indent: int = 0
    ) -> list[str]:
        lines = []
        prefix = "  " * indent
        if isinstance(node, LogicGate):
            lines.append(f"{prefix}- {node.gate_type} Gate: {node.description}")
            lines.append(f"{prefix}  Children: {len(node.children)}")
            for child in node.children:
                lines.extend(describe_node(child, indent + 1))
        elif isinstance(node, AttackTechnique):
            lines.append(f"{prefix}- Attack: {node.name}")
            lines.append(f"{prefix}  Phase: {node.attack_phase}")
            lines.append(f"{prefix}  Impact: {node.impact_severity}")
            lines.append(f"{prefix}  Likelihood: {node.likelihood}")
        return lines

    summary_lines = [
        "Attack Tree Summary:",
        f"Goal: {attack_tree.goal}",
        f"Top-level children: {len(attack_tree.children)}",
        "",
    ]
    for i, child in enumerate(attack_tree.children):
        summary_lines.append(f"Child {i + 1}:")
        summary_lines.extend(describe_node(child, indent=1))
        summary_lines.append("")

    leaf_nodes = _collect_leaf_nodes(attack_tree)
    phases = {
        leaf.attack_phase for leaf in leaf_nodes if isinstance(leaf, AttackTechnique)
    }
    summary_lines.append("Statistics:")
    summary_lines.append(f"- Total attack techniques: {len(leaf_nodes)}")
    summary_lines.append(f"- Attack phases covered: {', '.join(sorted(phases))}")

    return Command(
        update={
            "messages": [
                ToolMessage(
                    "\n".join(summary_lines),
                    tool_call_id=runtime.tool_call_id,
                )
            ]
        }
    )


@tool(
    name_or_callable="add_attack_node",
    description=(
        "Add a new node to the attack tree. Use this to add logic gates (AND/OR) "
        "or attack techniques (leaf nodes)."
    ),
)
def add_attack_node(
    node: Union[LogicGate, AttackTechnique],
    parent_path: Optional[list[int]],
    runtime: ToolRuntime,
) -> Command:
    """Add a node to the attack tree."""
    tool_use = runtime.state.get("tool_use", 0)
    attack_tree: AttackTreeLogical | None = runtime.state.get("attack_tree")

    if not attack_tree:
        if parent_path is None or len(parent_path) == 0:
            threat_name = runtime.state.get("threat_name", "Attack Goal")
            attack_tree = AttackTreeLogical(goal=threat_name, children=[node])
        else:
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            "Cannot add node with parent_path when tree is empty. "
                            "Add root-level children first (parent_path=None).",
                            tool_call_id=runtime.tool_call_id,
                        )
                    ]
                }
            )
    else:
        if parent_path is None or len(parent_path) == 0:
            attack_tree.children.append(node)
        else:
            parent = _navigate_to_node(attack_tree, parent_path)
            if parent is None:
                return Command(
                    update={
                        "messages": [
                            ToolMessage(
                                f"Invalid parent_path {parent_path}. Could not find parent node.",
                                tool_call_id=runtime.tool_call_id,
                            )
                        ]
                    }
                )
            if not isinstance(parent, LogicGate):
                return Command(
                    update={
                        "messages": [
                            ToolMessage(
                                f"Cannot add child to AttackTechnique at path {parent_path}. "
                                "Only LogicGate nodes can have children.",
                                tool_call_id=runtime.tool_call_id,
                            )
                        ]
                    }
                )
            parent.children.append(node)

    return Command(
        update={
            "attack_tree": attack_tree,
            "tool_use": tool_use + 1,
            "messages": [
                ToolMessage(
                    f"Added {type(node).__name__} node to attack tree.",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


@tool(
    name_or_callable="update_attack_node",
    description=(
        "Update an existing node in the attack tree. Modify node properties "
        "like description, impact severity, or other attributes."
    ),
)
def update_attack_node(
    node_path: list[int],
    updates: dict[str, Any],
    runtime: ToolRuntime,
) -> Command:
    """Update properties of an existing node."""
    tool_use = runtime.state.get("tool_use", 0)
    attack_tree: AttackTreeLogical | None = runtime.state.get("attack_tree")

    if not attack_tree:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        "Cannot update node: attack tree is empty.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    if len(node_path) == 0:
        if "goal" in updates:
            attack_tree.goal = updates["goal"]
        else:
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            "To update root node, provide 'goal' in updates.",
                            tool_call_id=runtime.tool_call_id,
                        )
                    ]
                }
            )
    else:
        node = _navigate_to_node(attack_tree, node_path)
        if node is None:
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            f"Invalid node_path {node_path}. Could not find node.",
                            tool_call_id=runtime.tool_call_id,
                        )
                    ]
                }
            )
        updated_fields = []
        for field, value in updates.items():
            if hasattr(node, field):
                setattr(node, field, value)
                updated_fields.append(field)
        if not updated_fields:
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            f"No valid fields to update. Node type: {type(node).__name__}",
                            tool_call_id=runtime.tool_call_id,
                        )
                    ]
                }
            )

    return Command(
        update={
            "attack_tree": attack_tree,
            "tool_use": tool_use + 1,
            "messages": [
                ToolMessage(
                    f"Updated node at path {node_path}.",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


@tool(
    name_or_callable="delete_attack_node",
    description=(
        "Delete a node and its children from the attack tree. "
        "Use this to remove incorrect or unnecessary attack paths."
    ),
)
def delete_attack_node(
    node_path: list[int],
    runtime: ToolRuntime,
) -> Command:
    """Delete a node and all its descendants."""
    tool_use = runtime.state.get("tool_use", 0)
    attack_tree: AttackTreeLogical | None = runtime.state.get("attack_tree")

    if not attack_tree:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        "Cannot delete node: attack tree is empty.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    if len(node_path) == 0:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        "Cannot delete root node. Use update_attack_node to change the goal.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    if len(node_path) == 1:
        idx = node_path[0]
        if idx < 0 or idx >= len(attack_tree.children):
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            f"Invalid node_path {node_path}. Index out of range.",
                            tool_call_id=runtime.tool_call_id,
                        )
                    ]
                }
            )
        attack_tree.children.pop(idx)
    else:
        parent_path = node_path[:-1]
        child_idx = node_path[-1]
        parent = _navigate_to_node(attack_tree, parent_path)
        if parent is None or not isinstance(parent, LogicGate):
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            f"Invalid node_path {node_path}. Could not find parent node.",
                            tool_call_id=runtime.tool_call_id,
                        )
                    ]
                }
            )
        if child_idx < 0 or child_idx >= len(parent.children):
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            f"Invalid node_path {node_path}. Index out of range.",
                            tool_call_id=runtime.tool_call_id,
                        )
                    ]
                }
            )
        parent.children.pop(child_idx)

    return Command(
        update={
            "attack_tree": attack_tree,
            "tool_use": tool_use + 1,
            "messages": [
                ToolMessage(
                    f"Deleted node at path {node_path} and all its children.",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


@tool(
    name_or_callable="validate_attack_tree",
    description=(
        "Validate the attack tree for completeness and correctness. "
        "Performs gap analysis and identifies missing attack paths or incomplete nodes."
    ),
)
def validate_attack_tree(runtime: ToolRuntime) -> Command:
    """Perform gap analysis on the attack tree."""
    validate_tool_use = runtime.state.get("validate_tool_use", 0)
    attack_tree: AttackTreeLogical | None = runtime.state.get("attack_tree")

    if not attack_tree:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        "Validation failed: Attack tree is empty. "
                        "Use add_attack_node to build the tree structure.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    issues: list[str] = []

    # Check children count
    if not attack_tree.children:
        issues.append("Attack tree has no children. Add at least one attack path.")
    elif len(attack_tree.children) < 2:
        issues.append(
            f"Attack tree has only {len(attack_tree.children)} child. "
            "Add at least 2 children to represent distinct attack paths."
        )

    # Validate leaf nodes
    leaf_nodes = _collect_leaf_nodes(attack_tree)
    for i, leaf in enumerate(leaf_nodes):
        if isinstance(leaf, AttackTechnique):
            if not leaf.name or not leaf.name.strip():
                issues.append(f"Leaf node {i + 1} missing name")
            if not leaf.description or not leaf.description.strip():
                issues.append(f"Leaf node {i + 1} ({leaf.name}) missing description")
            if not leaf.prerequisites:
                issues.append(f"Leaf node {i + 1} ({leaf.name}) missing prerequisites")
            if not leaf.techniques:
                issues.append(f"Leaf node {i + 1} ({leaf.name}) missing techniques")

    # Check phase coverage
    phases = set()
    for leaf in leaf_nodes:
        if isinstance(leaf, AttackTechnique):
            phases.add(leaf.attack_phase)

    # Validate gate structure
    issues.extend(_validate_gates(attack_tree))

    new_validate_use = validate_tool_use + 1

    if not issues:
        return Command(
            update={
                "validate_tool_use": new_validate_use,
                "messages": [
                    ToolMessage(
                        f"Validation passed! Attack tree is complete.\n\n"
                        f"Summary:\n"
                        f"- Total leaf attack techniques: {len(leaf_nodes)}\n"
                        f"- Attack phases covered: {', '.join(sorted(phases))}\n"
                        f"- All required fields present\n"
                        f"- Logical structure is consistent",
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )

    issues_text = "\n".join(f"- {issue}" for issue in issues)
    return Command(
        update={
            "validate_tool_use": new_validate_use,
            "messages": [
                ToolMessage(
                    f"Validation identified {len(issues)} issue(s):\n\n{issues_text}\n\n"
                    "Please address these issues before completing the attack tree.",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


# ============================================================================
# Helper Functions
# ============================================================================


def _navigate_to_node(
    attack_tree: AttackTreeLogical, path: list[int]
) -> Union[LogicGate, AttackTechnique, None]:
    if not path:
        return None
    current = attack_tree.children
    node = None
    for i, index in enumerate(path):
        if index < 0 or index >= len(current):
            return None
        node = current[index]
        if i < len(path) - 1:
            if isinstance(node, LogicGate):
                current = node.children
            else:
                return None
    return node


def _collect_leaf_nodes(
    attack_tree: AttackTreeLogical,
) -> list[AttackTechnique]:
    leaves: list[AttackTechnique] = []

    def traverse(node: Union[LogicGate, AttackTechnique]) -> None:
        if isinstance(node, AttackTechnique):
            leaves.append(node)
        elif isinstance(node, LogicGate):
            for child in node.children:
                traverse(child)

    for child in attack_tree.children:
        traverse(child)
    return leaves


def _validate_gates(attack_tree: AttackTreeLogical) -> list[str]:
    issues: list[str] = []

    def traverse(node: Union[LogicGate, AttackTechnique], path: str) -> None:
        if isinstance(node, LogicGate):
            if len(node.children) < 2:
                issues.append(
                    f"Logic gate at {path} has only {len(node.children)} child(ren). "
                    "Gates should have at least 2 children."
                )
            if not node.description or not node.description.strip():
                issues.append(f"Logic gate at {path} missing description")

            # OR gate cannot contain AND gate children
            if node.gate_type == "OR":
                for j, child in enumerate(node.children):
                    if isinstance(child, LogicGate) and child.gate_type == "AND":
                        issues.append(
                            f"OR gate at {path} contains AND gate as child at index {j}. "
                            "OR gates cannot have AND gates as children."
                        )
                # Leaf children of OR gates should share the same phase
                leaf_children = [
                    c for c in node.children if isinstance(c, AttackTechnique)
                ]
                if len(leaf_children) > 1:
                    leaf_phases = {lc.attack_phase for lc in leaf_children}
                    if len(leaf_phases) > 1:
                        issues.append(
                            f"OR gate at {path} has leaf children with inconsistent "
                            f"attack phases: {', '.join(sorted(leaf_phases))}."
                        )

            for j, child in enumerate(node.children):
                traverse(child, f"{path}[{j}]")

    # Root children should be logic gates
    for i, child in enumerate(attack_tree.children):
        if isinstance(child, AttackTechnique):
            issues.append(
                f"Root node has direct leaf child at index {i}: '{child.name}'. "
                "Root should only have logic gates as children."
            )
        traverse(child, f"root[{i}]")

    return issues


# ============================================================================
# System Prompt
# ============================================================================

ATTACK_TREE_SYSTEM_PROMPT = """\
<role>
You are an expert security analyst specializing in attack tree generation and threat \
analysis. You create comprehensive, realistic attack trees that map potential attack \
paths for identified security threats, aligned with the MITRE ATT&CK framework.
</role>

<tool_usage>
You have access to five tools: add_attack_node, update_attack_node, delete_attack_node, \
create_attack_tree, and validate_attack_tree.

CRITICAL: Call exactly one tool per turn. Calling multiple tools in a single turn will \
cause tree generation to fail.

<tool name="add_attack_node">
Adds a logic gate (AND/OR) or leaf node to the tree. Always specify parent_path (None \
for root-level children). Verify scope and validation rules are satisfied before adding.
</tool>

<tool name="update_attack_node">
Modifies an existing node's description, severity, prerequisites, or other details by \
node path. Update only the fields that need to change.
</tool>

<tool name="delete_attack_node">
Removes a node and all its descendants. Use this for out-of-scope, invalid, or \
redundant branches. Verify the remaining tree structure stays valid after deletion.
</tool>

<tool name="create_attack_tree">
Creates or replaces the entire attack tree structure at once.
</tool>

<tool name="validate_attack_tree">
Performs gap analysis and rule validation on the current tree. Always call this as \
your final step before finishing.
</tool>
</tool_usage>

<workflow>
Follow this incremental build-and-validate cycle:

1. REASON: Before each tool call, articulate your current understanding of the tree \
state, what structural gap you're filling, and which rules apply.

2. ACT: Make a single tool call to build or modify the tree.

3. REFLECT: After receiving tool output, evaluate whether the result maintains structural \
integrity, logical consistency, and scope containment.

4. ITERATE: Repeat steps 1-3 until the tree is complete.

5. VALIDATE: Call validate_attack_tree as your final action. Resolve any issues it \
surfaces before finishing.

Start with the root node and high-level structure, then flesh out branches incrementally.
</workflow>

<attack_tree_structure>
An attack tree is a hierarchical representation of how an attacker might achieve a goal. \
It has three node types: one Root, Logic Gates, and Leaf Nodes.

<root_node>
The root is the main attack goal. It serves only as a structural anchor.

Root children must be logic gates -- place all leaf nodes under at least one logic gate. \
When the root has multiple child gates, each top-level branch must represent a \
fundamentally distinct attack strategy.
</root_node>

<logic_gates>
AND gates require ALL children to be satisfied. Use them when an attack path needs \
complementary conditions from different phases. AND gates may contain leaf nodes or \
OR gates as children.

OR gates require ANY one child to succeed. Use them when multiple alternative techniques \
can achieve the same objective. All children of an OR gate should share the same MITRE \
ATT&CK phase. OR gates may contain leaf nodes or other OR gates as children, but not \
AND gates.

Every gate must have at least two children.
</logic_gates>

<leaf_nodes>
Leaf nodes represent specific attack techniques. Each must include:
- Name: Include a specific action verb
- Description: Multi-technique detail explaining how the attack works
- Attack Phase: MITRE ATT&CK phase
- Impact Severity: low, medium, high, or critical
- Likelihood: low, medium, high, or critical
- Skill Level: novice, intermediate, or expert
- Prerequisites: Conditions required
- Techniques: Specific tools, methods, or steps used
</leaf_nodes>
</attack_tree_structure>

<mitre_attack_phases>
Classify each leaf node using MITRE ATT&CK tactics: Reconnaissance, Resource Development, \
Initial Access, Execution, Persistence, Privilege Escalation, Defense Evasion, Credential \
Access, Discovery, Lateral Movement, Collection, Command and Control, Exfiltration, Impact.

Phase sequencing matters: a parent node's phase must not come after its child nodes.
</mitre_attack_phases>

<scope_containment>
All leaf nodes must exploit vulnerabilities within the declared threat model scope. Do not \
introduce prerequisites that require separate vulnerability classes unless established by \
an earlier node in the same attack path.

Respect the cloud shared responsibility model: include customer-controlled attack paths, \
exclude provider-infrastructure attacks.
</scope_containment>

<quality_criteria>
Completeness: multiple distinct attack paths covering different skill levels and MITRE phases.
Realism: practical, well-documented attack techniques.
Structural correctness: AND for complementary conditions, OR for alternatives.
Actionability: every technique should be detectable or preventable by defenders.
</quality_criteria>"""


# ============================================================================
# Human Message Builder
# ============================================================================


def _build_human_message(
    threat: dict,
    model_data: dict,
    architecture_image: Optional[str] = None,
) -> HumanMessage:
    """Build the human message with threat context for attack tree generation."""
    # Build threat details
    threat_details = (
        f"**Name**: {threat.get('name', 'Unknown Threat')}\n\n"
        f"**Description**: {threat.get('description', 'No description provided')}"
    )

    for key, label in [
        ("target", "Target Asset"),
        ("source", "Threat Source"),
        ("stride_category", "STRIDE Category"),
        ("likelihood", "Likelihood"),
        ("impact", "Impact"),
    ]:
        if threat.get(key):
            threat_details += f"\n\n**{label}**: {threat[key]}"

    if threat.get("prerequisites"):
        prereqs = threat["prerequisites"]
        if isinstance(prereqs, list):
            prereqs_text = "\n".join(f"  - {p}" for p in prereqs)
        else:
            prereqs_text = str(prereqs)
        threat_details += f"\n\n**Prerequisites**:\n{prereqs_text}"

    if threat.get("mitigations"):
        mits = threat["mitigations"]
        if isinstance(mits, list):
            mits_text = "\n".join(f"  - {m}" for m in mits)
        else:
            mits_text = str(mits)
        threat_details += f"\n\n**Existing Mitigations**:\n{mits_text}"

    # Build context from model data
    context_parts = []
    if model_data.get("description"):
        context_parts.append(f"Threat Model Description:\n{model_data['description']}")

    threat_target = threat.get("target")
    for asset in (model_data.get("assets") or {}).get("assets", []):
        if asset.get("name") == threat_target:
            asset_text = (
                f"Name: {asset['name']}\nDescription: {asset.get('description', '')}"
            )
            if asset.get("data_classification"):
                asset_text += f"\nData Classification: {asset['data_classification']}"
            context_parts.append(f"Target Asset:\n{asset_text}")
            break

    threat_source_name = threat.get("source")
    sys_arch = model_data.get("system_architecture") or {}
    for ts in sys_arch.get("threat_sources", []):
        if ts.get("category") == threat_source_name:
            source_text = (
                f"Category: {ts['category']}\n"
                f"Description: {ts.get('description', '')}\n"
                f"Example: {ts.get('example', '')}"
            )
            context_parts.append(f"Threat Source:\n{source_text}")
            break

    context_section = ""
    if context_parts:
        context_section = (
            f"\n<threat_model_context>\n"
            f"{chr(10).join(context_parts)}\n"
            f"</threat_model_context>\n"
        )

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

Start by reasoning about the threat and planning your approach, then use the \
available tools to build the attack tree incrementally.
</task>
"""

    content: list[dict] = []
    if architecture_image:
        content.append(image_url_block(architecture_image, "image/png"))
    content.append({"type": "text", "text": message_text})

    return HumanMessage(content=content)


# ============================================================================
# Agent Builder
# ============================================================================


ATTACK_TREE_TOOLS = [
    create_attack_tree,
    read_attack_tree,
    add_attack_node,
    update_attack_node,
    delete_attack_node,
    validate_attack_tree,
]


def build_attack_tree_agent(cfg: CLIConfig):
    """Build the attack tree agent. Returns a compiled LangGraph agent."""
    provider = cfg.provider or "bedrock"
    model_props = lookup_model(provider, cfg.model_id)

    built = build_chat_model(
        provider=provider,
        model_id=cfg.model_id,
        reasoning_effort=effort_label(cfg.reasoning_level, model_props),
        aws_region=cfg.aws_region,
        aws_profile=cfg.aws_profile,
        openai_api_key=cfg.effective_openai_key(),
    )

    middleware_chain: list = []
    if built.is_bedrock:
        middleware_chain.append(BedrockPromptCachingMiddleware())

    return create_agent(
        model=built.model,
        tools=ATTACK_TREE_TOOLS,
        state_schema=AttackTreeState,
        middleware=middleware_chain,
        system_prompt=ATTACK_TREE_SYSTEM_PROMPT,
    )


# ============================================================================
# Runner (public API — same signature as before)
# ============================================================================


def run_attack_tree(
    threat: dict,
    model_data: dict,
    cfg: CLIConfig,
    on_event: Optional[callable] = None,
    stop_event: Optional[threading.Event] = None,
) -> Optional[dict]:
    """
    Generate an attack tree for a single threat.

    Returns React Flow {nodes, edges} dict, or None on failure.
    """
    agent = build_attack_tree_agent(cfg)

    # Load architecture image if available
    architecture_image = None
    image_path = model_data.get("image_path")
    if image_path:
        try:
            with open(image_path, "rb") as fh:
                architecture_image = base64.b64encode(fh.read()).decode()
        except Exception:
            pass

    human_message = _build_human_message(threat, model_data, architecture_image)

    initial_state = {
        "messages": [human_message],
        "attack_tree": None,
        "tool_use": 0,
        "validate_tool_use": 0,
        "threat_name": threat.get("name", ""),
    }

    usage_tracker = UsageTracker()
    config = {"recursion_limit": 100}

    attack_tree_logical: AttackTreeLogical | None = None
    _seen_tc_ids: set = set()

    if on_event:
        on_event("Processing...")

    try:
        with prevent_sleep():
            for mode, data in agent.stream(
                initial_state, config, stream_mode=["messages", "updates"]
            ):
                if stop_event and stop_event.is_set():
                    break

                if mode == "updates":
                    for node_name, node_updates in data.items():
                        if isinstance(node_updates, dict):
                            if node_updates.get("attack_tree"):
                                attack_tree_logical = node_updates["attack_tree"]
                            # Collect usage from AI messages in state updates
                            for msg in node_updates.get("messages", []):
                                um = getattr(msg, "usage_metadata", None)
                                if um and um.get("input_tokens"):
                                    usage_tracker.add(um)

                elif mode == "messages":
                    msg_chunk, metadata = data
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
                                    on_event(tc_name)
    except Exception:
        pass

    if not attack_tree_logical:
        return None

    result = AttackTreeConverter().convert(attack_tree_logical)
    result["token_usage"] = usage_tracker.to_dict()
    return result
