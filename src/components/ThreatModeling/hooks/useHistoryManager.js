import { useState, useCallback } from "react";

/**
 * Maximum number of changes to keep in history stack
 */
const MAX_HISTORY_SIZE = 50;

/**
 * Custom hook for managing undo/redo history for attack tree editor
 *
 * @returns {Object} History manager interface
 */
export const useHistoryManager = () => {
  // Undo stack stores changes that can be undone
  const [undoStack, setUndoStack] = useState([]);

  // Redo stack stores changes that can be redone
  const [redoStack, setRedoStack] = useState([]);

  // Track if there are unsaved changes
  const [hasChanges, setHasChanges] = useState(false);

  /**
   * Push a new change to the undo stack
   *
   * @param {Object} change - The change to record
   * @param {string} change.type - Type of change ('add-node', 'edit-node', 'delete-node', 'add-edge', 'delete-edge')
   * @param {number} change.timestamp - When the change occurred
   * @param {any} change.before - State before the change
   * @param {any} change.after - State after the change
   */
  const pushChange = useCallback((change) => {
    setUndoStack((prevStack) => {
      const newStack = [...prevStack, change];

      // Enforce maximum stack size
      if (newStack.length > MAX_HISTORY_SIZE) {
        return newStack.slice(newStack.length - MAX_HISTORY_SIZE);
      }

      return newStack;
    });

    // Clear redo stack when new change is made
    setRedoStack([]);

    // Mark as having changes
    setHasChanges(true);
  }, []);

  /**
   * Undo the most recent change
   *
   * @returns {Object|null} The change that was undone, or null if nothing to undo
   */
  const undo = useCallback(() => {
    if (undoStack.length === 0) {
      return null;
    }

    const change = undoStack[undoStack.length - 1];

    setUndoStack((prevStack) => prevStack.slice(0, -1));
    setRedoStack((prevStack) => [...prevStack, change]);

    return change;
  }, [undoStack]);

  /**
   * Redo the most recently undone change
   *
   * @returns {Object|null} The change that was redone, or null if nothing to redo
   */
  const redo = useCallback(() => {
    if (redoStack.length === 0) {
      return null;
    }

    const change = redoStack[redoStack.length - 1];

    setRedoStack((prevStack) => prevStack.slice(0, -1));
    setUndoStack((prevStack) => [...prevStack, change]);

    return change;
  }, [redoStack]);

  /**
   * Clear all history and reset hasChanges flag
   * Used after successful save operation
   */
  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    setHasChanges(false);
  }, []);

  /**
   * Check if undo is available
   */
  const canUndo = undoStack.length > 0;

  /**
   * Check if redo is available
   */
  const canRedo = redoStack.length > 0;

  return {
    pushChange,
    undo,
    redo,
    clear,
    canUndo,
    canRedo,
    hasChanges,
  };
};
