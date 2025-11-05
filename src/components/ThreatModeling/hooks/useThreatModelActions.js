import { useCallback } from "react";
import {
  updateTm,
  deleteTm,
  stopTm,
  restoreTm,
  startThreatModeling,
} from "../../../services/ThreatDesigner/stats";

/**
 * Custom hook for managing threat model actions (save, delete, replay, stop, restore, etc.)
 *
 * @param {Object} config - Configuration object
 * @param {string} config.threatModelId - The threat model ID
 * @param {Object} config.response - Current threat model response data
 * @param {string} config.sessionId - Current session ID
 * @param {Object} config.lockManagerRef - Reference to the lock manager instance
 * @param {Function} config.navigate - React Router navigate function
 * @param {Function} config.showAlert - Function to show alerts
 * @param {Function} config.hideAlert - Function to hide alerts
 * @param {Function} config.setTrigger - Function to trigger polling refresh
 * @param {Function} config.clearSession - Function to clear Sentry session
 * @param {Object} config.lastKnownServerTimestamp - Ref to last known server timestamp
 * @param {Object} config.previousResponse - Ref to previous response for change detection
 * @param {Function} config.checkChanges - Function to check for changes
 * @param {Function} config.setProcessing - Function to set processing state
 * @param {Function} config.setResults - Function to set results state
 * @param {Function} config.setisVisible - Function to set Sentry visibility
 *
 * @returns {Object} Action handlers
 */
export const useThreatModelActions = ({
  threatModelId,
  response,
  sessionId,
  lockManagerRef,
  navigate,
  showAlert,
  hideAlert,
  setTrigger,
  clearSession,
  lastKnownServerTimestamp,
  previousResponse,
  checkChanges,
  setProcessing,
  setResults,
  setisVisible,
}) => {
  /**
   * Handle save operation with version conflict detection
   */
  const handleSave = useCallback(
    async (viaAlert = false) => {
      try {
        if (viaAlert) {
          showAlert("Info", true);
        }

        const results = await updateTm(
          response?.job_id,
          response?.item,
          lastKnownServerTimestamp.current
        );

        // Update the timestamp after successful save
        if (results.data && results.data.last_modified_at) {
          lastKnownServerTimestamp.current = results.data.last_modified_at;
        }

        previousResponse.current = JSON.parse(JSON.stringify(response));
        showAlert("Success");
        // Don't call checkChanges() here - it will be called by useEffect and might hide the success alert
        return { success: true, data: results };
      } catch (error) {
        // Check for 409 Conflict error (version conflict)
        if (error.response?.status === 409) {
          console.warn("Version conflict detected:", error.response.data);
          // Return conflict data to be handled by the component
          return {
            success: false,
            conflict: true,
            conflictData: error.response.data,
          };
        }
        // Check for 403 Forbidden error (unauthorized/no permission)
        else if (error.response?.status === 403) {
          console.error("Unauthorized save attempt:", error);
          showAlert("Unauthorized");
        } else {
          console.error("Error updating threat modeling:", error);
          showAlert("Error");
        }
        throw error;
      }
    },
    [response, lastKnownServerTimestamp, previousResponse, checkChanges, showAlert]
  );

  /**
   * Handle delete operation with lock release
   */
  const handleDelete = useCallback(async () => {
    try {
      // Release lock before deleting
      if (lockManagerRef.current) {
        await lockManagerRef.current.releaseLock().catch(console.error);
      }
      await deleteTm(response?.job_id);
      clearSession(response?.job_id);
      navigate("/");
    } catch (error) {
      console.error("Error deleting threat modeling:", error);
    }
  }, [lockManagerRef, response, clearSession, navigate]);

  /**
   * Handle replay operation with state reset
   */
  const handleReplay = useCallback(
    async (iteration, reasoning, instructions) => {
      try {
        setisVisible(false);
        setProcessing(true);
        setResults(false);

        await startThreatModeling(
          null, // key
          iteration, // iteration
          reasoning,
          null, // title
          null, // description
          null, // assumptions
          true, // replay
          threatModelId, // id
          instructions // instructions
        );

        setTrigger(Math.floor(Math.random() * 100) + 1);
      } catch (error) {
        console.error("Error starting threat modeling:", error);
      } finally {
        previousResponse.current = null;
      }
    },
    [setisVisible, setProcessing, setResults, threatModelId, setTrigger, previousResponse]
  );

  /**
   * Handle stop operation
   */
  const handleStop = useCallback(async () => {
    try {
      const stopResponse = await stopTm(threatModelId, sessionId);
      hideAlert();

      if (stopResponse.data.state === "Restored") {
        setTrigger(Math.floor(Math.random() * 100) + 1);
      } else if (stopResponse.data.state === "Deleted") {
        // Release lock before navigating
        if (lockManagerRef.current) {
          await lockManagerRef.current.releaseLock().catch(console.error);
        }
        clearSession(response?.job_id);
        navigate("/");
      }
    } catch (error) {
      console.error("Error stopping threat modeling:", error);
    }
  }, [
    threatModelId,
    sessionId,
    hideAlert,
    setTrigger,
    lockManagerRef,
    clearSession,
    response,
    navigate,
  ]);

  /**
   * Handle restore operation
   */
  const handleRestore = useCallback(async () => {
    try {
      await restoreTm(threatModelId);
      hideAlert();
    } catch (error) {
      console.error("Error restoring threat modeling:", error);
    } finally {
      setTrigger(Math.floor(Math.random() * 100) + 1);
    }
  }, [threatModelId, hideAlert, setTrigger]);

  /**
   * Handle reload server version operation
   */
  const handleReloadServerVersion = useCallback(() => {
    // Reload the page to get the server version
    window.location.reload();
  }, []);

  return {
    handleSave,
    handleDelete,
    handleReplay,
    handleStop,
    handleRestore,
    handleReloadServerVersion,
  };
};
