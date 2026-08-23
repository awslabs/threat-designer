import React, { createContext, useContext, useState, useRef, useEffect, useMemo } from "react";
import { checkForInterruptInChatTurns } from "./context/utils";
import { useChatSessionFunctions } from "./useChatSessionFunctions";
import { SENTRY_ENABLED } from "./context/constants";
import { drainAllSessions, cancelAllPumps } from "./context/sessionHelpers";

// Split contexts
export const ChatSessionFunctionsContext = createContext(null);
export const ChatSessionDataContext = createContext(null);

export const ChatSessionProvider = ({ children }) => {
  const [sessions, setSessions] = useState(new Map());
  const [loadingStates, setLoadingStates] = useState(new Map());
  const [availableTools, setAvailableTools] = useState([]);
  const [visible, setisVisible] = useState(false);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState(null);

  // Refs for stable data
  const sessionsRef = useRef(new Map());
  const sessionRefs = useRef(new Map());
  const initializedSessions = useRef(new Set());
  const initializingPromises = useRef(new Map());
  const toolsFetched = useRef(false);

  // Update sessionsRef whenever sessions state changes
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Handle disabled Sentry state
  useEffect(() => {
    if (!SENTRY_ENABLED) {
      setToolsLoading(false);
      setToolsError(new Error("Sentry feature is disabled"));
      setAvailableTools([]);
      toolsFetched.current = true; // Prevent further fetch attempts
    }
  }, []);

  // Create stable functions that don't depend on state directly
  const stableFunctions = useChatSessionFunctions({
    setSessions,
    setLoadingStates,
    setAvailableTools,
    setToolsLoading,
    setToolsError,
    sessionsRef,
    sessionRefs,
    initializedSessions,
    initializingPromises,
    toolsFetched,
    checkForInterruptInChatTurns,
  });

  // Auto-flush on page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      stableFunctions.flushAllSessions();
    };

    const handleUnload = () => {
      stableFunctions.flushAllSessions();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("unload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("unload", handleUnload);
    };
  }, [stableFunctions]);

  // Hidden tabs get no animation frames, so the typewriter pump stalls while
  // chunks keep queueing — and returning would replay the whole backlog at
  // reveal rate, looking like live generation long after the run finished. The
  // animation is a foreground nicety, so flush any backlog on a visibility flip.
  useEffect(() => {
    const onVisibilityChange = () => drainAllSessions(sessionRefs, setSessions);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionRefs.current.forEach((refs) => {
        if (refs.eventSource) {
          refs.eventSource.close();
        }
        if (refs.bufferTimeout) {
          clearTimeout(refs.bufferTimeout);
        }
      });
      // Drops any in-flight typewriter frame along with the session state.
      cancelAllPumps(sessionRefs);

      sessionRefs.current.clear();
      initializedSessions.current.clear();
      initializingPromises.current.clear();
    };
  }, []);

  // Combine functions with tools data
  const functionsValue = useMemo(
    () => ({
      ...stableFunctions,
      availableTools,
      visible,
      setisVisible,
      toolsLoading,
      toolsError,
    }),
    [stableFunctions, availableTools, toolsLoading, toolsError, visible, setisVisible]
  );

  // Data value includes sessions and loading states
  const dataValue = useMemo(
    () => ({
      sessions,
      loadingStates,
    }),
    [sessions, loadingStates]
  );

  return (
    <ChatSessionFunctionsContext.Provider value={functionsValue}>
      <ChatSessionDataContext.Provider value={dataValue}>
        {children}
      </ChatSessionDataContext.Provider>
    </ChatSessionFunctionsContext.Provider>
  );
};
