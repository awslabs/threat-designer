import { useState, useRef, useEffect } from "react";
import LockManager from "../../../services/ThreatDesigner/lockManager";

/**
 * Custom hook for managing edit locks on threat models.
 * Handles lock acquisition, maintenance via heartbeat, and release.
 *
 * @param {string} threatModelId - The ID of the threat model to lock
 * @param {boolean} isResultsLoaded - Whether the threat model results have been loaded (unused, kept for compatibility)
 * @param {Function} showAlert - Function to show alerts (for lock loss notifications)
 * @returns {Object} Lock state and manager reference
 * @returns {boolean} returns.isReadOnly - Whether the threat model is in read-only mode
 * @returns {Object|null} returns.lockStatus - Lock conflict information (lockedBy, since, message)
 * @returns {React.MutableRefObject} returns.lockManagerRef - Reference to the LockManager instance
 */
export const useThreatModelLock = (threatModelId, isResultsLoaded, showAlert) => {
  const lockManagerRef = useRef(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [lockStatus, setLockStatus] = useState(null);

  /**
   * LOCK ACQUISITION AND MANAGEMENT EFFECT
   *
   * This effect handles the complete lifecycle of edit lock management:
   * 1. Initialize LockManager when threat model ID is available
   * 2. Attempt to acquire the edit lock
   * 3. Start heartbeat to maintain the lock
   * 4. Handle lock loss scenarios (another user takes the lock)
   * 5. Clean up and release lock when component unmounts or threat model changes
   *
   * LOCK MANAGER LIFECYCLE:
   * - Created once per threat model as soon as ID is available
   * - Maintains a heartbeat to keep the lock alive
   * - Persists across all state changes (processing, results, replay, etc.)
   * - Automatically handles lock conflicts and loss scenarios
   * - Must be properly destroyed to stop heartbeat and release resources
   */
  useEffect(() => {
    // Don't initialize until we have a threat model ID
    if (!threatModelId) {
      return;
    }

    // OPTIMIZATION: Avoid recreating lock manager if we already have one for this threat model
    // This prevents unnecessary lock releases and re-acquisitions on re-renders
    if (lockManagerRef.current && lockManagerRef.current.threatModelId === threatModelId) {
      console.log(
        `[Lock] Skipping re-initialization for ${threatModelId}, lock manager already exists`
      );
      // Already have a lock manager for this threat model, no cleanup needed
      return; // Return undefined, not an empty function
    }

    console.log(`[Lock] Initializing lock manager for ${threatModelId}`);

    // CLEANUP: Release any existing lock before creating a new manager
    // This happens when switching between different threat models
    if (lockManagerRef.current) {
      console.log(
        `[Lock] Cleaning up previous lock manager for ${lockManagerRef.current.threatModelId}`
      );
      lockManagerRef.current.releaseLock().catch(console.error);
      lockManagerRef.current.destroy();
    }

    /**
     * LOCK LOSS CALLBACK
     * Called by LockManager when another user acquires the lock
     * This can happen if:
     * - Another user explicitly takes the lock
     * - Our heartbeat fails and the lock expires
     * - Network issues prevent heartbeat from reaching the server
     */
    const onLockLost = () => {
      setIsReadOnly(true);
      setLockStatus(null);
      if (showAlert) {
        showAlert("LockLost");
      }
    };

    /**
     * LOCK ACQUIRED CALLBACK
     * Called by LockManager when we successfully acquire the lock
     * This enables edit mode for the user
     */
    const onLockAcquired = () => {
      setIsReadOnly(false);
      setLockStatus(null); // Clear lock conflict notification
    };

    // Create new LockManager instance with callbacks
    // The LockManager will automatically start a heartbeat to maintain the lock
    lockManagerRef.current = new LockManager(threatModelId, onLockLost, onLockAcquired);

    /**
     * LOCK ACQUISITION LOGIC
     * Attempts to acquire the edit lock for this threat model
     *
     * Possible outcomes:
     * 1. Success: We get the lock and can edit
     * 2. Conflict: Another user has the lock, we enter read-only mode
     * 3. Error: Network or server error, default to read-only for safety
     */
    const acquireLock = async () => {
      try {
        const result = await lockManagerRef.current.acquireLock();

        if (result.success) {
          // SUCCESS: We acquired the lock - enable editing
          setIsReadOnly(false);
          setLockStatus(null);
        } else if (result.conflict) {
          // CONFLICT: Another user has the lock - show who and when
          setIsReadOnly(true);
          setLockStatus({
            lockedBy: result.lockedBy,
            since: result.since,
            message: result.message,
          });
        }
      } catch (error) {
        // ERROR: Failed to acquire lock - default to read-only for safety
        console.error("Failed to acquire lock:", error);
        setIsReadOnly(true);
      }
    };

    // Start the lock acquisition process
    acquireLock();

    /**
     * CLEANUP FUNCTION
     * Runs when:
     * - Component unmounts
     * - threatModelId changes (switching to a different threat model)
     *
     * IMPORTANT: We must release the lock and destroy the manager to:
     * - Stop the heartbeat interval
     * - Free up the lock for other users
     * - Prevent memory leaks
     *
     * NOTE: This cleanup does NOT run when other state changes (like isResultsLoaded)
     * because we only depend on threatModelId
     */
    return () => {
      console.log(`[Lock] Cleanup triggered for ${threatModelId}`);
      // Capture the current lock manager instance before cleanup
      // This is important because lockManagerRef.current might change during async cleanup
      const currentLockManager = lockManagerRef.current;

      // Only clean up if this is still the lock manager for the current threat model
      if (currentLockManager && currentLockManager.threatModelId === threatModelId) {
        console.log(`[Lock] Releasing lock and destroying manager for ${threatModelId}`);
        currentLockManager.releaseLock().catch(console.error);
        currentLockManager.destroy(); // Stops heartbeat and cleans up resources
        lockManagerRef.current = null;
      }
    };
  }, [threatModelId]); // ONLY depend on threatModelId - lock persists across all other state changes

  // Release lock on navigation away (beforeunload event)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (lockManagerRef.current) {
        // Use beacon mode for synchronous release during page unload
        // This won't actually send the request reliably, but clears local state
        // The lock will expire via TTL (15 minutes)
        lockManagerRef.current.releaseLock(true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return {
    isReadOnly,
    lockStatus,
    lockManagerRef,
  };
};
