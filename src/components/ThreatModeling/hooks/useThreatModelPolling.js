import { useState, useEffect, useRef } from "react";
import { getThreatModelingStatus } from "../../../services/ThreatDesigner/stats";

/**
 * Custom hook for polling threat model status
 *
 * Polls the threat model status at 1-second intervals and handles status transitions.
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

  useEffect(() => {
    // Reset terminal state flag when threatModelId or trigger changes
    hasProcessedTerminalState.current = false;
  }, [threatModelId, trigger]);

  /**
   * POLLING EFFECT
   *
   * This effect implements a polling mechanism to check threat model processing status.
   * It runs continuously at 1-second intervals until a terminal state is reached.
   *
   * POLLING LIFECYCLE:
   * 1. Initial check immediately on mount
   * 2. Set up 1-second interval for continuous polling
   * 3. Stop polling when COMPLETE or FAILED state is reached
   * 4. Clean up interval on unmount or when dependencies change
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
          clearInterval(intervalId);
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
          clearInterval(intervalId);
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
        clearInterval(intervalId);
        setTmStatus(null);
        setLoading(false);
      }
    };

    if (threatModelId) {
      // Perform initial status check immediately
      checkStatus();

      // Set up polling interval (1000ms = 1 second)
      // This provides near real-time updates without overwhelming the server
      intervalId = setInterval(checkStatus, 1000);
    }

    /**
     * CLEANUP FUNCTION
     *
     * Clears the polling interval when:
     * - Component unmounts
     * - threatModelId changes (switching threat models)
     * - trigger changes (manual refresh requested)
     *
     * This prevents memory leaks and unnecessary API calls.
     */
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
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
