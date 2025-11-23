import { useState, useCallback, useRef } from "react";
import { updateAttackTree } from "../../../services/ThreatDesigner/attackTreeService";

/**
 * Custom hook for managing attack tree save operations
 *
 * Handles validation, data cleaning, node type transformation, and save state management.
 * Provides visual feedback for save success and errors.
 *
 * @param {Object} params - Hook parameters
 * @param {string|null} params.attackTreeId - Current attack tree ID
 * @param {Array} params.nodes - Current nodes array
 * @param {Array} params.edges - Current edges array
 * @param {Function} params.setHasUnsavedChanges - Callback to update unsaved changes flag
 *
 * @returns {Object} Save state and operations
 * @returns {boolean} returns.isSaving - Save operation in progress
 * @returns {string|null} returns.saveError - Save error message
 * @returns {boolean} returns.saveSuccess - Save success flag
 * @returns {Function} returns.setSaveError - Set save error message
 * @returns {Function} returns.setSaveSuccess - Set save success flag
 * @returns {Function} returns.handleSave - Execute save operation
 */
export const useAttackTreeSave = ({ attackTreeId, nodes, edges, setHasUnsavedChanges }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const successTimeoutRef = useRef(null); // Track success message timeout
  const isSavingRef = useRef(false); // Track if save is in progress to prevent duplicate calls

  /**
   * Validate attack tree before saving
   * Validate structure before sending to backend
   */
  const validateAttackTree = useCallback((nodes, edges) => {
    const errors = [];

    // Basic validation only - let backend handle business logic validation
    // Check that at least one node exists
    if (!nodes || nodes.length === 0) {
      errors.push("Attack tree must contain at least one node");
      return { isValid: false, errors };
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, []);

  /**
   * Clean node data for saving - remove React Flow internal properties
   */
  const cleanNodeForSave = useCallback((node) => {
    // Remove React Flow internal properties and position data
    // Backend only stores tree structure, not layout positions
    const {
      measured,
      selected,
      dragging,
      position,
      width,
      height,
      positionAbsolute,
      ...cleanNode
    } = node;

    // Transform node type back to backend format
    // Frontend uses "root-goal" but backend expects "root"
    if (cleanNode.type === "root-goal") {
      cleanNode.type = "root";
    }

    // Remove position-related and React Flow internal fields from node data if they exist
    // These are React Flow layout properties that shouldn't be persisted
    if (cleanNode.data) {
      const {
        position: dataPosition,
        width: dataWidth,
        height: dataHeight,
        measured: dataMeasured,
        positionAbsolute: dataPositionAbsolute,
        isFocused,
        isReadOnly,
        edges: dataEdges,
        onEdgeDelete,
        ...cleanData
      } = cleanNode.data;
      cleanNode.data = cleanData;
    }

    return cleanNode;
  }, []);

  /**
   * Clean edge data for saving - remove React Flow internal properties
   */
  const cleanEdgeForSave = useCallback((edge) => {
    // Remove React Flow internal properties
    const { selected, ...cleanEdge } = edge;
    return cleanEdge;
  }, []);

  /**
   * Handle save operation
   * Save to backend and handle success/failure with visual feedback
   */
  const handleSave = useCallback(async () => {
    if (!attackTreeId) return;

    // Prevent duplicate saves from React StrictMode
    if (isSavingRef.current) {
      console.log("Save already in progress, skipping duplicate call");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Validate before saving
      const validation = validateAttackTree(nodes, edges);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      // Clean nodes and edges for saving
      const cleanedNodes = nodes.map(cleanNodeForSave);
      const cleanedEdges = edges.map(cleanEdgeForSave);

      // Log what we're sending for debugging
      console.log("Saving attack tree with cleaned data:", {
        nodeCount: cleanedNodes.length,
        edgeCount: cleanedEdges.length,
        sampleNode: cleanedNodes[0],
      });

      // Call API to save attack tree
      await updateAttackTree(attackTreeId, {
        attack_tree: {
          nodes: cleanedNodes,
          edges: cleanedEdges,
        },
      });

      // Clear unsaved changes flag on success
      setHasUnsavedChanges(false);

      // Show success notification
      setSaveSuccess(true);

      // Clear any existing timeout to prevent multiple notifications
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }

      // Auto-hide success message after 3 seconds
      successTimeoutRef.current = setTimeout(() => {
        setSaveSuccess(false);
        successTimeoutRef.current = null;
      }, 3000);

      console.log("Attack tree saved successfully");
    } catch (err) {
      // Handle save failure
      console.error("Error saving attack tree:", err);
      const errorMessage = err.message || "Failed to save attack tree. Please try again.";
      setSaveError(errorMessage);

      // Keep unsaved changes flag set
      // hasUnsavedChanges remains true
    } finally {
      setIsSaving(false);
      isSavingRef.current = false; // Reset the ref to allow future saves
    }
  }, [
    attackTreeId,
    nodes,
    edges,
    validateAttackTree,
    cleanNodeForSave,
    cleanEdgeForSave,
    setHasUnsavedChanges,
  ]);

  return {
    isSaving,
    saveError,
    saveSuccess,
    setSaveError,
    setSaveSuccess,
    handleSave,
  };
};
