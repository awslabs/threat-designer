import { useState, useCallback, useEffect, useRef } from "react";
import { getFocusedSubgraph } from "../AttackTree/graphUtils";
import { getLayoutedElements } from "../AttackTree/layoutUtils";

/**
 * Custom hook for managing attack tree focus mode
 *
 * Focus mode allows users to click on gate nodes (AND/OR) to view only the subgraph
 * rooted at that node. This helps users focus on specific attack paths without
 * visual clutter from the rest of the tree.
 *
 * @param {Object} params - Hook parameters
 * @param {Array} params.allNodes - Complete array of all nodes in the tree
 * @param {Array} params.allEdges - Complete array of all edges in the tree
 * @param {Function} params.setNodes - React Flow setNodes function to update displayed nodes
 * @param {Function} params.setEdges - React Flow setEdges function to update displayed edges
 * @param {Object} params.reactFlowInstance - React Flow instance for fitView operations
 *
 * @returns {Object} Focus mode state and handlers
 * @returns {string|null} returns.focusedNodeId - Currently focused node ID (null if not in focus mode)
 * @returns {Function} returns.setFocusedNodeId - Function to manually set focused node
 * @returns {Function} returns.onNodeClick - Click handler for nodes (toggles focus on gate nodes)
 */
export const useAttackTreeFocus = ({
  allNodes,
  allEdges,
  setNodes,
  setEdges,
  reactFlowInstance,
}) => {
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const shouldFitViewRef = useRef(true); // Track if we should fitView on focus change
  const currentNodesRef = useRef([]); // Track current display nodes to preserve positions

  /**
   * Handle node click for focus mode
   * Only gate nodes (AND/OR) can be focused
   * Clicking a focused node again will exit focus mode
   */
  const onNodeClick = useCallback((_event, node) => {
    // Reset handle scales when clicking any node
    window.dispatchEvent(new Event("resetHandleScales"));

    // Only allow focusing on gate nodes (AND/OR), not leaf attacks or root
    if (node.type === "and-gate" || node.type === "or-gate") {
      setFocusedNodeId((prevId) => (prevId === node.id ? null : node.id));
    }
  }, []);

  /**
   * Apply focus mode when entering focus mode
   * Filters nodes/edges to show only focused subgraph and re-layouts them
   * Only triggers when focusedNodeId changes, not when nodes are added/edited
   */
  useEffect(() => {
    if (allNodes.length === 0) return;

    if (focusedNodeId) {
      // Filter to show only focused subgraph
      const { nodes: focusedNodes, edges: focusedEdges } = getFocusedSubgraph(
        focusedNodeId,
        allNodes,
        allEdges
      );

      // Re-layout the filtered subgraph for better visualization
      const { nodes: relayoutedNodes, edges: relayoutedEdges } = getLayoutedElements(
        focusedNodes,
        focusedEdges,
        "LR"
      );

      // Highlight the focused node
      const nodesWithHighlight = relayoutedNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isFocused: node.id === focusedNodeId,
        },
      }));

      // Set nodes and edges together
      setNodes(nodesWithHighlight);
      setEdges(relayoutedEdges);
    }
    // Note: Only depends on focusedNodeId, not allNodes
    // This means we only re-layout when entering focus mode, not when nodes change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedNodeId, setNodes, setEdges, reactFlowInstance]);

  /**
   * Handle exiting focus mode - re-layout the full tree
   */
  const previousFocusedNodeId = useRef(focusedNodeId);
  useEffect(() => {
    // Only re-layout when transitioning FROM focused TO not focused
    if (previousFocusedNodeId.current && !focusedNodeId && allNodes.length > 0) {
      // Re-layout the full tree when exiting focus mode
      const { nodes: relayoutedNodes, edges: relayoutedEdges } = getLayoutedElements(
        allNodes,
        allEdges,
        "LR"
      );

      const nodesWithoutHighlight = relayoutedNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isFocused: false,
        },
      }));

      // Update ref with new nodes
      currentNodesRef.current = nodesWithoutHighlight;

      // Set nodes and edges together
      setNodes(nodesWithoutHighlight);
      setEdges(relayoutedEdges);
    }

    // Update the previous focused node ID
    previousFocusedNodeId.current = focusedNodeId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedNodeId]);

  /**
   * Separate effect to handle fitView only when focusedNodeId changes
   * Uses a ref to control whether fitView should be triggered
   * This allows external code to disable fitView (e.g., during node deletion)
   *
   * Note: allNodes.length is intentionally NOT in the dependency array
   * We only want fitView when entering/exiting focus mode, not when nodes are added/deleted
   */
  useEffect(() => {
    // Only fitView when:
    // 1. shouldFitView flag is set
    // 2. We have nodes to display
    // 3. ReactFlow instance is available
    // 4. We're actually in a focus transition (focusedNodeId changed, not just node count)
    if (shouldFitViewRef.current && allNodes.length > 0 && reactFlowInstance) {
      // Reset handle scales before fitView
      window.dispatchEvent(new Event("resetHandleScales"));

      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
      }, 50);
    }

    // Reset the flag for next time
    shouldFitViewRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedNodeId, reactFlowInstance]);

  return {
    focusedNodeId,
    setFocusedNodeId,
    onNodeClick,
  };
};
