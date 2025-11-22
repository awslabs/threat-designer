import { useRef, useEffect } from "react";
import { getLayoutedElements } from "../AttackTree/layoutUtils";

/**
 * Custom hook for managing attack tree layout initialization and fitView operations
 *
 * This hook handles:
 * - Automatic re-layout after nodes are measured by React Flow
 * - FitView on initial load
 * - FitView on focus changes
 * - Preventing fitView during manual node additions
 *
 * @param {Object} params - Hook parameters
 * @param {Array} params.nodes - Current display nodes
 * @param {Array} params.edges - Current display edges
 * @param {Function} params.setNodes - Function to update display nodes
 * @param {Function} params.setEdges - Function to update display edges
 * @param {Function} params.setAllNodes - Function to update all nodes (for focus mode)
 * @param {Function} params.setAllEdges - Function to update all edges (for focus mode)
 * @param {Object} params.reactFlowInstance - React Flow instance for fitView operations
 * @param {string|null} params.focusedNodeId - Currently focused node ID
 * @param {Object} params.viewState - Current view state (status, error)
 *
 * @returns {Object} Layout state and operations
 * @returns {React.MutableRefObject<boolean>} isLayoutInitialized - Whether initial layout is complete
 * @returns {React.MutableRefObject<boolean>} shouldFitViewOnLoad - Whether to fitView on initial load
 * @returns {React.MutableRefObject<boolean>} isManualNodeAddition - Whether a node is being added manually
 * @returns {Function} resetLayoutFlags - Reset all layout flags
 */
export const useAttackTreeLayout = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  setAllNodes,
  setAllEdges,
  reactFlowInstance,
  focusedNodeId,
  viewState,
}) => {
  // Track layout state
  const isLayoutInitialized = useRef(false);
  const layoutAttempts = useRef(0);
  const maxLayoutAttempts = 3;
  const shouldFitViewOnLoad = useRef(true);
  const isManualNodeAddition = useRef(false);

  /**
   * Reset all layout flags
   * Used when loading a new tree or after deletion
   */
  const resetLayoutFlags = () => {
    isLayoutInitialized.current = false;
    layoutAttempts.current = 0;
    shouldFitViewOnLoad.current = true;
    isManualNodeAddition.current = false;
  };

  /**
   * Re-layout nodes after they have been measured by React Flow
   * This effect runs after nodes are initially loaded and React Flow has measured their dimensions
   * It should ONLY run during initial tree load, not when nodes are added/deleted manually
   */
  useEffect(() => {
    // Skip if no nodes
    if (nodes.length === 0) return;

    // Skip if layout already initialized (prevents re-layout on node additions)
    if (isLayoutInitialized.current) return;

    // Skip if max attempts reached
    if (layoutAttempts.current >= maxLayoutAttempts) return;

    // Skip during focus mode
    if (focusedNodeId) return;

    // Skip during manual node addition/deletion
    if (isManualNodeAddition.current) return;

    // Skip if shouldFitViewOnLoad is false (indicates manual operation)
    if (!shouldFitViewOnLoad.current) return;

    // Check if all nodes have been measured
    const allNodesMeasured = nodes.every((node) => node.measured?.width && node.measured?.height);

    if (allNodesMeasured) {
      layoutAttempts.current += 1;

      const timer = setTimeout(() => {
        // Re-layout with measured dimensions
        const { nodes: relayoutedNodes, edges: relayoutedEdges } = getLayoutedElements(
          nodes,
          edges,
          "LR"
        );

        // Update both display and stored nodes
        setNodes(relayoutedNodes);
        setEdges(relayoutedEdges);
        setAllNodes(relayoutedNodes);
        setAllEdges(relayoutedEdges);

        // Mark layout as initialized first to prevent re-triggering
        isLayoutInitialized.current = true;

        // Fit view after layout (only during initial load)
        if (!isManualNodeAddition.current && shouldFitViewOnLoad.current) {
          setTimeout(() => {
            reactFlowInstance.fitView({
              padding: 0.2,
              duration: 1,
              minZoom: 0.5,
              maxZoom: 1.5,
            });
          }, 1);
        }
      }, 1);

      return () => clearTimeout(timer);
    }
  }, [
    nodes,
    edges,
    setNodes,
    setEdges,
    setAllNodes,
    setAllEdges,
    reactFlowInstance,
    focusedNodeId,
  ]);

  /**
   * Effect to handle fitView on initial load
   * Waits for ReactFlow instance to be ready and nodes to be loaded
   * Only triggers when viewState.status changes to 'loaded', not on node count changes
   */
  useEffect(() => {
    // Only fitView when:
    // 1. ReactFlow instance is available
    // 2. Nodes are loaded (not empty)
    // 3. View state is 'loaded' (attack tree fully loaded)
    // 4. Not in focus mode (focusedNodeId is null)
    // 5. shouldFitViewOnLoad flag is true (not after node deletion/addition)
    // 6. Not during manual node addition
    if (
      reactFlowInstance &&
      nodes.length > 0 &&
      viewState.status === "loaded" &&
      !focusedNodeId &&
      shouldFitViewOnLoad.current &&
      !isManualNodeAddition.current
    ) {
      // Use a longer timeout to ensure drawer animation is complete
      const timeoutId = setTimeout(() => {
        reactFlowInstance.fitView({
          padding: 0.2,
          duration: 1,
          minZoom: 0.5,
          maxZoom: 1.5,
        });
      }, 1);

      return () => clearTimeout(timeoutId);
    }
    // Note: nodes.length is intentionally NOT in the dependency array
    // We only want this to run when the tree is initially loaded (viewState.status changes)
    // not when nodes are added/deleted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactFlowInstance, viewState.status, focusedNodeId]);

  return {
    isLayoutInitialized,
    shouldFitViewOnLoad,
    isManualNodeAddition,
    resetLayoutFlags,
  };
};
