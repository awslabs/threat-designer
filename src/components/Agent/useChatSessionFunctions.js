import { useMemo } from "react";
import {
  fetchAvailableTools,
  prepareSession,
  clearSessionAPI,
  fetchSessionHistory,
  sendMessageAPI,
  stopAPI,
} from "./context/api";
import {
  emitInterruptEvent,
  getSessionRefs,
  updateSession,
  setSessionLoading,
  flushBuffer,
  addAiMessage,
  cleanupSSE,
} from "./context/sessionHelpers";
import { SENTRY_ENABLED } from "./context/constants";

export const useChatSessionFunctions = (props) => {
  const {
    setSessions,
    setLoadingStates,
    sessionsRef,
    sessionRefs,
    initializedSessions,
    initializingPromises,
    toolsFetched,
    setAvailableTools,
    setToolsLoading,
    setToolsError,
    eventBus,
    checkForInterruptInChatTurns,
  } = props;

  return useMemo(() => {
    // Fetch available tools
    const fetchTools = async (sessionId) => {
      if (toolsFetched.current) return;

      setToolsLoading(true);
      setToolsError(null);

      try {
        const tools = await fetchAvailableTools(sessionId);
        setAvailableTools(tools);
        toolsFetched.current = true;
      } catch (error) {
        console.error("Failed to fetch available tools:", error);
        setToolsError(error.message || "Failed to load tools");
        setAvailableTools([]);
      } finally {
        setToolsLoading(false);
      }
    };

    // Clear session
    const clearSession = async (sessionId) => {
      // Handle Sentry disabled - just clear local state
      if (!SENTRY_ENABLED) {
        console.log(`Sentry disabled - clearing local session ${sessionId}`);
        updateSession(sessionId, setSessions, {
          chatTurns: [],
          error: null,
          isStreaming: false,
        });
        return { success: true };
      }

      setSessionLoading(sessionId, setLoadingStates, true);

      try {
        const data = await clearSessionAPI(sessionId);

        updateSession(sessionId, setSessions, {
          chatTurns: [],
          error: null,
          isStreaming: false,
        });

        return data;
      } catch (error) {
        console.error(`Failed to clear session ${sessionId}:`, error);
        throw error;
      } finally {
        setSessionLoading(sessionId, setLoadingStates, false);
      }
    };

    // Set session context
    const setSessionContext = async (sessionId, context) => {
      if (context && typeof context === "object") {
        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(sessionId);

          if (session) {
            const updatedContext = {
              ...session.context,
              ...context,
            };
            newSessions.set(sessionId, {
              ...session,
              context: updatedContext,
            });
          }
          return newSessions;
        });
      }
    };

    // Clear session context
    const clearSessionContext = async (sessionId) => {
      setSessions((prev) => {
        const newSessions = new Map(prev);
        const session = newSessions.get(sessionId);

        if (session) {
          newSessions.set(sessionId, {
            ...session,
            context: {
              diagram: null,
              threatModel: null,
            },
          });
        }

        return newSessions;
      });
    };

    // Get session context (uses ref)
    const getSessionContext = (sessionId) => {
      const session = sessionsRef.current.get(sessionId);
      return session?.context || { diagram: null, threatModel: null };
    };

    // Remove session
    const removeSession = (sessionId) => {
      setSessions((prev) => {
        const newSessions = new Map(prev);
        newSessions.delete(sessionId);
        return newSessions;
      });

      setLoadingStates((prev) => {
        const newStates = new Map(prev);
        newStates.delete(sessionId);
        return newStates;
      });

      const refs = sessionRefs.current.get(sessionId);
      if (refs) {
        if (refs.eventSource) {
          refs.eventSource.close();
        }
        if (refs.bufferTimeout) {
          clearTimeout(refs.bufferTimeout);
        }
        sessionRefs.current.delete(sessionId);
      }

      initializedSessions.current.delete(sessionId);
      initializingPromises.current.delete(sessionId);

      console.log(`Session ${sessionId} removed from memory`);
    };

    // Initialize session
    const initializeSession = async (sessionId, forceCheck = false) => {
      if (!forceCheck && initializingPromises.current.has(sessionId)) {
        return initializingPromises.current.get(sessionId);
      }

      // Handle Sentry disabled state - create local-only session
      if (!SENTRY_ENABLED) {
        if (!forceCheck && initializedSessions.current.has(sessionId)) {
          return;
        }

        console.log(`Sentry disabled - creating local-only session for ${sessionId}`);

        setSessions((prev) => {
          const existingSession = prev.get(sessionId);
          if (existingSession) {
            return prev;
          }

          const newSessions = new Map(prev);
          newSessions.set(sessionId, {
            id: sessionId,
            chatTurns: [],
            isStreaming: false,
            error: null,
            restoredFromBackend: false,
            context: { diagram: null, threatModel: null },
          });
          return newSessions;
        });

        if (!sessionRefs.current.has(sessionId)) {
          sessionRefs.current.set(sessionId, {
            eventSource: null,
            buffer: [],
            bufferTimeout: null,
          });
        }

        initializedSessions.current.add(sessionId);
        return;
      }

      if (!toolsFetched.current) {
        await fetchTools(sessionId);
      }

      if (!forceCheck && initializedSessions.current.has(sessionId)) {
        return;
      }

      const existingSession = sessionsRef.current.get(sessionId);
      if (!forceCheck && existingSession && existingSession.chatTurns.length > 0) {
        initializedSessions.current.add(sessionId);
        return;
      }

      const initPromise = (async () => {
        try {
          setSessionLoading(sessionId, setLoadingStates, true);

          let chatTurns;
          try {
            chatTurns = await fetchSessionHistory(sessionId);
          } catch (error) {
            console.warn(`Failed to fetch session ${sessionId} history:`, error);
            chatTurns = null;
          }

          if (chatTurns !== null) {
            setSessions((prev) => {
              const newSessions = new Map(prev);
              newSessions.set(sessionId, {
                id: sessionId,
                chatTurns: chatTurns,
                isStreaming: false,
                error: null,
                restoredFromBackend: true,
                context: { diagram: null, threatModel: null },
              });
              return newSessions;
            });

            const interruptMessage = checkForInterruptInChatTurns(chatTurns);
            if (interruptMessage) {
              console.log(
                `Interrupt found in session ${sessionId} loaded from memory:`,
                interruptMessage
              );
              emitInterruptEvent(sessionId, interruptMessage, "memory", eventBus);
            }

            if (!sessionRefs.current.has(sessionId)) {
              sessionRefs.current.set(sessionId, {
                eventSource: null,
                buffer: [],
                bufferTimeout: null,
              });
            }

            initializedSessions.current.add(sessionId);
            setSessionLoading(sessionId, setLoadingStates, false);
            return;
          }

          setSessions((prev) => {
            const existingSession = prev.get(sessionId);
            if (existingSession && existingSession.chatTurns.length > 0) {
              return prev;
            }

            const newSession = {
              id: sessionId,
              chatTurns: [],
              isStreaming: false,
              error: null,
              restoredFromBackend: false,
              context: { diagram: null, threatModel: null },
            };

            const newSessions = new Map(prev);
            newSessions.set(sessionId, newSession);
            return newSessions;
          });

          if (!sessionRefs.current.has(sessionId)) {
            sessionRefs.current.set(sessionId, {
              eventSource: null,
              buffer: [],
              bufferTimeout: null,
            });
          }

          initializedSessions.current.add(sessionId);
          setSessionLoading(sessionId, setLoadingStates, false);
        } catch (error) {
          console.error(`Error initializing session ${sessionId}:`, error);
          setSessionLoading(sessionId, setLoadingStates, false);

          setSessions((prev) => {
            if (prev.has(sessionId)) return prev;

            const newSessions = new Map(prev);
            newSessions.set(sessionId, {
              id: sessionId,
              chatTurns: [],
              isStreaming: false,
              error: null,
              restoredFromBackend: false,
              context: { diagram: null, threatModel: null },
            });
            return newSessions;
          });

          initializedSessions.current.add(sessionId);
        } finally {
          initializingPromises.current.delete(sessionId);
        }
      })();

      initializingPromises.current.set(sessionId, initPromise);

      return initPromise;
    };

    // Dismiss error
    const dismissError = (sessionId) => {
      updateSession(sessionId, setSessions, { error: null });
    };

    // Send message
    const sendMessage = async (
      sessionId,
      userMessage,
      interrupt = false,
      interruptResponse = null,
      retryAttempt = 0
    ) => {
      // Handle Sentry disabled - no-op for message sending
      if (!SENTRY_ENABLED) {
        console.log(`Sentry disabled - message not sent to backend: "${userMessage}"`);
        return;
      }

      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [500, 1000, 2000]; // Exponential backoff in ms

      if (!userMessage.trim()) {
        return;
      }

      const currentSession = sessionsRef.current.get(sessionId);

      // Retry logic for session not ready
      if (!currentSession) {
        if (retryAttempt < MAX_RETRIES) {
          console.warn(
            `Session ${sessionId} not ready. Retry attempt ${retryAttempt + 1}/${MAX_RETRIES}`
          );

          // Try to initialize the session if it hasn't been
          if (!initializedSessions.current.has(sessionId)) {
            await initializeSession(sessionId);
          }

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[retryAttempt]));

          // Recursive retry
          return sendMessage(
            sessionId,
            userMessage,
            interrupt,
            interruptResponse,
            retryAttempt + 1
          );
        } else {
          console.error(`Session ${sessionId} still not ready after ${MAX_RETRIES} retries`);

          // Update session with error
          updateSession(sessionId, setSessions, {
            error: "Session not ready. Please try again later.",
            isStreaming: false,
          });

          throw new Error(`Session ${sessionId} initialization timeout`);
        }
      }

      // Only block regular messages if streaming, allow interrupts to proceed
      if (!interrupt && currentSession.isStreaming) {
        console.log("Session is currently streaming, message blocked");
        return;
      }

      // For regular messages (not interrupts), clean up SSE and update session state
      if (!interrupt) {
        cleanupSSE(sessionId, sessionRefs, setSessions, flushBuffer);

        const turnId = `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const newTurn = {
          id: turnId,
          userMessage: userMessage,
          aiMessage: [],
        };

        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(sessionId);

          if (!session) {
            console.warn(`Session ${sessionId} not found when sending message`);
            return prev;
          }

          newSessions.set(sessionId, {
            ...session,
            chatTurns: [...session.chatTurns, newTurn],
            isStreaming: true,
            error: null,
          });

          return newSessions;
        });
      }

      try {
        const response = await sendMessageAPI(sessionId, userMessage, interrupt, interruptResponse);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "interrupt") {
                  console.log(`Interrupt received for session ${sessionId}:`, data.content);
                  emitInterruptEvent(sessionId, data, "sse", eventBus);
                  return;
                }

                if (data.end) {
                  addAiMessage(sessionId, data, sessionRefs, setSessions, flushBuffer);
                  cleanupSSE(sessionId, sessionRefs, setSessions, flushBuffer);
                  return;
                }

                addAiMessage(sessionId, data, sessionRefs, setSessions, flushBuffer);
              } catch (err) {
                console.error("Error parsing streaming response:", err);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error sending message:", err);

        // Retry on network errors (but not for interrupts)
        if (!interrupt && retryAttempt < MAX_RETRIES && isRetryableError(err)) {
          console.log(
            `Retrying message send after error. Attempt ${retryAttempt + 1}/${MAX_RETRIES}`
          );

          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[retryAttempt]));

          return sendMessage(
            sessionId,
            userMessage,
            interrupt,
            interruptResponse,
            retryAttempt + 1
          );
        }

        // Only update session error for regular messages, not interrupts
        if (!interrupt) {
          updateSession(sessionId, setSessions, {
            error: err.message || "Failed to send message. Please try again.",
          });
          cleanupSSE(sessionId, sessionRefs, setSessions, flushBuffer);
        }

        throw err;
      }
    };

    // Helper function to determine if an error is retryable
    const isRetryableError = (error) => {
      // Retry on network errors, timeout, or specific status codes
      const retryableMessages = ["network", "timeout", "fetch", "connection"];

      const errorMessage = error.message?.toLowerCase() || "";
      const isNetworkError = retryableMessages.some((msg) => errorMessage.includes(msg));

      // Also retry on specific HTTP status codes if available
      const retryableStatusCodes = [408, 429, 502, 503, 504];
      const hasRetryableStatus = error.status && retryableStatusCodes.includes(error.status);

      return isNetworkError || hasRetryableStatus;
    };

    // Clear chat
    const clearChat = (sessionId) => {
      cleanupSSE(sessionId, sessionRefs, setSessions, flushBuffer);
      updateSession(sessionId, setSessions, {
        chatTurns: [],
        error: null,
      });

      const refs = getSessionRefs(sessionId, sessionRefs);
      refs.buffer = [];
    };

    // Stop streaming - Not implemented
    const stopStreaming = async (sessionId) => {
      try {
        const data = await stopAPI(sessionId);

        updateSession(sessionId, setSessions, {
          error: null,
          isStreaming: false,
        });
        cleanupSSE(sessionId, sessionRefs, setSessions, flushBuffer);
        return data;
      } catch (error) {
        console.error(`Failed to stop ${sessionId}:`, error);
      }
    };

    // Refresh session
    const refreshSession = async (sessionId) => {
      initializedSessions.current.delete(sessionId);
      await initializeSession(sessionId, true);
    };

    // Flush all sessions
    const flushAllSessions = () => {
      console.log(`Flushing all ${sessionsRef.current.size} sessions from memory`);
      Array.from(sessionsRef.current.keys()).forEach(removeSession);
    };

    // Handle auth change
    const handleAuthChange = (newUser = null, oldUser = null) => {
      if (!newUser || (oldUser && newUser?.id !== oldUser?.id)) {
        console.log("User auth changed, flushing all sessions");
        flushAllSessions();
      }
    };

    // Wrap prepareSession to handle Sentry disabled
    const prepareSessionWrapper = async (...args) => {
      if (!SENTRY_ENABLED) {
        console.log("Sentry disabled - session preparation skipped");
        return { status: "skipped", message: "Sentry is disabled" };
      }
      return prepareSession(...args);
    };

    return {
      initializeSession,
      prepareSession: prepareSessionWrapper,
      clearSession,
      setSessionContext,
      clearSessionContext,
      getSessionContext,
      sendMessage,
      clearChat,
      stopStreaming,
      dismissError,
      refreshSession,
      removeSession,
      flushAllSessions,
      handleAuthChange,
    };
  }, []);
};
