"""
Attack Tree Agent Tools Module

This module defines the tools available to the attack tree generation agent.
The agent uses these tools to build, modify, and validate attack tree structures.
"""

from langchain.tools import tool, ToolRuntime
from langchain_core.messages import ToolMessage
from langgraph.types import Command
from typing import Union, Optional, Dict, Any, List
import time

from attack_tree_models import (
    AttackTreeLogical,
    LogicGate,
    AttackTechnique,
)
from config import config as app_config
from constants import JobState
from monitoring import logger
from state_tracking_service import StateService


# Initialize state service for status updates
state_service = StateService(app_config.agent_state_table)


# ============================================================================
# Tool: Create Complete Attack Tree
# ============================================================================


@tool(
    name_or_callable="create_attack_tree",
    description="Create or replace the entire attack tree structure at once. Use this to build the complete attack tree in a single operation with the goal and all children.",
)
def create_attack_tree(
    goal: str,
    children: List[Union[LogicGate, AttackTechnique]],
    runtime: ToolRuntime,
) -> Command:
    """
    Create or replace the entire attack tree structure.

    Args:
        goal: The main attack goal (root node label)
        children: List of top-level children (LogicGates or AttackTechniques)
        runtime: Tool runtime with state access

    Returns:
        Command with the new attack_tree state
    """
    attack_tree_id = runtime.state.get("attack_tree_id", "unknown")
    tool_use = runtime.state.get("tool_use", 0)

    logger.debug(
        "Tool invoked",
        tool="create_attack_tree",
        attack_tree_id=attack_tree_id,
        goal=goal,
        children_count=len(children),
        tool_use=tool_use,
    )

    try:
        # Create the complete attack tree
        attack_tree = AttackTreeLogical(goal=goal, children=children)

        logger.debug(
            "Created complete attack tree",
            tool="create_attack_tree",
            attack_tree_id=attack_tree_id,
            goal=goal,
            children_count=len(children),
        )

        # Update status
        state_service.update_job_state(
            attack_tree_id,
            JobState.THREAT.value,
            detail="Created attack tree structure",
        )

        # Increment tool use counter
        new_tool_use = tool_use + 1

        return Command(
            update={
                "attack_tree": attack_tree,
                "tool_use": new_tool_use,
                "messages": [
                    ToolMessage(
                        f"Successfully created attack tree with goal '{goal}' and {len(children)} top-level children.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )

    except Exception as e:
        logger.error(
            "Failed to create attack tree",
            tool="create_attack_tree",
            attack_tree_id=attack_tree_id,
            error=str(e),
            exc_info=True,
        )
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        f"Failed to create attack tree: {str(e)}",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )


# ============================================================================
# Tool: Read Attack Tree
# ============================================================================


@tool(
    name_or_callable="read_attack_tree",
    description="Read the current attack tree structure. Use this to inspect the current state of the attack tree before making modifications.",
)
def read_attack_tree(runtime: ToolRuntime) -> Command:
    """
    Read and return a summary of the current attack tree structure.

    Args:
        runtime: Tool runtime with state access

    Returns:
        Command with attack tree summary message
    """
    attack_tree_id = runtime.state.get("attack_tree_id", "unknown")
    attack_tree = runtime.state.get("attack_tree")

    logger.debug(
        "Tool invoked",
        tool="read_attack_tree",
        attack_tree_id=attack_tree_id,
    )

    if not attack_tree:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        "Attack tree is currently empty. No structure has been created yet.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    try:
        # Build a summary of the attack tree
        summary_lines = [
            "Attack Tree Summary:",
            f"Goal: {attack_tree.goal}",
            f"Top-level children: {len(attack_tree.children)}",
            "",
        ]

        # Recursively describe the tree structure
        def describe_node(
            node: Union[LogicGate, AttackTechnique], indent: int = 0
        ) -> List[str]:
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

        for i, child in enumerate(attack_tree.children):
            summary_lines.append(f"Child {i + 1}:")
            summary_lines.extend(describe_node(child, indent=1))
            summary_lines.append("")

        # Add statistics
        leaf_nodes = _collect_leaf_nodes(attack_tree)
        attack_phases = set(
            leaf.attack_phase
            for leaf in leaf_nodes
            if isinstance(leaf, AttackTechnique)
        )

        summary_lines.append("Statistics:")
        summary_lines.append(f"- Total attack techniques: {len(leaf_nodes)}")
        summary_lines.append(
            f"- Attack phases covered: {', '.join(sorted(attack_phases))}"
        )

        summary_text = "\n".join(summary_lines)

        logger.debug(
            "Read attack tree",
            tool="read_attack_tree",
            attack_tree_id=attack_tree_id,
            leaf_count=len(leaf_nodes),
            children_count=len(attack_tree.children),
        )

        return Command(
            update={
                "messages": [
                    ToolMessage(
                        summary_text,
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    except Exception as e:
        logger.error(
            "Failed to read attack tree",
            tool="read_attack_tree",
            attack_tree_id=attack_tree_id,
            error=str(e),
            exc_info=True,
        )
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        f"Failed to read attack tree: {str(e)}",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )


# ============================================================================
# Tool: Add Attack Node
# ============================================================================


@tool(
    name_or_callable="add_attack_node",
    description="Add a new node to the attack tree. Use this to build the attack tree structure by adding logic gates (AND/OR) or attack techniques (leaf nodes).",
)
def add_attack_node(
    node: Union[LogicGate, AttackTechnique],
    parent_path: Optional[List[int]],
    runtime: ToolRuntime,
) -> Command:
    """
    Add a node to the attack tree.

    Args:
        node: LogicGate or AttackTechnique to add
        parent_path: Path to parent node as list of child indices (None for root children)
                    Example: [0, 1] means first child's second child
        runtime: Tool runtime with state access

    Returns:
        Command with updated attack_tree state
    """
    attack_tree_id = runtime.state.get("attack_tree_id", "unknown")
    tool_use = runtime.state.get("tool_use", 0)
    attack_tree = runtime.state.get("attack_tree")

    logger.debug(
        "Tool invoked",
        tool="add_attack_node",
        attack_tree_id=attack_tree_id,
        node_type=type(node).__name__,
        parent_path=parent_path,
        tool_use=tool_use,
    )

    # Initialize attack tree if it doesn't exist
    if not attack_tree:
        # If no parent_path, this is a root-level child
        if parent_path is None or len(parent_path) == 0:
            attack_tree = AttackTreeLogical(
                goal=runtime.state.get("threat_name", "Attack Goal"), children=[node]
            )
            logger.debug(
                "Initialized attack tree with first child",
                tool="add_attack_node",
                attack_tree_id=attack_tree_id,
            )
        else:
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            "Cannot add node with parent_path when attack tree is empty. Add root-level children first (use parent_path=None).",
                            tool_call_id=runtime.tool_call_id,
                        )
                    ]
                }
            )
    else:
        # Add node to existing tree
        try:
            if parent_path is None or len(parent_path) == 0:
                # Add as root-level child
                attack_tree.children.append(node)
                logger.debug(
                    "Added node as root-level child",
                    tool="add_attack_node",
                    attack_tree_id=attack_tree_id,
                    child_index=len(attack_tree.children) - 1,
                )
            else:
                # Navigate to parent and add as child
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

                # Only LogicGate nodes can have children
                if not isinstance(parent, LogicGate):
                    return Command(
                        update={
                            "messages": [
                                ToolMessage(
                                    f"Cannot add child to AttackTechnique node at path {parent_path}. Only LogicGate nodes can have children.",
                                    tool_call_id=runtime.tool_call_id,
                                )
                            ]
                        }
                    )

                parent.children.append(node)
                logger.debug(
                    "Added node as child of parent",
                    tool="add_attack_node",
                    attack_tree_id=attack_tree_id,
                    parent_path=parent_path,
                    child_index=len(parent.children) - 1,
                )

        except Exception as e:
            logger.error(
                "Failed to add node",
                tool="add_attack_node",
                attack_tree_id=attack_tree_id,
                error=str(e),
                exc_info=True,
            )
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            f"Failed to add node: {str(e)}",
                            tool_call_id=runtime.tool_call_id,
                        )
                    ]
                }
            )

    # Update status
    state_service.update_job_state(
        attack_tree_id, JobState.THREAT.value, detail="Building attack tree"
    )

    # Increment tool use counter
    new_tool_use = tool_use + 1

    return Command(
        update={
            "attack_tree": attack_tree,
            "tool_use": new_tool_use,
            "messages": [
                ToolMessage(
                    f"Successfully added {type(node).__name__} node to attack tree.",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


# ============================================================================
# Tool: Update Attack Node
# ============================================================================


@tool(
    name_or_callable="update_attack_node",
    description="Update an existing node in the attack tree. Use this to modify node properties like description, impact severity, or other attributes.",
)
def update_attack_node(
    node_path: List[int],
    updates: Dict[str, Any],
    runtime: ToolRuntime,
) -> Command:
    """
    Update properties of an existing node.

    Args:
        node_path: Path to node as list of child indices
                  Example: [] for root, [0] for first child, [0, 1] for first child's second child
        updates: Dictionary of fields to update
        runtime: Tool runtime with state access

    Returns:
        Command with updated attack_tree state
    """
    attack_tree_id = runtime.state.get("attack_tree_id", "unknown")
    tool_use = runtime.state.get("tool_use", 0)
    attack_tree = runtime.state.get("attack_tree")

    logger.debug(
        "Tool invoked",
        tool="update_attack_node",
        attack_tree_id=attack_tree_id,
        node_path=node_path,
        updates=updates,
        tool_use=tool_use,
    )

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

    try:
        # Navigate to node
        if len(node_path) == 0:
            # Update root goal
            if "goal" in updates:
                attack_tree.goal = updates["goal"]
                logger.debug(
                    "Updated root goal",
                    tool="update_attack_node",
                    attack_tree_id=attack_tree_id,
                    new_goal=updates["goal"],
                )
            else:
                return Command(
                    update={
                        "messages": [
                            ToolMessage(
                                "To update root node, provide 'goal' in updates dictionary.",
                                tool_call_id=runtime.tool_call_id,
                            )
                        ]
                    }
                )
        else:
            # Navigate to child node
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

            # Update node fields
            updated_fields = []
            for field, value in updates.items():
                if hasattr(node, field):
                    setattr(node, field, value)
                    updated_fields.append(field)
                else:
                    logger.warning(
                        "Field not found on node",
                        tool="update_attack_node",
                        attack_tree_id=attack_tree_id,
                        field=field,
                        node_type=type(node).__name__,
                    )

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

            logger.debug(
                "Updated node fields",
                tool="update_attack_node",
                attack_tree_id=attack_tree_id,
                node_path=node_path,
                updated_fields=updated_fields,
            )

    except Exception as e:
        logger.error(
            "Failed to update node",
            tool="update_attack_node",
            attack_tree_id=attack_tree_id,
            error=str(e),
            exc_info=True,
        )
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        f"Failed to update node: {str(e)}",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    # Update status
    state_service.update_job_state(
        attack_tree_id, JobState.THREAT.value, detail="Refining attack tree"
    )

    # Increment tool use counter
    new_tool_use = tool_use + 1

    return Command(
        update={
            "attack_tree": attack_tree,
            "tool_use": new_tool_use,
            "messages": [
                ToolMessage(
                    f"Successfully updated node at path {node_path}.",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


# ============================================================================
# Tool: Delete Attack Node
# ============================================================================


@tool(
    name_or_callable="delete_attack_node",
    description="Delete a node and its children from the attack tree. Use this to remove incorrect or unnecessary attack paths.",
)
def delete_attack_node(
    node_path: List[int],
    runtime: ToolRuntime,
) -> Command:
    """
    Delete a node and all its descendants.

    Args:
        node_path: Path to node as list of child indices
                  Example: [0] for first child, [0, 1] for first child's second child
        runtime: Tool runtime with state access

    Returns:
        Command with updated attack_tree state
    """
    attack_tree_id = runtime.state.get("attack_tree_id", "unknown")
    tool_use = runtime.state.get("tool_use", 0)
    attack_tree = runtime.state.get("attack_tree")

    logger.debug(
        "Tool invoked",
        tool="delete_attack_node",
        attack_tree_id=attack_tree_id,
        node_path=node_path,
        tool_use=tool_use,
    )

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

    # Cannot delete root node
    if len(node_path) == 0:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        "Cannot delete root node. To change the goal, use update_attack_node.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    try:
        # Navigate to parent and remove child
        if len(node_path) == 1:
            # Delete root-level child
            child_index = node_path[0]
            if child_index < 0 or child_index >= len(attack_tree.children):
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

            deleted_node = attack_tree.children.pop(child_index)
            logger.debug(
                "Deleted root-level child",
                tool="delete_attack_node",
                attack_tree_id=attack_tree_id,
                child_index=child_index,
                node_type=type(deleted_node).__name__,
            )
        else:
            # Navigate to parent
            parent_path = node_path[:-1]
            child_index = node_path[-1]

            parent = _navigate_to_node(attack_tree, parent_path)
            if parent is None:
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

            # Only LogicGate nodes have children
            if not isinstance(parent, LogicGate):
                return Command(
                    update={
                        "messages": [
                            ToolMessage(
                                f"Invalid node_path {node_path}. Parent is not a LogicGate.",
                                tool_call_id=runtime.tool_call_id,
                            )
                        ]
                    }
                )

            if child_index < 0 or child_index >= len(parent.children):
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

            deleted_node = parent.children.pop(child_index)
            logger.debug(
                "Deleted child node",
                tool="delete_attack_node",
                attack_tree_id=attack_tree_id,
                parent_path=parent_path,
                child_index=child_index,
                node_type=type(deleted_node).__name__,
            )

    except Exception as e:
        logger.error(
            "Failed to delete node",
            tool="delete_attack_node",
            attack_tree_id=attack_tree_id,
            error=str(e),
            exc_info=True,
        )
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        f"Failed to delete node: {str(e)}",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    # Update status
    state_service.update_job_state(
        attack_tree_id, JobState.THREAT.value, detail="Refining attack tree"
    )

    # Increment tool use counter
    new_tool_use = tool_use + 1

    return Command(
        update={
            "attack_tree": attack_tree,
            "tool_use": new_tool_use,
            "messages": [
                ToolMessage(
                    f"Successfully deleted node at path {node_path} and all its children.",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


# ============================================================================
# Tool: Validate Attack Tree
# ============================================================================


@tool(
    name_or_callable="validate_attack_tree",
    description="Validate the attack tree for completeness and correctness. Use this to perform gap analysis and identify missing attack paths or incomplete nodes.",
)
def validate_attack_tree(runtime: ToolRuntime) -> Command:
    """
    Perform gap analysis on the attack tree.

    Checks:
    - Tree has exactly one root node (goal)
    - All attack paths are complete
    - All leaf nodes have required fields
    - Coverage of attack phases
    - Logical consistency of gates

    Args:
        runtime: Tool runtime with state access

    Returns:
        Command with validation results
    """
    attack_tree_id = runtime.state.get("attack_tree_id", "unknown")
    validate_tool_use = runtime.state.get("validate_tool_use", 0)
    tool_use = runtime.state.get("tool_use", 0)
    attack_tree = runtime.state.get("attack_tree")

    logger.debug(
        "Tool invoked",
        tool="validate_attack_tree",
        attack_tree_id=attack_tree_id,
        validate_tool_use=validate_tool_use,
        tool_use=tool_use,
    )

    if not attack_tree:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        "Validation failed: Attack tree is empty. Use add_attack_node to build the tree structure.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ]
            }
        )

    # Perform validation checks
    validation_issues = []

    # Check 1: Tree has children (at least one attack path)
    if not attack_tree.children or len(attack_tree.children) == 0:
        validation_issues.append(
            "Attack tree has no children. Add at least one attack path."
        )
    elif len(attack_tree.children) < 2:
        validation_issues.append(
            f"Attack tree has only {len(attack_tree.children)} child. "
            f"Add at least 2 children to represent distinct attack paths."
        )

    # Check 2: All leaf nodes have required fields
    leaf_nodes = _collect_leaf_nodes(attack_tree)
    for i, leaf in enumerate(leaf_nodes):
        if isinstance(leaf, AttackTechnique):
            # Check required fields
            if not leaf.name or leaf.name.strip() == "":
                validation_issues.append(f"Leaf node {i + 1} missing name")
            if not leaf.description or leaf.description.strip() == "":
                validation_issues.append(
                    f"Leaf node {i + 1} ({leaf.name}) missing description"
                )
            if not leaf.prerequisites or len(leaf.prerequisites) == 0:
                validation_issues.append(
                    f"Leaf node {i + 1} ({leaf.name}) missing prerequisites"
                )
            if not leaf.techniques or len(leaf.techniques) == 0:
                validation_issues.append(
                    f"Leaf node {i + 1} ({leaf.name}) missing techniques"
                )

    # Check 3: Coverage of attack phases
    attack_phases = set()
    for leaf in leaf_nodes:
        if isinstance(leaf, AttackTechnique):
            attack_phases.add(leaf.attack_phase)

    # # Recommend coverage of key phases
    # key_phases = ["Initial Access", "Execution", "Exfiltration"]
    # missing_key_phases = [phase for phase in key_phases if phase not in attack_phases]
    # if missing_key_phases:
    #     validation_issues.append(
    #         f"Consider adding attack techniques for these key phases: {', '.join(missing_key_phases)}"
    #     )

    # Check 4: Logical consistency of gates (includes root children and OR gate validation)
    gate_issues = _validate_gates(attack_tree)
    validation_issues.extend(gate_issues)

    # Update status
    state_service.update_job_state(
        attack_tree_id, JobState.THREAT.value, detail="Validating attack tree"
    )

    # Increment validate_tool_use counter
    new_validate_tool_use = validate_tool_use + 1

    # Build response message
    if len(validation_issues) == 0:
        logger.debug(
            "Validation passed",
            tool="validate_attack_tree",
            attack_tree_id=attack_tree_id,
            validate_tool_use=new_validate_tool_use,
            leaf_count=len(leaf_nodes),
            attack_phases=list(attack_phases),
        )

        return Command(
            update={
                "validate_tool_use": new_validate_tool_use,
                "validate_called_since_reset": True,
                "messages": [
                    ToolMessage(
                        f"Validation passed! Attack tree is complete and comprehensive.\n\n"
                        f"Summary:\n"
                        f"- Total leaf attack techniques: {len(leaf_nodes)}\n"
                        f"- Attack phases covered: {', '.join(sorted(attack_phases))}\n"
                        f"- All required fields present\n"
                        f"- Logical structure is consistent",
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )
    else:
        logger.debug(
            "Validation found issues",
            tool="validate_attack_tree",
            attack_tree_id=attack_tree_id,
            validate_tool_use=new_validate_tool_use,
            issue_count=len(validation_issues),
            issues=validation_issues,
        )

        issues_text = "\n".join([f"- {issue}" for issue in validation_issues])

        return Command(
            update={
                "validate_tool_use": new_validate_tool_use,
                "validate_called_since_reset": True,
                "messages": [
                    ToolMessage(
                        f"Validation identified {len(validation_issues)} issue(s):\n\n{issues_text}\n\n"
                        f"Please address these issues before completing the attack tree.",
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )


# ============================================================================
# Helper Functions
# ============================================================================


def _navigate_to_node(
    attack_tree: AttackTreeLogical, path: List[int]
) -> Optional[Union[LogicGate, AttackTechnique]]:
    """
    Navigate to a node in the attack tree using a path of child indices.

    Args:
        attack_tree: The attack tree to navigate
        path: List of child indices (e.g., [0, 1] means first child's second child)

    Returns:
        The node at the specified path, or None if path is invalid
    """
    if not path or len(path) == 0:
        return None

    current = attack_tree.children
    node = None

    for i, index in enumerate(path):
        if index < 0 or index >= len(current):
            logger.warning(
                "Invalid path index",
                path=path,
                current_depth=i,
                index=index,
                available_children=len(current),
            )
            return None

        node = current[index]

        # If not at end of path, navigate deeper
        if i < len(path) - 1:
            if isinstance(node, LogicGate):
                current = node.children
            else:
                # Cannot navigate deeper into AttackTechnique
                logger.warning(
                    "Cannot navigate deeper - node is AttackTechnique",
                    path=path,
                    current_depth=i,
                )
                return None

    return node


def _collect_leaf_nodes(attack_tree: AttackTreeLogical) -> List[AttackTechnique]:
    """
    Collect all leaf nodes (AttackTechnique) from the attack tree.

    Args:
        attack_tree: The attack tree to traverse

    Returns:
        List of all AttackTechnique nodes
    """
    leaf_nodes = []

    def traverse(node: Union[LogicGate, AttackTechnique]):
        if isinstance(node, AttackTechnique):
            leaf_nodes.append(node)
        elif isinstance(node, LogicGate):
            for child in node.children:
                traverse(child)

    for child in attack_tree.children:
        traverse(child)

    return leaf_nodes


def _validate_gates(attack_tree: AttackTreeLogical) -> List[str]:
    """
    Validate logical consistency of gates in the attack tree.

    Args:
        attack_tree: The attack tree to validate

    Returns:
        List of validation issues found
    """
    issues = []

    def traverse(node: Union[LogicGate, AttackTechnique], path: str):
        if isinstance(node, LogicGate):
            # Check that gate has at least 2 children
            if len(node.children) < 2:
                issues.append(
                    f"Logic gate at {path} has only {len(node.children)} child(ren). "
                    f"Gates should have at least 2 children to be meaningful."
                )

            # Check that gate has description
            if not node.description or node.description.strip() == "":
                issues.append(f"Logic gate at {path} missing description")

            # Traverse children
            for i, child in enumerate(node.children):
                traverse(child, f"{path}[{i}]")

    for i, child in enumerate(attack_tree.children):
        traverse(child, f"root[{i}]")

    # Call validation helpers and collect issues
    root_issues = _validate_root_children(attack_tree)
    issues.extend(root_issues)

    or_gate_issues = _validate_or_gate_children(attack_tree)
    issues.extend(or_gate_issues)

    return issues


def _validate_root_children(attack_tree: AttackTreeLogical) -> List[str]:
    """
    Validate that root node does not have direct leaf children.

    Args:
        attack_tree: The attack tree to validate

    Returns:
        List of validation issues found
    """
    issues = []

    for i, child in enumerate(attack_tree.children):
        if isinstance(child, AttackTechnique):
            issues.append(
                f"Root node has direct leaf child at index {i}: '{child.name}'. "
                f"Root should only have logic gates as children."
            )

    return issues


def _validate_or_gate_children(attack_tree: AttackTreeLogical) -> List[str]:
    """
    Validate OR gate children composition rules.

    Checks:
    1. OR gates cannot have AND gates as children
    2. Leaf children of OR gates must share the same attack phase

    Args:
        attack_tree: The attack tree to validate

    Returns:
        List of validation issues found
    """
    issues = []

    def traverse(node: Union[LogicGate, AttackTechnique], path: str):
        if isinstance(node, LogicGate):
            # Check OR gate specific rules
            if node.gate_type == "OR":
                # Check 1: OR gates cannot have AND gates as children
                for i, child in enumerate(node.children):
                    if isinstance(child, LogicGate) and child.gate_type == "AND":
                        issues.append(
                            f"OR gate at {path} contains AND gate as child at index {i}. "
                            f"OR gates cannot have AND gates as children."
                        )

                # Check 2: All leaf children must share the same attack phase
                leaf_children = [
                    child
                    for child in node.children
                    if isinstance(child, AttackTechnique)
                ]

                if len(leaf_children) > 0:
                    attack_phases = set(leaf.attack_phase for leaf in leaf_children)
                    if len(attack_phases) > 1:
                        phases_str = ", ".join(sorted(attack_phases))
                        issues.append(
                            f"OR gate at {path} has leaf children with inconsistent attack phases: {phases_str}. "
                            f"All leaf children should share the same attack phase."
                        )

            # Traverse children recursively
            for i, child in enumerate(node.children):
                traverse(child, f"{path}[{i}]")

    for i, child in enumerate(attack_tree.children):
        traverse(child, f"root[{i}]")

    return issues
