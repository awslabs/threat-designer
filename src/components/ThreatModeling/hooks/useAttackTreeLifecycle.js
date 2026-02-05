import { useState, useCallback, useEffect, useRef } from "react";
import {
  generateAttackTree,
  generateAttackTreeId,
  pollAttackTreeStatus,
  deleteAttackTree,
} from "../../../services/ThreatDesigner/attackTreeService";
import {
  cacheAttackTreeId,
  removeCachedAttackTreeId,
  handleAttackTreeNotFound,
} from "../../../services/ThreatDesigner/attackTreeCache";
import { getLayoutedElements } from "../AttackTree/layoutUtils";

// Configuration for timeout handling
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
 * Custom hook for managing attack tree lifecycle operations
 *
 * Handles attack tree generation, loading, polling, and deletion.
 * Manages state transitions between empty, creating, loaded, and error states.
 *
 * @param {Object} params - Hook parameters
 * @param {string} params.threatModelId - ID of the parent threat model
 * @param {string} params.threatName - Name of the threat
 * @param {string} params.threatDescription - Description of the threat
 * @param {Function} params.onTreeLoaded - Callback when tree is loaded with (nodes, edges)
 * @param {Function} params.onTreeDeleted - Callback when tree is deleted
 * @param {Function} params.onTreeCreated - Callback when tree is created
 *
 * @returns {Object} Lifecycle state and operations
 * @returns {string|null} returns.attackTreeId - Current attack tree ID
 * @returns {Object} returns.viewState - Current lifecycle state {status, error, showDeleteModal}
 * @returns {boolean} returns.isGenerating - Generation in progress
 * @returns {boolean} returns.isSubmitting - Button loading state
 * @returns {Function} returns.handleGenerate - Trigger new attack tree generation
 * @returns {Function} returns.handleDelete - Delete current attack tree
 * @returns {Function} returns.setShowDeleteModal - Toggle delete modal visibility
 * @returns {Function} returns.transitionToState - Manage state transitions
 * @returns {Function} returns.loadAttackTree - Load attack tree data
 */
export const useAttackTreeLifecycle = ({
  threatModelId,
  threatName,
  threatDescription,
  onTreeLoaded,
  onTreeDeleted,
  onTreeCreated,
}) => {
  const [attackTreeId, setAttackTreeId] = useState(null);

  // State management for attack tree lifecycle
  // Start with "creating" (loading) state - the useEffect will check status and transition
  const [viewState, setViewState] = useState({
    status: "creating", // 'empty' | 'creating' | 'loaded' | 'error'
    error: null,
    showDeleteModal: false,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // Track button loading state
  const abortControllerRef = useRef(null);

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

        // Transform node types from backend format to frontend format
        // Backend uses "root" but frontend expects "root-goal"
        const transformedNodes = (treeNodes || []).map((node) => ({
          ...node,
          type: node.type === "root" ? "root-goal" : node.type,
        }));

        // Apply Dagre layout (LR = left-to-right)
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          transformedNodes,
          treeEdges || [],
          "LR"
        );

        // Call the callback with loaded nodes and edges
        if (onTreeLoaded) {
          onTreeLoaded(layoutedNodes, layoutedEdges);
        }

        // Transition to loaded state
        transitionToState("loaded");
      } else {
        console.warn("loadAttackTree called with invalid data:", attackTreeData);
      }
    },
    [onTreeLoaded, transitionToState]
  );

  /**
   * Generate a new attack tree
   * Handle create button click, show loading state, transition to creating state
   */
  const handleGenerate = useCallback(async () => {
    try {
      // Cancel any existing polling
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this generation
      // eslint-disable-next-line no-undef
      abortControllerRef.current = new AbortController();

      // Clear any previous attack tree ID to ensure clean state
      setAttackTreeId(null);
      setIsGenerating(true);
      setIsSubmitting(true); // Show button loading state

      // Trigger generation - call attack tree creation API
      const result = await generateAttackTree(threatModelId, threatName, threatDescription);
      const newAttackTreeId = result.attack_tree_id;
      setAttackTreeId(newAttackTreeId);

      // Cache the attack tree ID for future lookups
      cacheAttackTreeId(threatModelId, threatName, newAttackTreeId);

      // Notify parent that tree generation has started
      // This adds the threat to local state immediately for filter purposes
      if (onTreeCreated) {
        onTreeCreated();
      }

      // Transition to creating state after submission
      transitionToState("creating");
      setIsSubmitting(false); // Clear button loading state after submission

      // Poll for completion with timeout handling
      const attackTreeData = await pollAttackTreeStatus(
        newAttackTreeId,
        null, // No status update callback needed
        POLLING_CONFIG.maxAttempts,
        POLLING_CONFIG.intervalMs,
        abortControllerRef.current.signal
      );

      // Transition to loaded state
      loadAttackTree(attackTreeData);
    } catch (err) {
      // Don't show error if it was just a cancellation
      if (err.message === "Polling cancelled") {
        setIsSubmitting(false);
        return;
      }

      // Handle 404 - attack tree not found, clean up cache
      if (err.message && err.message.includes("not found")) {
        handleAttackTreeNotFound(threatModelId, threatName);
      }

      // Handle API failures with specific error messages
      console.error("Error generating attack tree:", err);
      const errorMessage = err.message || "Failed to generate attack tree. Please try again.";

      // Transition to error state
      transitionToState("error", errorMessage);
      setIsSubmitting(false);
    } finally {
      setIsGenerating(false);
    }
  }, [threatModelId, threatName, threatDescription, loadAttackTree, transitionToState]);

  /**
   * Delete attack tree
   * Handle deletion with proper error handling
   */
  const handleDelete = useCallback(async () => {
    if (!attackTreeId) return;

    try {
      // Call delete API
      await deleteAttackTree(attackTreeId);

      // Remove from cache
      removeCachedAttackTreeId(threatModelId, threatName);

      // Clear all state
      setAttackTreeId(null);

      // Clear nodes and edges via callback
      if (onTreeDeleted) {
        onTreeDeleted();
      }

      // Close the delete modal first
      setShowDeleteModal(false);

      // Transition to empty state after successful deletion
      transitionToState("empty");
    } catch (err) {
      // Handle API failures with specific error messages
      console.error("Error deleting attack tree:", err);
      const errorMessage = err.message || "Failed to delete attack tree. Please try again.";

      // Close modal and show error
      setShowDeleteModal(false);

      // Transition to error state on deletion failure
      transitionToState("error", errorMessage);
    }
  }, [attackTreeId, threatModelId, threatName, transitionToState, setShowDeleteModal]);

  /**
   * Load existing attack tree when drawer opens
   * Simplified approach: compute ID, check status, transition based on result
   *
   * IMPORTANT: This effect should ONLY run when threatModelId or threatName change
   * It should NOT run on theme changes or other re-renders
   */
  useEffect(() => {
    let isMounted = true;
    // eslint-disable-next-line no-undef
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const checkAndLoadAttackTree = async () => {
      try {
        // Compute the attack tree ID from threat model ID and threat name
        const computedId = generateAttackTreeId(threatModelId, threatName);

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
          // Load attack tree data
          if (attackTreeData && attackTreeData.attack_tree) {
            const { nodes: treeNodes, edges: treeEdges } = attackTreeData.attack_tree;

            // Transform node types from backend format to frontend format
            // Backend uses "root" but frontend expects "root-goal"
            const transformedNodes = (treeNodes || []).map((node) => ({
              ...node,
              type: node.type === "root" ? "root-goal" : node.type,
            }));

            // Apply Dagre layout (LR = left-to-right)
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
              transformedNodes,
              treeEdges || [],
              "LR"
            );

            // Call the callback with loaded nodes and edges
            if (onTreeLoaded) {
              onTreeLoaded(layoutedNodes, layoutedEdges);
            }

            // Transition to loaded state
            setViewState((prevState) => ({
              ...prevState,
              status: "loaded",
              error: null,
            }));
          } else {
            // If attack tree data is invalid, show empty state
            setViewState((prevState) => ({
              ...prevState,
              status: "empty",
              error: null,
            }));
          }

          cacheAttackTreeId(threatModelId, threatName, computedId);
        }
      } catch (err) {
        if (err.message === "Polling cancelled" || err.name === "AbortError") {
          return;
        }

        // Attack tree doesn't exist - show empty state
        if (err.message === "ATTACK_TREE_NOT_FOUND" || err.message?.includes("not found")) {
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
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    attackTreeId,
    viewState,
    isGenerating,
    isSubmitting,
    handleGenerate,
    handleDelete,
    setShowDeleteModal,
    transitionToState,
    loadAttackTree,
  };
};
