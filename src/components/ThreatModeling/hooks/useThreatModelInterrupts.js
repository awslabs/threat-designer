import { useRef, useEffect, useCallback, useContext } from "react";
import { ChatSessionDataContext, ChatSessionFunctionsContext } from "../../Agent/ChatContext";

/**
 * Custom hook for handling real-time interrupt events from Sentry agent
 *
 * This hook manages interrupt events that modify threat model data in real-time.
 * It queues events that arrive before data is loaded and processes them once data becomes available.
 * Supports add_threats, edit_threats, and delete_threats operations.
 *
 * @param {string} threatModelId - The ID of the threat model
 * @param {Object|null} response - Current threat model response data
 * @param {Function} initializeThreatModelSession - Function to reinitialize session context
 * @param {Function} setResponse - Function to set the response state
 * @param {Function} sendMessage - Function to send acknowledgment messages to Sentry
 * @returns {Object} Hook interface
 * @returns {Function} returns.handleInterruptEvent - Event handler function for interrupt events
 *
 * @example
 * const { handleInterruptEvent } = useThreatModelInterrupts(
 *   threatModelId,
 *   response,
 *   initializeThreatModelSession,
 *   setResponse,
 *   sendMessage
 * );
 */
export const useThreatModelInterrupts = (
  threatModelId,
  response,
  initializeThreatModelSession,
  setResponse,
  sendMessage
) => {
  // Get session data and functions from context to watch for pending interrupts
  const sessionData = useContext(ChatSessionDataContext);
  const sessionFunctions = useContext(ChatSessionFunctionsContext);

  // Queue for storing interrupt events that arrive before data is loaded
  const pendingInterrupts = useRef([]);

  // Track processed interrupt timestamps to prevent duplicate processing
  const processedInterrupts = useRef(new Set());

  // Reset pending interrupts when threatModelId changes
  useEffect(() => {
    pendingInterrupts.current = [];
    processedInterrupts.current = new Set();
  }, [threatModelId]);

  /**
   * Handle threat updates from interrupt events
   * Applies add, edit, or delete operations to the threat list
   *
   * @param {string} toolName - The operation type (add_threats, edit_threats, delete_threats)
   * @param {Array} threatsPayload - Array of threat objects to process
   */
  const handleThreatUpdates = useCallback(
    (toolName, threatsPayload) => {
      // Validate payload format before processing
      if (!Array.isArray(threatsPayload)) {
        console.error("Invalid threat payload format - expected array");
        return;
      }

      // Create a shallow copy of the threats array to avoid mutating state directly
      let updatedThreats = [...response.item.threat_list.threats];

      switch (toolName) {
        case "add_threats":
          // ADD OPERATION: Append new threats to the end of the existing list
          // This preserves the order of existing threats while adding new ones
          updatedThreats = [...updatedThreats, ...threatsPayload];
          console.log(`Added ${threatsPayload.length} new threats`);
          break;

        case "edit_threats":
          // EDIT OPERATION: Replace existing threats by matching their names
          // Threats are identified by their 'name' property which acts as a unique key
          // IMPORTANT: Preserve user-only fields (like 'notes') that the LLM cannot see
          threatsPayload.forEach((newThreat) => {
            const existingIndex = updatedThreats.findIndex(
              (existingThreat) => existingThreat.name === newThreat.name
            );
            if (existingIndex !== -1) {
              // Found matching threat - merge with existing to preserve user-only fields
              // The 'notes' field is excluded from LLM context, so we must preserve it
              const existingThreat = updatedThreats[existingIndex];
              updatedThreats[existingIndex] = {
                ...newThreat,
                notes: existingThreat.notes, // Preserve user notes from existing threat
              };
              console.log(`Updated threat: ${newThreat.name}`);
            } else {
              // Threat name not found - this could indicate a sync issue
              console.warn(`Threat not found for editing: ${newThreat.name}`);
            }
          });
          break;

        case "delete_threats":
          // DELETE OPERATION: Remove threats by filtering out matching names
          // Extract all threat names to delete for efficient filtering
          const threatNamesToDelete = threatsPayload.map((threat) => threat.name);
          const originalCount = updatedThreats.length;

          // Filter keeps only threats whose names are NOT in the delete list
          updatedThreats = updatedThreats.filter(
            (existingThreat) => !threatNamesToDelete.includes(existingThreat.name)
          );
          console.log(`Deleted ${originalCount - updatedThreats.length} threats`);
          break;

        default:
          console.warn(`Unknown threat operation: ${toolName}`);
          return;
      }

      // Create new state object with updated threats
      // We need to create new objects at each level to ensure React detects the change
      const newState = { ...response };
      newState.item = { ...newState.item };
      newState.item.threat_list = { ...newState.item.threat_list };
      newState.item.threat_list.threats = updatedThreats;

      // Update the Sentry session context with the new threat model data
      // This ensures the agent has the latest context for future interactions
      initializeThreatModelSession(newState.item);

      // Update the component state to trigger a re-render with the new data
      setResponse(newState);
    },
    [response, initializeThreatModelSession, setResponse]
  );

  /**
   * Process a single interrupt event
   * Extracts payload and tool name, then applies the appropriate update
   *
   * @param {Object} event - The interrupt event to process
   */
  const processInterruptEvent = useCallback(
    (event) => {
      const { interruptMessage, source } = event.payload;

      // Create a unique key for this interrupt to prevent duplicate processing
      const interruptKey = `${interruptMessage?.content?.tool_name}_${JSON.stringify(interruptMessage?.content?.payload || {}).slice(0, 100)}`;

      // Check if we've already processed this interrupt
      if (processedInterrupts.current.has(interruptKey)) {
        return;
      }

      // Mark as processed
      processedInterrupts.current.add(interruptKey);

      const payload = interruptMessage.content.payload;
      const toolName = interruptMessage.content.tool_name;

      // Handle threat updates based on tool name
      if (["add_threats", "edit_threats", "delete_threats"].includes(toolName)) {
        handleThreatUpdates(toolName, payload);
      }

      // Send acknowledgment message to Sentry
      sendMessage(threatModelId, toolName);
    },
    [handleThreatUpdates, sendMessage, threatModelId]
  );

  /**
   * Main event handler for interrupt events
   * Queues events if data is not loaded, otherwise processes immediately
   *
   * @param {Object} event - The interrupt event received from event bus
   */
  const handleInterruptEvent = useCallback(
    (event) => {
      // Check if response data is available by verifying the threats array exists
      if (!response?.item?.threat_list?.threats) {
        // Queue the event for later processing
        pendingInterrupts.current.push(event);
        return;
      }

      // Data is available - process the event immediately
      processInterruptEvent(event);
    },
    [response, processInterruptEvent]
  );

  /**
   * Process pending interrupts when response data becomes available
   */
  useEffect(() => {
    if (response?.item?.threat_list?.threats && pendingInterrupts.current.length > 0) {
      const interruptsToProcess = [...pendingInterrupts.current];
      pendingInterrupts.current = [];

      interruptsToProcess.forEach((event) => {
        processInterruptEvent(event);
      });
    }
  }, [response, processInterruptEvent]);

  /**
   * Watch for pending interrupts in session state
   * When a pendingInterrupt is set on the session, process it and clear it
   */
  useEffect(() => {
    if (!sessionData?.sessions || !threatModelId) return;

    const session = sessionData.sessions.get(threatModelId);
    if (!session?.pendingInterrupt) return;

    const { interruptMessage, source } = session.pendingInterrupt;

    const event = {
      payload: {
        interruptMessage,
        source,
      },
    };

    // Clear the interrupt from session state first to prevent re-processing
    if (sessionFunctions?.clearInterrupt) {
      sessionFunctions.clearInterrupt(threatModelId);
    }

    handleInterruptEvent(event);
  }, [sessionData?.sessions, threatModelId, handleInterruptEvent, sessionFunctions]);

  return {
    handleInterruptEvent,
  };
};
