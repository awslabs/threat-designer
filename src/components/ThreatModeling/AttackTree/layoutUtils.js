import dagre from "dagre";

/**
 * Calculate node positions using Dagre layout algorithm
 * @param {Array} nodes - Array of React Flow nodes
 * @param {Array} edges - Array of React Flow edges
 * @param {string} direction - Layout direction: 'TB' (top-to-bottom) or 'LR' (left-to-right)
 * @returns {Object} Object containing layouted nodes and edges
 */
export const getLayoutedElements = (nodes, edges, direction = "LR") => {
  const dagreGraph = new dagre.graphlib.Graph();

  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 150,
    ranksep: 200,
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    // Use measured dimensions if available, otherwise fallback to estimates
    const width = node.measured?.width || node.width || getEstimatedWidth(node.type);
    const height = node.measured?.height || node.height || getEstimatedHeight(node.type);

    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  // Get all node positions from dagre
  const dagreNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      id: node.id,
      type: node.type,
      dagreX: nodeWithPosition.x,
      dagreY: nodeWithPosition.y,
      width: nodeWithPosition.width,
      height: nodeWithPosition.height,
    };
  });

  // Find the root node's dagre position
  const rootDagreNode = dagreNodes.find((n) => n.type === "root");

  // Calculate offset to center root at (0, 0)
  const offsetX = rootDagreNode ? -rootDagreNode.dagreX : 0;
  const offsetY = rootDagreNode ? -rootDagreNode.dagreY : 0;

  // Apply calculated positions to nodes with centering offset
  const layoutedNodes = nodes.map((node) => {
    const dagreNode = dagreNodes.find((n) => n.id === node.id);

    return {
      ...node,
      position: {
        // Center the node position and apply offset
        x: dagreNode.dagreX - dagreNode.width / 2 + offsetX,
        y: dagreNode.dagreY - dagreNode.height / 2 + offsetY,
      },
      // Store the dimensions for future layouts
      width: dagreNode.width,
      height: dagreNode.height,
    };
  });

  // Remove markerEnd from all edges to disable arrows
  const edgesWithoutMarkers = edges.map((edge) => ({
    ...edge,
    markerEnd: undefined,
    markerStart: undefined,
  }));

  return {
    nodes: layoutedNodes,
    edges: edgesWithoutMarkers,
  };
};

function getEstimatedWidth(type) {
  if (type === "root") return 180;
  return 220;
}

function getEstimatedHeight(type) {
  switch (type) {
    case "root":
      return 100;
    case "and-gate":
    case "or-gate":
      return 100;
    case "leaf-attack":
      return 120;
    default:
      return 80;
  }
}
