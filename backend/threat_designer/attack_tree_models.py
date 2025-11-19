"""
Pydantic models for Attack Tree generation.

This module defines:
1. Simple logical models for LLM to generate attack tree structure
2. Converter functions to transform logical structure into React Flow format

Usage:
    # LLM generates simple logical structure
    from attack_tree_models import AttackTreeLogical

    tree = AttackTreeLogical(
        goal="Exfiltrate PII from Cognito",
        children=[...]
    )

    # Convert to React Flow format
    react_flow_data = tree.to_react_flow()
"""

from typing import List, Optional, Literal, Union
from pydantic import BaseModel, Field


# ============================================================================
# PART 1: Simple Logical Models for LLM Generation
# ============================================================================


class AttackTechnique(BaseModel):
    """
    A concrete attack technique (leaf node in the tree).
    This is what the LLM should generate.
    """

    name: str = Field(..., description="Name of the attack technique")

    description: str = Field(
        ..., description="Detailed description of how the attack works"
    )

    attack_phase: Literal[
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
    ] = Field(..., description="MITRE ATT&CK kill chain phase")

    impact_severity: Literal["low", "medium", "high", "critical"] = Field(
        ..., description="Impact if attack succeeds"
    )

    likelihood: Literal["low", "medium", "high", "critical"] = Field(
        ..., description="Probability of attack occurring"
    )

    skill_level: Literal["novice", "intermediate", "expert"] = Field(
        ..., description="Skill level required"
    )

    prerequisites: List[str] = Field(
        ..., description="Conditions required before attack can be executed"
    )

    techniques: List[str] = Field(
        ..., description="Specific techniques and methods used"
    )


class LogicGate(BaseModel):
    """
    A logic gate combining multiple attack paths.
    """

    gate_type: Literal["AND", "OR"] = Field(
        ..., description="AND = all children required, OR = any child sufficient"
    )

    description: str = Field(..., description="What this gate represents")

    children: List[Union["LogicGate", AttackTechnique]] = Field(
        ..., description="Child nodes (gates or attack techniques)"
    )


class AttackTreeLogical(BaseModel):
    """
    Logical attack tree structure for LLM generation.

    The LLM should generate this simple hierarchical structure,
    which will be converted to React Flow format automatically.
    """

    goal: str = Field(..., description="The main attack goal (root node)")

    children: List[Union[LogicGate, AttackTechnique]] = Field(
        ..., description="Top-level attack paths"
    )

    def to_react_flow(self) -> dict:
        """Convert logical structure to React Flow format."""
        converter = AttackTreeConverter()
        return converter.convert(self)

    class Config:
        json_schema_extra = {
            "example": {
                "goal": "Exfiltrate PII from All Cognito Users",
                "children": [
                    {
                        "gate_type": "AND",
                        "description": "Gain Access and Extract Data",
                        "children": [
                            {
                                "gate_type": "OR",
                                "description": "Compromise Credentials",
                                "children": [
                                    {
                                        "name": "Phishing Attack on Admin Users",
                                        "description": "Targeted phishing to steal admin credentials",
                                        "attack_phase": "Initial Access",
                                        "impact_severity": "high",
                                        "likelihood": "high",
                                        "skill_level": "intermediate",
                                        "prerequisites": [
                                            "Identify admin email addresses",
                                            "Create convincing phishing content",
                                        ],
                                        "techniques": [
                                            "Spear phishing emails",
                                            "Clone legitimate login pages",
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
        }


# Allow forward references
LogicGate.model_rebuild()


# ============================================================================
# PART 2: React Flow Format Models (for conversion output)
# ============================================================================


class NodeData(BaseModel):
    """Base data for all node types."""

    label: str = Field(..., description="The text label displayed on the node")


class RootNodeData(NodeData):
    """Data for root goal nodes (the main attack objective)."""

    pass


class GateNodeData(NodeData):
    """Data for logic gate nodes (AND/OR gates)."""

    gateType: Literal["AND", "OR"] = Field(..., description="Type of logic gate")


class LeafAttackNodeData(NodeData):
    """
    Data for leaf attack nodes (actual attack techniques).

    These nodes represent concrete attack steps with detailed information
    about how the attack is performed, its prerequisites, and impact.
    """

    # Required fields
    attackChainPhase: Literal[
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
    ] = Field(..., description="MITRE ATT&CK kill chain phase")

    impactSeverity: Literal["low", "medium", "high", "critical"] = Field(
        ..., description="Severity of impact if attack succeeds"
    )

    # Optional but recommended fields
    likelihood: Optional[Literal["low", "medium", "high", "critical"]] = Field(
        None, description="Probability of attack occurring"
    )

    description: Optional[str] = Field(
        None, description="Detailed description of the attack technique"
    )

    prerequisites: Optional[List[str]] = Field(
        None, description="List of conditions required before attack can be executed"
    )

    techniques: Optional[List[str]] = Field(
        None, description="List of specific techniques and methods used in the attack"
    )

    skillLevel: Optional[Literal["novice", "intermediate", "expert"]] = Field(
        None, description="Skill level required to execute the attack"
    )


class AttackTreeNode(BaseModel):
    """
    Represents a node in the attack tree.

    Node Types:
    - 'root': The main attack goal (red circle in UI)
    - 'and-gate': Logic gate requiring ALL child conditions (blue)
    - 'or-gate': Logic gate requiring ANY child condition (pink)
    - 'leaf-attack': Concrete attack technique (white card with details)
    """

    id: str = Field(
        ..., description="Unique identifier for the node (e.g., '1', '2', '3')"
    )

    type: Literal["root", "and-gate", "or-gate", "leaf-attack"] = Field(
        ...,
        description="Type of node determining its visual representation and behavior",
    )

    data: RootNodeData | GateNodeData | LeafAttackNodeData = Field(
        ..., description="Node-specific data based on type"
    )


class EdgeStyle(BaseModel):
    """Visual styling for edges."""

    stroke: str = Field("#555", description="Edge color (hex code)")
    strokeWidth: int = Field(2, description="Edge line width in pixels")
    strokeDasharray: str = Field("5, 5", description="Dash pattern for edge line")


class EdgeMarkerEnd(BaseModel):
    """Arrow marker at the end of edges."""

    type: Literal["arrowclosed"] = Field("arrowclosed", description="Arrow type")
    width: int = Field(25, description="Arrow width in pixels")
    height: int = Field(25, description="Arrow height in pixels")
    color: str = Field("#555", description="Arrow color (hex code)")


class AttackTreeEdge(BaseModel):
    """
    Represents a directed edge connecting nodes in the attack tree.

    Edges flow from parent nodes to child nodes, showing the attack path.
    Color coding:
    - Blue (#7eb3d5): Edges from AND gates
    - Pink (#c97a9e): Edges from OR gates
    - Gray (#555): Edges from root node
    """

    id: str = Field(..., description="Unique identifier for the edge (e.g., 'e1-2')")
    source: str = Field(..., description="ID of the source node")
    target: str = Field(..., description="ID of the target node")
    type: Literal["smoothstep"] = Field("smoothstep", description="Edge path type")
    style: EdgeStyle = Field(default_factory=EdgeStyle, description="Visual styling")
    markerEnd: EdgeMarkerEnd = Field(
        default_factory=EdgeMarkerEnd, description="Arrow marker"
    )
    animated: bool = Field(True, description="Whether edge should be animated")


class AttackTree(BaseModel):
    """
    Complete attack tree structure.

    An attack tree represents the hierarchical breakdown of an attack goal
    into sub-goals and concrete attack techniques, connected by logic gates.

    Structure Rules:
    1. Must have exactly ONE root node (type='root')
    2. Root node should be the first node in the nodes array
    3. Each node must have a unique ID
    4. Edges connect parent nodes to child nodes
    5. AND gates require ALL children to succeed
    6. OR gates require ANY child to succeed
    7. Leaf attacks are terminal nodes (no children)

    Example Structure:
        Root Goal
        ├─ AND Gate (both required)
        │  ├─ OR Gate (any one)
        │  │  ├─ Leaf Attack 1
        │  │  └─ Leaf Attack 2
        │  └─ Leaf Attack 3
        └─ Leaf Attack 4
    """

    nodes: List[AttackTreeNode] = Field(
        ..., min_length=1, description="List of all nodes in the attack tree"
    )

    edges: List[AttackTreeEdge] = Field(
        ..., description="List of all edges connecting nodes"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "nodes": [
                    {
                        "id": "1",
                        "type": "root",
                        "data": {"label": "Exfiltrate Sensitive Data"},
                    },
                    {
                        "id": "2",
                        "type": "and-gate",
                        "data": {
                            "label": "Gain Access and Extract Data",
                            "gateType": "AND",
                        },
                    },
                    {
                        "id": "3",
                        "type": "or-gate",
                        "data": {"label": "Compromise Credentials", "gateType": "OR"},
                    },
                    {
                        "id": "4",
                        "type": "leaf-attack",
                        "data": {
                            "label": "Phishing Attack",
                            "description": "Send targeted phishing emails to steal credentials",
                            "attackChainPhase": "Initial Access",
                            "impactSeverity": "high",
                            "likelihood": "high",
                            "skillLevel": "intermediate",
                            "prerequisites": [
                                "Identify target email addresses",
                                "Create convincing phishing content",
                            ],
                            "techniques": [
                                "Spear phishing with malicious links",
                                "Clone legitimate login pages",
                            ],
                        },
                    },
                ],
                "edges": [
                    {
                        "id": "e1-2",
                        "source": "1",
                        "target": "2",
                        "type": "smoothstep",
                        "style": {
                            "stroke": "#555",
                            "strokeWidth": 2,
                            "strokeDasharray": "5, 5",
                        },
                        "markerEnd": {
                            "type": "arrowclosed",
                            "width": 25,
                            "height": 25,
                            "color": "#555",
                        },
                        "animated": True,
                    },
                    {
                        "id": "e2-3",
                        "source": "2",
                        "target": "3",
                        "type": "smoothstep",
                        "style": {
                            "stroke": "#7eb3d5",
                            "strokeWidth": 2,
                            "strokeDasharray": "5, 5",
                        },
                        "markerEnd": {
                            "type": "arrowclosed",
                            "width": 25,
                            "height": 25,
                            "color": "#7eb3d5",
                        },
                        "animated": True,
                    },
                    {
                        "id": "e3-4",
                        "source": "3",
                        "target": "4",
                        "type": "smoothstep",
                        "style": {
                            "stroke": "#c97a9e",
                            "strokeWidth": 2,
                            "strokeDasharray": "5, 5",
                        },
                        "markerEnd": {
                            "type": "arrowclosed",
                            "width": 25,
                            "height": 25,
                            "color": "#c97a9e",
                        },
                        "animated": True,
                    },
                ],
            }
        }


# Helper functions for LLM tool integration


def create_edge(
    source_id: str, target_id: str, gate_type: Optional[str] = None
) -> AttackTreeEdge:
    """
    Helper function to create an edge with appropriate styling based on parent node type.

    Args:
        source_id: ID of the source node
        target_id: ID of the target node
        gate_type: Type of gate ('AND', 'OR', or None for root)

    Returns:
        AttackTreeEdge with appropriate color coding
    """
    # Determine edge color based on parent gate type
    if gate_type == "AND":
        color = "#7eb3d5"  # Blue for AND gates
    elif gate_type == "OR":
        color = "#c97a9e"  # Pink for OR gates
    else:
        color = "#555"  # Gray for root or unknown

    return AttackTreeEdge(
        id=f"e{source_id}-{target_id}",
        source=source_id,
        target=target_id,
        type="smoothstep",
        style=EdgeStyle(stroke=color, strokeWidth=2, strokeDasharray="5, 5"),
        markerEnd=EdgeMarkerEnd(type="arrowclosed", width=25, height=25, color=color),
        animated=True,
    )


def validate_attack_tree(tree: AttackTree) -> tuple[bool, Optional[str]]:
    """
    Validate that an attack tree follows structural rules.

    Args:
        tree: The attack tree to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Check for exactly one root node
    root_nodes = [n for n in tree.nodes if n.type == "root"]
    if len(root_nodes) == 0:
        return False, "Attack tree must have exactly one root node"
    if len(root_nodes) > 1:
        return False, "Attack tree must have exactly one root node, found multiple"

    # Check that root is first node
    if tree.nodes[0].type != "root":
        return False, "Root node must be the first node in the nodes array"

    # Check for unique node IDs
    node_ids = [n.id for n in tree.nodes]
    if len(node_ids) != len(set(node_ids)):
        return False, "All node IDs must be unique"

    # Check that all edges reference valid nodes
    for edge in tree.edges:
        if edge.source not in node_ids:
            return (
                False,
                f"Edge {edge.id} references non-existent source node {edge.source}",
            )
        if edge.target not in node_ids:
            return (
                False,
                f"Edge {edge.id} references non-existent target node {edge.target}",
            )

    return True, None


def validate_attack_tree_structure(
    attack_tree_dict: dict,
) -> tuple[bool, Optional[str]]:
    """
    Validate attack tree structure from dictionary format.

    This is a lightweight validation for dictionary-based attack trees
    (before or after Pydantic model conversion).

    Args:
        attack_tree_dict: Attack tree as dictionary with 'nodes' and 'edges'

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        # Validate top-level structure
        if not isinstance(attack_tree_dict, dict):
            return False, "Attack tree must be a dictionary"

        if "nodes" not in attack_tree_dict or "edges" not in attack_tree_dict:
            return False, "Attack tree must contain 'nodes' and 'edges' arrays"

        nodes = attack_tree_dict["nodes"]
        edges = attack_tree_dict["edges"]

        if not isinstance(nodes, list) or not isinstance(edges, list):
            return False, "Both 'nodes' and 'edges' must be arrays"

        if len(nodes) == 0:
            return False, "Attack tree must contain at least one node"

        # Check for exactly one root node
        root_nodes = [n for n in nodes if n.get("type") == "root"]
        if len(root_nodes) == 0:
            return False, "Attack tree must have exactly one root node"
        if len(root_nodes) > 1:
            return False, "Attack tree must have exactly one root node, found multiple"

        # Check that root is first node
        if nodes[0].get("type") != "root":
            return False, "Root node must be the first node in the nodes array"

        # Check for unique node IDs
        node_ids = {n.get("id") for n in nodes if "id" in n}
        if len(node_ids) != len(nodes):
            return False, "All node IDs must be unique and present"

        # Check that all edges reference valid nodes
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")

            if source not in node_ids:
                return False, f"Edge references non-existent source node '{source}'"
            if target not in node_ids:
                return False, f"Edge references non-existent target node '{target}'"

        return True, None

    except Exception as e:
        return False, f"Validation error: {str(e)}"


# ============================================================================
# PART 3: Converter from Logical to React Flow Format
# ============================================================================


class AttackTreeConverter:
    """Converts logical attack tree structure to React Flow format."""

    def __init__(self):
        self.node_counter = 0
        self.nodes = []
        self.edges = []

    def _next_id(self) -> str:
        """Generate next node ID."""
        self.node_counter += 1
        return str(self.node_counter)

    def _snake_to_camel(self, snake_str: str) -> str:
        """Convert snake_case to camelCase."""
        components = snake_str.split("_")
        return components[0] + "".join(x.title() for x in components[1:])

    def convert(self, logical_tree: AttackTreeLogical) -> dict:
        """
        Convert logical attack tree to React Flow format.

        Args:
            logical_tree: The logical tree structure from LLM

        Returns:
            Dictionary with 'nodes' and 'edges' arrays for React Flow

        Raises:
            ValueError: If the logical tree structure is invalid
        """
        self.node_counter = 0
        self.nodes = []
        self.edges = []

        # Validate logical tree has required fields
        if not logical_tree.goal:
            raise ValueError("Attack tree must have a goal")

        if not logical_tree.children or len(logical_tree.children) == 0:
            raise ValueError("Attack tree must have at least one child node")

        # Create root node without position
        root_id = self._next_id()
        self.nodes.append(
            {"id": root_id, "type": "root", "data": {"label": logical_tree.goal}}
        )

        # Process children without positioning
        for child in logical_tree.children:
            child_id = self._process_node(child, None, 0)
            self._create_edge(root_id, child_id, None)

        result = {"nodes": self.nodes, "edges": self.edges}

        # Validate the result before returning
        is_valid, error_msg = validate_attack_tree_structure(result)
        if not is_valid:
            raise ValueError(f"Generated attack tree failed validation: {error_msg}")

        return result

    def _process_node(
        self,
        node: Union[LogicGate, AttackTechnique],
        parent_gate_type: Optional[str],
        depth: int,
    ) -> str:
        """
        Process a node and its children recursively.

        Args:
            node: The node to process
            parent_gate_type: Type of parent gate for edge coloring
            depth: Current depth in tree (for tracking)

        Returns:
            ID of the created node
        """
        node_id = self._next_id()

        if isinstance(node, LogicGate):
            # Create gate node without position
            self.nodes.append(
                {
                    "id": node_id,
                    "type": f"{node.gate_type.lower()}-gate",
                    "data": {"label": node.description, "gateType": node.gate_type},
                }
            )

            # Process children without positioning
            for child in node.children:
                child_id = self._process_node(child, node.gate_type, depth + 1)
                self._create_edge(node_id, child_id, node.gate_type)

        else:  # AttackTechnique
            # Convert snake_case to camelCase for frontend
            data = {
                "label": node.name,
                "description": node.description,
                "attackChainPhase": node.attack_phase,
                "impactSeverity": node.impact_severity,
                "likelihood": node.likelihood,
                "skillLevel": node.skill_level,
                "prerequisites": node.prerequisites,
                "techniques": node.techniques,
            }

            self.nodes.append({"id": node_id, "type": "leaf-attack", "data": data})

        return node_id

    def _create_edge(self, source_id: str, target_id: str, gate_type: Optional[str]):
        """Create an edge with appropriate styling."""
        # Determine color based on parent gate type
        if gate_type == "AND":
            color = "#7eb3d5"  # Blue
        elif gate_type == "OR":
            color = "#c97a9e"  # Pink
        else:
            color = "#555"  # Gray (from root)

        self.edges.append(
            {
                "id": f"e{source_id}-{target_id}",
                "source": source_id,
                "target": target_id,
                "type": "smoothstep",
                "style": {"stroke": color, "strokeWidth": 2, "strokeDasharray": "5, 5"},
                "markerEnd": {
                    "type": "arrowclosed",
                    "width": 25,
                    "height": 25,
                    "color": color,
                },
                "animated": True,
            }
        )


# Example usage
if __name__ == "__main__":
    # Example: LLM generates this simple structure
    logical_tree = AttackTreeLogical(
        goal="Exfiltrate PII from All Cognito Users",
        children=[
            LogicGate(
                gate_type="AND",
                description="Gain Access and Extract Data",
                children=[
                    LogicGate(
                        gate_type="OR",
                        description="Compromise Credentials",
                        children=[
                            AttackTechnique(
                                name="Phishing Attack",
                                description="Send targeted phishing emails",
                                attack_phase="Initial Access",
                                impact_severity="high",
                                likelihood="high",
                                skill_level="intermediate",
                                prerequisites=[
                                    "Identify targets",
                                    "Create phishing content",
                                ],
                                techniques=["Spear phishing", "Clone login pages"],
                            )
                        ],
                    )
                ],
            )
        ],
    )

    # Convert to React Flow format
    react_flow_data = logical_tree.to_react_flow()
    print(react_flow_data)
