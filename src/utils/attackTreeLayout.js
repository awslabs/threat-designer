import dagre from "dagre";

/**
 * Get node dimensions based on type
 *
 * @param {string} nodeType - Type of node (root, and-gate, or-gate, leaf-attack, countermeasure)
 * @returns {Object} Width and height
 */
export const getNodeDimensions = (nodeType) => {
  switch (nodeType) {
    case "root":
      return { width: 300, height: 80 };
    case "and-gate":
    case "or-gate":
      return { width: 250, height: 80 };
    case "leaf-attack":
      return { width: 280, height: 120 };
    case "countermeasure":
      return { width: 260, height: 100 };
    default:
      return { width: 250, height: 100 };
  }
};

/**
 * Apply automatic hierarchical layout to attack tree nodes
 *
 * @param {Array} nodes - React Flow nodes (may or may not have positions)
 * @param {Array} edges - React Flow edges
 * @param {Object} options - Layout configuration
 * @returns {Array} Nodes with calculated positions
 */
export const applyAutoLayout = (nodes, edges, options = {}) => {
  const {
    direction = "LR", // Left to Right
    nodeWidth = 250, // Default node width
    nodeHeight = 100, // Default node height
    rankSep = 150, // Horizontal spacing between levels
    nodeSep = 100, // Vertical spacing between siblings
  } = options;

  try {
    // Check for empty data
    if (!nodes || nodes.length === 0) {
      console.warn("No nodes provided for layout");
      return [];
    }

    // Backward compatibility: Check if all nodes already have positions
    const hasPositions = nodes.every(
      (node) =>
        node.position && typeof node.position.x === "number" && typeof node.position.y === "number"
    );

    // If all nodes have positions, return as-is (backward compatibility)
    if (hasPositions) {
      return nodes;
    }

    // Create dagre graph
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
      rankdir: direction,
      ranksep: rankSep,
      nodesep: nodeSep,
    });

    // Add nodes to dagre with appropriate dimensions
    nodes.forEach((node) => {
      const dimensions = getNodeDimensions(node.type);
      dagreGraph.setNode(node.id, {
        width: dimensions.width,
        height: dimensions.height,
      });
    });

    // Add edges to dagre
    if (edges && edges.length > 0) {
      edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
      });
    }

    // Calculate layout
    dagre.layout(dagreGraph);

    // Apply calculated positions to nodes
    const nodesWithLayout = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      const dimensions = getNodeDimensions(node.type);

      return {
        ...node,
        position: {
          // Center the node at the calculated position
          x: nodeWithPosition.x - dimensions.width / 2,
          y: nodeWithPosition.y - dimensions.height / 2,
        },
      };
    });

    return nodesWithLayout;
  } catch (error) {
    console.error("Error calculating layout:", error);

    // Fallback: return nodes with default positions in a grid
    return nodes.map((node, index) => ({
      ...node,
      position: node.position || {
        x: 100 + (index % 3) * 300,
        y: 100 + Math.floor(index / 3) * 200,
      },
    }));
  }
};
