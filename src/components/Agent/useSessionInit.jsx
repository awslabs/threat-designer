import { useContext, useEffect, useRef, useCallback, useState } from "react";
import { ChatSessionFunctionsContext } from "./ChatContext";

export const useSessionInitializer = (sessionId) => {
  const functions = useContext(ChatSessionFunctionsContext);
  const initializationRef = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Store functions in a ref to avoid recreating callbacks
  const functionsRef = useRef(functions);
  functionsRef.current = functions;

  if (!functions) {
    throw new Error("useSessionInitializer must be used within a ChatSessionProvider");
  }

  // Auto-initialize session once on mount
  useEffect(() => {
    const initializeSessionOnMount = async () => {
      if (!sessionId || initializationRef.current) return;

      try {
        initializationRef.current = true;
        await functionsRef.current.initializeSession(sessionId);
        setIsInitialized(true);
        console.log("sessions initialized");
      } catch (error) {
        console.error(`Failed to initialize session ${sessionId} on mount:`, error);
        initializationRef.current = false;
        setIsInitialized(false);
      }
    };

    initializeSessionOnMount();
  }, [sessionId]);

  // Stable updateSessionContext that doesn't depend on changing context
  const updateSessionContext = useCallback(
    async (targetSessionId, contextData) => {
      try {
        // Use ref to access current functions without causing re-renders
        const currentFunctions = functionsRef.current;

        // Ensure session is initialized first
        if (!isInitialized || targetSessionId !== sessionId) {
          await currentFunctions.initializeSession(targetSessionId);
        }

        await currentFunctions.setSessionContext(targetSessionId, contextData);
        return { success: true, sessionId: targetSessionId };
      } catch (error) {
        console.error(`Failed to update context for session ${targetSessionId}:`, error);
        throw error;
      }
    },
    [isInitialized, sessionId]
  );

  return updateSessionContext;
};
