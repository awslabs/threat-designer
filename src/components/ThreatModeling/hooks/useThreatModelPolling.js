import { useState, useEffect, useRef } from "react";
import { getThreatModelingStatus } from "../../../services/ThreatDesigner/stats";

// Polling interval in milliseconds (5 seconds)
const POLLING_INTERVAL_MS = 5000;

/**
 * Custom hook for polling threat model status
 *
 * Polls the threat model status at 5-second intervals and handles status transitions.
 * Automatically pauses polling when the browser tab is in the background and resumes
 * when the user returns to the tab.
 * Supports manual refresh triggering and calls a callback when status changes.
 *
 * @param {string} threatModelId - The ID of the threat model to poll
 * @param {Function} onStatusChange - Callback function called when status changes to COMPLETE or FAILED
 *                                     Receives (status, statusData) as parameters
 * @returns {Object} Hook interface
 * @returns {string|null} returns.tmStatus - Current threat model status (START, PROCESSING, FINALIZE, COMPLETE, FAILED, null)
 * @returns {string|null} returns.tmDetail - Status detail message
 * @returns {string|null} returns.sessionId - Current session ID
 * @returns {number} returns.iteration - Current iteration number
 * @returns {boolean} returns.loading - Loading state flag
 * @returns {number|null} returns.trigger - Trigger value for manual refresh
 * @returns {Function} returns.setTrigger - Function to set trigger value and force a refresh
 *
 * @example
 * const { tmStatus, trigger, setTrigger } = useThreatModelPolling(
 *   threatModelId,
 *   (status, data) => {
 *     if (status === 'COMPLETE') {
 *       // Handle completion
 *     }
 *   }
 * );
 */
export const useThreatModelPolling = (threatModelId, onStatusChange) => {
  const [tmStatus, setTmStatus] = useState(null);
  const [tmDetail, setTmDetail] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [iteration, setIteration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(null);

  // Use ref to track if we've already processed a terminal state
  const hasProcessedTerminalState = useRef(false);
  // Ref to store interval ID for cleanup across visibility changes
  const intervalRef = useRef(null);
  // Ref to track if polling should be active (not in terminal state)
  const shouldPollRef = useRef(true);

  useEffect(() => {
    // Reset terminal state flag when threatModelId or trigger changes
    hasProcessedTerminalState.current = false;
    shouldPollRef.current = true;
  }, [threatModelId, trigger]);

  /**
   * POLLING EFFECT
   *
   * This effect implements a polling mechanism to check threat model processing status.
   * It runs continuously at 5-second intervals until a terminal state is reached.
   * Polling is paused when the browser tab is hidden and resumed when visible again.
   *
   * POLLING LIFECYCLE:
   * 1. Initial check immediately on mount
   * 2. Set up 5-second interval for continuous polling
   * 3. Pause polling when tab becomes hidden (visibilitychange event)
   * 4. Resume polling immediately when tab becomes visible again
   * 5. Stop polling when COMPLETE or FAILED state is reached
   * 6. Clean up interval on unmount or when dependencies change
   *
   * TRIGGER MECHANISM:
   * The 'trigger' dependency allows manual refresh by changing its value.
   * This is useful for forcing a re-check after actions like replay or restore.
   */
  useEffect(() => {
    let intervalId;

    /**
     * Check the current status of the threat model
     *
     * STATUS TRANSITION FLOW:
     * START → PROCESSING → FINALIZE → COMPLETE
     *                    ↓
     *                  FAILED
     *
     * - START: Initial state, threat model generation has begun
     * - PROCESSING: Agent is actively generating threats
     * - FINALIZE: Agent is finalizing the threat model
     * - COMPLETE: Generation finished successfully (terminal state)
     * - FAILED: Generation failed with an error (terminal state)
     */
    const checkStatus = async () => {
      if (!threatModelId) return;

      try {
        const statusResponse = await getThreatModelingStatus(threatModelId);
        const currentStatus = statusResponse.data.state;
        const retry = statusResponse.data.retry;
        const detail = statusResponse.data.detail;
        const sessionIdValue = statusResponse.data.session_id;

        // Update iteration, detail, and session ID on every poll
        setIteration(retry);
        setTmDetail(detail);
        setSessionId(sessionIdValue);

        /**
         * TERMINAL STATE: COMPLETE
         *
         * The threat model has been successfully generated.
         * Actions:
         * 1. Stop polling (no need to check anymore)
         * 2. Update status to COMPLETE
         * 3. Set loading to false
         * 4. Call onStatusChange callback to trigger data fetch
         *
         * The callback is only called once per terminal state to prevent
         * duplicate data fetches if the effect runs multiple times.
         */
        if (currentStatus === "COMPLETE") {
          shouldPollRef.current = false;
          clearInterval(intervalId);
          intervalRef.current = null;
          setTmStatus(currentStatus);
          setLoading(false);

          // Call the callback only once per terminal state
          if (!hasProcessedTerminalState.current && onStatusChange) {
            hasProcessedTerminalState.current = true;
            onStatusChange(currentStatus, {
              retry,
              detail,
              sessionId: sessionIdValue,
            });
          }
        } else if (currentStatus === "FAILED") {
          /**
           * TERMINAL STATE: FAILED
           *
           * The threat model generation failed with an error.
           * Actions:
           * 1. Stop polling
           * 2. Set status to null (triggers error UI)
           * 3. Set loading to false
           * 4. Call onStatusChange callback to handle error
           *
           * Note: Status is set to null instead of "FAILED" to trigger
           * the error alert display in the parent component.
           */
          shouldPollRef.current = false;
          clearInterval(intervalId);
          intervalRef.current = null;
          setTmStatus(null);
          setLoading(false);

          // Call the callback only once per terminal state
          if (!hasProcessedTerminalState.current && onStatusChange) {
            hasProcessedTerminalState.current = true;
            onStatusChange(currentStatus, {
              retry,
              detail,
              sessionId: sessionIdValue,
            });
          }
        } else if (currentStatus === "FINALIZE") {
          /**
           * INTERMEDIATE STATE: FINALIZE
           *
           * The agent is finalizing the threat model (last step before COMPLETE).
           * Actions:
           * 1. Continue polling (not terminal yet)
           * 2. Update status to FINALIZE
           * 3. Set loading to false (show processing UI, not loading spinner)
           */
          setTmStatus(currentStatus);
          setLoading(false);
        } else {
          /**
           * INTERMEDIATE STATES: START or PROCESSING
           *
           * The threat model is being generated.
           * Actions:
           * 1. Continue polling
           * 2. Update status
           * 3. Set loading to false (show processing UI)
           */
          setTmStatus(currentStatus);
          setLoading(false);
        }
      } catch (error) {
        // Network or server error during polling
        console.error("Error checking threat modeling status:", error);
        shouldPollRef.current = false;
        clearInterval(intervalId);
        intervalRef.current = null;
        setTmStatus(null);
        setLoading(false);
      }
    };

    /**
     * Start the polling interval
     * Only starts if polling should be active (not in terminal state)
     */
    const startPolling = () => {
      if (!threatModelId || !shouldPollRef.current) return;

      // Clear any existing interval first
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Perform immediate status check when starting/resuming
      checkStatus();

      // Set up polling interval (5000ms = 5 seconds)
      intervalId = setInterval(checkStatus, POLLING_INTERVAL_MS);
      intervalRef.current = intervalId;
    };

    /**
     * Stop the polling interval
     * Called when tab becomes hidden or component unmounts
     */
    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };

    /**
     * VISIBILITY CHANGE HANDLER
     *
     * Handles browser tab visibility changes to optimize resource usage.
     * - When tab is hidden: Stop polling to save resources
     * - When tab is visible: Resume polling immediately with a fresh status check
     *
     * This prevents unnecessary API calls when the user isn't viewing the page
     * while ensuring they get up-to-date information when they return.
     */
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is now hidden - stop polling
        stopPolling();
      } else {
        // Tab is now visible - resume polling if not in terminal state
        if (shouldPollRef.current && threatModelId) {
          startPolling();
        }
      }
    };

    if (threatModelId) {
      // Start polling initially
      startPolling();

      // Listen for visibility changes
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    /**
     * CLEANUP FUNCTION
     *
     * Clears the polling interval and removes event listeners when:
     * - Component unmounts
     * - threatModelId changes (switching threat models)
     * - trigger changes (manual refresh requested)
     *
     * This prevents memory leaks and unnecessary API calls.
     */
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [threatModelId, trigger]);

  return {
    tmStatus,
    tmDetail,
    sessionId,
    iteration,
    loading,
    trigger,
    setTrigger,
  };
};
