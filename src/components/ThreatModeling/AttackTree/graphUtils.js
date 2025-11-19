/**
 * Graph utility functions for attack tree navigation and filtering
 */

/**
 * Find all ancestor nodes (upstream) from a given node
 * @param {string} nodeId - The starting node ID
 * @param {Array} edges - Array of all edges
 * @returns {Set} Set of ancestor node IDs
 */
export const findAncestors = (nodeId, edges) => {
  const ancestors = new Set();
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    // Find all edges that point TO the current node (parents)
    edges.forEach((edge) => {
      if (edge.target === currentId && !ancestors.has(edge.source)) {
        ancestors.add(edge.source);
        queue.push(edge.source);
      }
    });
  }

  return ancestors;
};

/**
 * Find all descendant nodes (downstream) from a given node
 * @param {string} nodeId - The starting node ID
 * @param {Array} edges - Array of all edges
 * @returns {Set} Set of descendant node IDs
 */
export const findDescendants = (nodeId, edges) => {
  const descendants = new Set();
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    // Find all edges that start FROM the current node (children)
    edges.forEach((edge) => {
      if (edge.source === currentId && !descendants.has(edge.target)) {
        descendants.add(edge.target);
        queue.push(edge.target);
      }
    });
  }

  return descendants;
};

/**
 * Filter nodes and edges to show only the focused node and its downstream paths
 * @param {string} focusedNodeId - The node to focus on
 * @param {Array} allNodes - Array of all nodes
 * @param {Array} allEdges - Array of all edges
 * @returns {Object} Filtered nodes and edges (focused node + descendants only)
 */
export const getFocusedSubgraph = (focusedNodeId, allNodes, allEdges) => {
  if (!focusedNodeId) {
    return { nodes: allNodes, edges: allEdges };
  }

  // Find only downstream nodes (descendants)
  const descendants = findDescendants(focusedNodeId, allEdges);

  // Create set of all visible node IDs (focused node + descendants only)
  const visibleNodeIds = new Set([focusedNodeId, ...descendants]);

  // Filter nodes
  const filteredNodes = allNodes.filter((node) => visibleNodeIds.has(node.id));

  // Filter edges - only keep edges where both source and target are visible
  const filteredEdges = allEdges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
  };
};
