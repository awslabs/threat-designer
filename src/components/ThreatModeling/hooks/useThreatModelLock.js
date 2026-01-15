import { useState, useEffect, useRef, useMemo } from "react";
import lockService from "../../../services/ThreatDesigner/lockService";

/**
 * Custom hook for managing edit locks on threat models.
 * Uses a singleton LockService that lives outside React's lifecycle,
 * avoiding StrictMode double-render issues.
 *
 * @param {string} threatModelId - The ID of the threat model to lock
 * @param {Function} showAlert - Function to show alerts (for lock loss notifications)
 * @returns {Object} Lock state and manager reference
 */
export const useThreatModelLock = (threatModelId, showAlert) => {
  const [lockState, setLockState] = useState({
    isReadOnly: true,
    lockStatus: null,
    hasLock: false,
  });

  // Track previous state to detect lock loss
  const prevHasLockRef = useRef(false);
  // Store showAlert in ref to avoid dependency issues
  const showAlertRef = useRef(showAlert);
  showAlertRef.current = showAlert;

  useEffect(() => {
    if (!threatModelId) {
      return;
    }

    console.log(`[useThreatModelLock] Subscribing to lock for ${threatModelId}`);

    // Subscribe to lock state changes
    const unsubscribe = lockService.subscribe(threatModelId, (newState) => {
      console.log(`[useThreatModelLock] State update for ${threatModelId}:`, newState);

      // Detect lock loss (had lock before, don't have it now)
      if (prevHasLockRef.current && !newState.hasLock && newState.isReadOnly) {
        console.log(`[useThreatModelLock] Lock lost for ${threatModelId}`);
        if (showAlertRef.current) {
          showAlertRef.current("LockLost");
        }
      }

      prevHasLockRef.current = newState.hasLock;
      setLockState(newState);
    });

    // Cleanup: unsubscribe when component unmounts or threatModelId changes
    return () => {
      console.log(`[useThreatModelLock] Unsubscribing from lock for ${threatModelId}`);
      unsubscribe();
    };
  }, [threatModelId]); // Only depend on threatModelId

  // Create a stable ref object for backwards compatibility
  const lockManagerRef = useMemo(
    () => ({
      current: threatModelId ? lockService.getLockManagerRef(threatModelId) : null,
    }),
    [threatModelId]
  );

  return {
    isReadOnly: lockState.isReadOnly,
    lockStatus: lockState.lockStatus,
    lockManagerRef,
  };
};
