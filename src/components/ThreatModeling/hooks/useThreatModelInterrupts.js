import { useRef, useEffect, useCallback } from "react";
import { useEventReceiver } from "../../Agent/useEventReceiver";

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
  // Queue for storing interrupt events that arrive before data is loaded
  const pendingInterrupts = useRef([]);

  // Reset pending interrupts when threatModelId changes
  useEffect(() => {
    pendingInterrupts.current = [];
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
          threatsPayload.forEach((newThreat) => {
            const existingIndex = updatedThreats.findIndex(
              (existingThreat) => existingThreat.name === newThreat.name
            );
            if (existingIndex !== -1) {
              // Found matching threat - replace it with the updated version
              updatedThreats[existingIndex] = newThreat;
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
      console.log(`Processing interrupt from ${source}:`, interruptMessage);

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
   * INTERRUPT EVENT QUEUING LOGIC:
   * Interrupt events can arrive at any time, including before the threat model data
   * has finished loading. To handle this race condition, we implement a queuing mechanism:
   *
   * 1. If data is not yet loaded: Queue the event in pendingInterrupts ref
   * 2. If data is loaded: Process the event immediately
   * 3. When data loads: Process all queued events in order (see useEffect below)
   *
   * This ensures no interrupt events are lost and they are applied in the correct order.
   *
   * @param {Object} event - The interrupt event received from event bus
   */
  const handleInterruptEvent = useCallback(
    (event) => {
      console.log(`Interrupt event received for id: ${threatModelId}`);

      // Check if response data is available by verifying the threats array exists
      // This is the critical data structure needed to process threat updates
      if (!response?.item?.threat_list?.threats) {
        console.log(
          "Interrupt event received but threat model data not loaded yet - queuing for later processing"
        );

        // QUEUING: Store the event in a ref (not state) to avoid triggering re-renders
        // The ref persists across renders and will be processed once data loads
        pendingInterrupts.current.push(event);
        return;
      }

      // Data is available - process the event immediately
      processInterruptEvent(event);
    },
    [response, processInterruptEvent, threatModelId]
  );

  /**
   * Process pending interrupts when response data becomes available
   *
   * PENDING INTERRUPT PROCESSING:
   * This effect monitors the response data and pending interrupts queue.
   * When data becomes available and there are queued events, it processes them all.
   *
   * Key considerations:
   * - Clear the queue BEFORE processing to prevent infinite loops
   * - Process events in the order they were received (FIFO)
   * - Each event will trigger state updates that may cause this effect to run again
   */
  useEffect(() => {
    // Only process if we have both data and pending interrupts
    if (response?.item?.threat_list?.threats && pendingInterrupts.current.length > 0) {
      console.log(`Processing ${pendingInterrupts.current.length} pending interrupt(s)`);

      // Create a copy of the pending interrupts array
      const interruptsToProcess = [...pendingInterrupts.current];

      // IMPORTANT: Clear the queue FIRST to prevent infinite loops
      // If we cleared after processing, new state updates could trigger this effect again
      // before we finish processing, causing the same events to be processed multiple times
      pendingInterrupts.current = [];

      // Process each queued event in order (FIFO - First In, First Out)
      interruptsToProcess.forEach((event) => {
        processInterruptEvent(event);
      });
    }
  }, [response, processInterruptEvent]);

  // Register the event receiver for CHAT_INTERRUPT events
  useEventReceiver("CHAT_INTERRUPT", threatModelId, handleInterruptEvent);

  return {
    handleInterruptEvent,
  };
};
