import { useRef, useEffect, useCallback, useContext, useState } from "react";
import { ChatSessionFunctionsContext } from "../ChatContext";

/**
 * Custom hook for managing session preparation logic.
 * Handles session ID generation, tool parsing, and periodic session preparation.
 */
export function useSessionPreparation({ sessionId, tools, thinkingBudget }) {
  const functions = useContext(ChatSessionFunctionsContext);
  const debounceTimerRef = useRef(null);
  const prevMessageRef = useRef("");
  const preparingRef = useRef(false);
  const isFirstMount = useRef(true);
  const prepareSessionRef = useRef(null);

  // Generate or use provided session ID
  const [currentSessionId] = useState(() => {
    if (sessionId) return sessionId;

    const uuid = crypto.randomUUID();
    const timestamp = Date.now().toString(36);
    const randomSuffix = Math.random().toString(36).substring(2);
    return `${uuid}-${timestamp}-${randomSuffix}`;
  });

  // Convert thinkingBudget value
  const processedThinkingBudget = thinkingBudget === false ? 0 : thinkingBudget;

  // JSON-only parsing function
  const parseToolString = useCallback((toolString) => {
    try {
      return JSON.parse(toolString);
    } catch (error) {
      console.error("Invalid JSON tool string:", toolString, error);
      return null;
    }
  }, []);

  // Function to prepare session
  const prepareSession = useCallback(async () => {
    if (preparingRef.current) return;

    preparingRef.current = true;

    try {
      const fullContext = functions.getSessionContext(sessionId);

      // Parse and filter tools to get only enabled tool IDs
      const enabledToolIds =
        tools
          ?.map((tool) => {
            if (typeof tool === "string") {
              return parseToolString(tool);
            } else if (typeof tool === "object" && tool !== null) {
              return tool;
            }
            return null;
          })
          .filter((tool) => tool !== null && tool.enabled === true)
          .map((tool) => tool.id) || [];

      await functions.prepareSession(
        currentSessionId,
        enabledToolIds,
        fullContext,
        fullContext?.diagram,
        processedThinkingBudget
      );
    } catch (error) {
      console.error("Error preparing session:", error);
    } finally {
      preparingRef.current = false;
    }
  }, [functions, currentSessionId, sessionId, tools, processedThinkingBudget, parseToolString]);

  // Keep prepareSessionRef updated
  useEffect(() => {
    prepareSessionRef.current = prepareSession;
  }, [prepareSession]);

  // Initial mount effect
  useEffect(() => {
    if (isFirstMount.current) {
      const timer = setTimeout(() => {
        isFirstMount.current = false;
      }, 2000);
      return () => clearTimeout(timer);
    }
    prepareSession();
  }, [prepareSession]);

  // Run prepareSession every 300 seconds using ref to avoid recreating interval
  useEffect(() => {
    const interval = setInterval(() => {
      prepareSessionRef.current?.();
    }, 300000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Debounced prepare session for typing
  const prepareSessionOnTyping = useCallback(
    (message) => {
      const currentMessage = message.trim();
      const prevMessage = prevMessageRef.current.trim();

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (currentMessage) {
        if (!prevMessage) {
          prepareSession();
        } else {
          debounceTimerRef.current = setTimeout(() => {
            prepareSession();
          }, 500);
        }
      }

      prevMessageRef.current = message;
    },
    [prepareSession]
  );

  return {
    currentSessionId,
    prepareSession,
    prepareSessionOnTyping,
    functions,
  };
}

export default useSessionPreparation;
