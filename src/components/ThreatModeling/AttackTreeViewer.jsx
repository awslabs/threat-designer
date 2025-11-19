import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button, Alert } from "@cloudscape-design/components";
import {
  generateAttackTree,
  generateAttackTreeId,
  pollAttackTreeStatus,
  deleteAttackTree,
} from "../../services/ThreatDesigner/attackTreeService";
import {
  cacheAttackTreeId,
  getCachedAttackTreeId,
  removeCachedAttackTreeId,
  handleAttackTreeNotFound,
} from "../../services/ThreatDesigner/attackTreeCache";
import { getLayoutedElements } from "./AttackTree/layoutUtils";
import { nodeTypes } from "./AttackTree/nodes";
import { getFocusedSubgraph } from "./AttackTree/graphUtils";
import NebulaLoader from "./NebulaLoader";
import DeleteConfirmationModal from "./AttackTree/DeleteConfirmationModal";
import { useTheme } from "../ThemeContext";

// Configuration for timeout handling (Requirement 1.3)
// 15 minutes total timeout for attack tree generation
const POLLING_CONFIG = {
  maxAttempts: 180, // 180 attempts
  intervalMs: 5000, // 5 seconds between attempts
  get timeoutMs() {
    return this.maxAttempts * this.intervalMs; // 15 minutes total (900 seconds)
  },
  get timeoutMinutes() {
    return Math.floor(this.timeoutMs / 60000);
  },
};

/**
 * Inner component that has access to React Flow instance
 */
const AttackTreeFlow = ({
  threatModelId,
  threatName,
  threatDescription,
  attackTreeId: initialAttackTreeId,
  isReadOnly = false,
}) => {
  const reactFlowInstance = useReactFlow();

  // Theme is used ONLY for Background component styling (Requirement 3.1, 3.2, 3.3)
  // Theme changes will cause a re-render but will NOT trigger any useEffect hooks
  // This ensures graph state (zoom, pan, focus) is preserved on theme changes
  const { isDark } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [attackTreeId, setAttackTreeId] = useState(null);

  // State management for attack tree lifecycle (Requirements 1.1, 1.3, 1.4, 3.1)
  // Start with "creating" (loading) state - the useEffect will check status and transition
  const [viewState, setViewState] = useState({
    status: "creating", // 'empty' | 'creating' | 'loaded' | 'error'
    error: null,
    showDeleteModal: false,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // Track button loading state (Requirement 1.2)
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [allNodes, setAllNodes] = useState([]);
  const [allEdges, setAllEdges] = useState([]);
  const abortControllerRef = useRef(null);

  // Add refs to track layout state
  const isLayoutInitialized = useRef(false);
  const layoutAttempts = useRef(0);
  const maxLayoutAttempts = 3;

  // Memoize node types to prevent re-renders
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  /**
   * State transition helper - ensures valid state transitions
   * Valid transitions: empty→creating, creating→loaded, creating→error,
   *                   loaded→empty, error→empty, error→creating
   */
  const transitionToState = useCallback((newStatus, errorMessage = null) => {
    setViewState((prevState) => {
      const validTransitions = {
        empty: ["creating"],
        creating: ["loaded", "error", "empty"], // Allow creating → empty for not_found case
        loaded: ["empty"],
        error: ["empty", "creating"],
      };

      // Check if transition is valid
      if (validTransitions[prevState.status]?.includes(newStatus)) {
        return {
          ...prevState,
          status: newStatus,
          error: errorMessage,
        };
      }

      // Log invalid transition attempt
      console.warn(`Invalid state transition: ${prevState.status} → ${newStatus}`);
      return prevState;
    });
  }, []);

  /**
   * Toggle delete modal visibility
   */
  const setShowDeleteModal = useCallback((show) => {
    setViewState((prevState) => ({
      ...prevState,
      showDeleteModal: show,
    }));
  }, []);

  /**
   * Load attack tree data into React Flow
   */
  const loadAttackTree = useCallback(
    (attackTreeData) => {
      if (attackTreeData && attackTreeData.attack_tree) {
        const { nodes: treeNodes, edges: treeEdges } = attackTreeData.attack_tree;

        // Apply Dagre layout (LR = left-to-right)
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          treeNodes || [],
          treeEdges || [],
          "LR"
        );

        // Store all nodes and edges for focus mode
        setAllNodes(layoutedNodes);
        setAllEdges(layoutedEdges);

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);

        // Transition to loaded state
        transitionToState("loaded");

        // Reset layout initialization flags
        isLayoutInitialized.current = false;
        layoutAttempts.current = 0;
      } else {
        console.warn("loadAttackTree called with invalid data:", attackTreeData);
      }
    },
    [setNodes, setEdges, transitionToState]
  );

  /**
   * Re-layout nodes after they have been measured by React Flow
   */
  useEffect(() => {
    if (nodes.length === 0) return;
    if (isLayoutInitialized.current) return;
    if (layoutAttempts.current >= maxLayoutAttempts) return;
    if (focusedNodeId) return; // Don't re-layout during focus mode

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

        // Fit view after layout
        setTimeout(() => {
          reactFlowInstance.fitView({
            padding: 0.2,
            duration: 300,
            minZoom: 0.5,
            maxZoom: 1.5,
          });
          isLayoutInitialized.current = true;
        }, 100);
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [nodes, edges, setNodes, setEdges, reactFlowInstance, focusedNodeId]);

  /**
   * Generate a new attack tree
   * Requirements 1.2, 1.3: Handle create button click, show loading state, transition to creating state
   */
  const handleGenerate = useCallback(async () => {
    try {
      // Cancel any existing polling (Requirement 1.3)
      if (abortControllerRef.current) {
        console.log("Aborting previous polling operation");
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this generation
      abortControllerRef.current = new AbortController();

      // Clear any previous attack tree ID to ensure clean state
      setAttackTreeId(null);
      setIsGenerating(true);
      setIsSubmitting(true); // Show button loading state (Requirement 1.2)

      setNodes([]);
      setEdges([]);
      setAllNodes([]);
      setAllEdges([]);
      isLayoutInitialized.current = false;
      layoutAttempts.current = 0;

      // Trigger generation - call attack tree creation API (Requirement 1.2)
      const result = await generateAttackTree(threatModelId, threatName, threatDescription);
      const newAttackTreeId = result.attack_tree_id;
      setAttackTreeId(newAttackTreeId);

      // Cache the attack tree ID for future lookups
      cacheAttackTreeId(threatModelId, threatName, newAttackTreeId);

      // Transition to creating state after submission (Requirement 1.3)
      transitionToState("creating");
      setIsSubmitting(false); // Clear button loading state after submission

      // Poll for completion with timeout handling (Requirements 1.3, 1.4, 3.1)
      const attackTreeData = await pollAttackTreeStatus(
        newAttackTreeId,
        null, // No status update callback needed
        POLLING_CONFIG.maxAttempts,
        POLLING_CONFIG.intervalMs,
        abortControllerRef.current.signal
      );

      // Transition to loaded state (Requirement 1.4)
      loadAttackTree(attackTreeData);
    } catch (err) {
      // Don't show error if it was just a cancellation
      if (err.message === "Polling cancelled") {
        console.log("Polling was cancelled, ignoring error");
        setIsSubmitting(false);
        return;
      }

      // Handle 404 - attack tree not found, clean up cache
      if (err.message && err.message.includes("not found")) {
        console.log("Attack tree not found (404), removing from cache");
        handleAttackTreeNotFound(threatModelId, threatName);
      }

      // Handle API failures with specific error messages (Requirement 3.1)
      console.error("Error generating attack tree:", err);
      const errorMessage = err.message || "Failed to generate attack tree. Please try again.";

      // Transition to error state (Requirement 3.1)
      transitionToState("error", errorMessage);
      setIsSubmitting(false);
    } finally {
      setIsGenerating(false);
    }
  }, [
    threatModelId,
    threatName,
    threatDescription,
    loadAttackTree,
    setNodes,
    setEdges,
    transitionToState,
  ]);

  /**
   * Load existing attack tree when drawer opens
   * Simplified approach: compute ID, check status, transition based on result
   *
   * IMPORTANT: This effect should ONLY run when threatModelId or threatName change
   * It should NOT run on theme changes or other re-renders (Requirements 3.1, 3.2, 3.3)
   */
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const checkAndLoadAttackTree = async () => {
      try {
        // Compute the attack tree ID from threat model ID and threat name
        const computedId = generateAttackTreeId(threatModelId, threatName);
        console.log("Computed attack tree ID:", computedId);

        if (isMounted) {
          setAttackTreeId(computedId);
        }

        // Check status and load if it exists
        const attackTreeData = await pollAttackTreeStatus(
          computedId,
          null,
          POLLING_CONFIG.maxAttempts,
          POLLING_CONFIG.intervalMs,
          controller.signal
        );

        if (isMounted) {
          // Load attack tree data directly without using loadAttackTree callback
          // This prevents the effect from depending on loadAttackTree
          if (attackTreeData && attackTreeData.attack_tree) {
            const { nodes: treeNodes, edges: treeEdges } = attackTreeData.attack_tree;

            // Apply Dagre layout (LR = left-to-right)
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
              treeNodes || [],
              treeEdges || [],
              "LR"
            );

            // Store all nodes and edges for focus mode
            setAllNodes(layoutedNodes);
            setAllEdges(layoutedEdges);

            setNodes(layoutedNodes);
            setEdges(layoutedEdges);

            // Transition to loaded state
            setViewState((prevState) => ({
              ...prevState,
              status: "loaded",
              error: null,
            }));

            // Reset layout initialization flags
            isLayoutInitialized.current = false;
            layoutAttempts.current = 0;
          }

          cacheAttackTreeId(threatModelId, threatName, computedId);
        }
      } catch (err) {
        if (err.message === "Polling cancelled") {
          console.log("Polling was cancelled");
          return;
        }

        // Attack tree doesn't exist - show empty state
        if (err.message === "ATTACK_TREE_NOT_FOUND" || err.message?.includes("not found")) {
          console.log("Attack tree not found - showing create button");
          if (isMounted) {
            setAttackTreeId(null);
            setViewState((prevState) => ({
              ...prevState,
              status: "empty",
              error: null,
            }));
          }
          return;
        }

        // Other errors
        console.error("Error loading attack tree:", err);
        if (isMounted) {
          setViewState((prevState) => ({
            ...prevState,
            status: "error",
            error: err.message || "Failed to load attack tree",
          }));
        }
      }
    };

    checkAndLoadAttackTree();

    return () => {
      isMounted = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threatModelId, threatName]);

  /**
   * Cleanup effect: Cancel any ongoing polling when component unmounts (drawer closes)
   * This ensures polling only happens when the drawer is open
   */
  useEffect(() => {
    return () => {
      // Cancel any ongoing polling operations when drawer closes
      if (abortControllerRef.current) {
        console.log("Component unmounting - cancelling any ongoing polling");
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Handle node click for focus mode
   */
  const onNodeClick = useCallback((_event, node) => {
    // Only allow focusing on gate nodes (AND/OR), not leaf attacks or root
    if (node.type === "and-gate" || node.type === "or-gate") {
      setFocusedNodeId((prevId) => (prevId === node.id ? null : node.id));
    }
  }, []);

  /**
   * Apply focus mode when focused node changes
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

      setNodes(nodesWithHighlight);
      setEdges(relayoutedEdges);

      // Fit view after a short delay to ensure nodes are rendered
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
      }, 50);
    } else {
      // Show all nodes
      const nodesWithoutHighlight = allNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isFocused: false,
        },
      }));
      setNodes(nodesWithoutHighlight);
      setEdges(allEdges);

      // Fit view after a short delay to ensure nodes are rendered
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
      }, 50);
    }
  }, [focusedNodeId, allNodes, allEdges, setNodes, setEdges, reactFlowInstance]);

  /**
   * Delete attack tree
   * Requirements 2.2, 3.1: Handle deletion with proper error handling
   */
  const handleDelete = useCallback(async () => {
    if (!attackTreeId) return;

    try {
      // Call delete API (Requirement 2.2)
      await deleteAttackTree(attackTreeId);

      // Remove from cache
      removeCachedAttackTreeId(threatModelId, threatName);

      // Clear all state
      setAttackTreeId(null);
      setNodes([]);
      setEdges([]);
      setAllNodes([]);
      setAllEdges([]);
      isLayoutInitialized.current = false;
      layoutAttempts.current = 0;

      // Close the delete modal first
      setShowDeleteModal(false);

      // Transition to empty state after successful deletion (Requirement 2.2)
      transitionToState("empty");
    } catch (err) {
      // Handle API failures with specific error messages (Requirement 3.1)
      console.error("Error deleting attack tree:", err);
      const errorMessage = err.message || "Failed to delete attack tree. Please try again.";

      // Close modal and show error
      setShowDeleteModal(false);

      // Transition to error state on deletion failure
      transitionToState("error", errorMessage);
    }
  }, [
    attackTreeId,
    threatModelId,
    threatName,
    setNodes,
    setEdges,
    transitionToState,
    setShowDeleteModal,
  ]);

  // Render React Flow with appropriate overlay based on state
  return (
    <div style={{ width: "100%", height: "calc(100vh - 150px)", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={memoizedNodeTypes}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 1.5 }}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: false,
          markerEnd: undefined,
          style: {
            stroke: "#b1b1b7",
            strokeWidth: 2,
            strokeDasharray: "5, 5",
          },
        }}
        minZoom={0.5}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        elevateNodesOnSelect={false}
        selectNodesOnDrag={false}
      >
        <Background color={isDark ? "#555" : "#aaa"} gap={32} size={3} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Empty State Overlay - Requirement 1.1 */}
      {viewState.status === "empty" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "16px",
            pointerEvents: "none",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>
            <Button
              onClick={handleGenerate}
              variant="primary"
              iconName="add-plus"
              loading={isSubmitting}
              disabled={isReadOnly}
            >
              Create Attack Tree
            </Button>
          </div>
        </div>
      )}

      {/* Creating State Overlay - Requirement 1.3 */}
      {viewState.status === "creating" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <NebulaLoader />
        </div>
      )}

      {/* Error State Overlay - Requirement 3.1 */}
      {viewState.status === "error" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "20px",
            pointerEvents: "none",
          }}
        >
          <div style={{ maxWidth: "600px", pointerEvents: "auto" }}>
            <Alert
              type="error"
              header="Attack Tree Generation Failed"
              action={
                !isReadOnly && (
                  <Button onClick={handleGenerate} loading={isGenerating}>
                    Retry
                  </Button>
                )
              }
            >
              {viewState.error ||
                "An error occurred while generating the attack tree. Please try again."}
            </Alert>
          </div>
        </div>
      )}

      {/* Loaded State - Delete Button Overlay - Requirements 1.4, 1.5 */}
      {/* Only show delete button for editors and owners */}
      {viewState.status === "loaded" && !isReadOnly && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            zIndex: 10,
            pointerEvents: "auto",
          }}
        >
          <Button onClick={() => setShowDeleteModal(true)} variant="normal" iconName="remove">
            Delete Attack Tree
          </Button>
        </div>
      )}

      {/* Delete Confirmation Modal - Requirements 2.1, 2.2, 2.3 */}
      <DeleteConfirmationModal
        visible={viewState.showDeleteModal}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
        threatName={threatName}
      />
    </div>
  );
};

AttackTreeFlow.propTypes = {
  threatModelId: PropTypes.string.isRequired,
  threatName: PropTypes.string.isRequired,
  threatDescription: PropTypes.string.isRequired,
  attackTreeId: PropTypes.string,
  onClose: PropTypes.func,
  isReadOnly: PropTypes.bool,
};

/**
 * AttackTreeViewer component
 *
 * Displays and manages attack tree visualization for a specific threat.
 * Handles generation, polling, and display of attack trees using React Flow.
 */
const AttackTreeViewer = (props) => {
  return (
    <ReactFlowProvider>
      <AttackTreeFlow {...props} />
    </ReactFlowProvider>
  );
};

AttackTreeViewer.propTypes = {
  threatModelId: PropTypes.string.isRequired,
  threatName: PropTypes.string.isRequired,
  threatDescription: PropTypes.string.isRequired,
  attackTreeId: PropTypes.string,
  onClose: PropTypes.func,
  isReadOnly: PropTypes.bool,
};

export default AttackTreeViewer;
