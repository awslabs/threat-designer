import { BUFFER_DELAY_MS } from "./constants";

export const emitInterruptEvent = (sessionId, interruptMessage, source = "unknown", eventBus) => {
  eventBus.emit(
    "CHAT_INTERRUPT",
    {
      sessionId,
      interruptMessage,
      source,
      timestamp: Date.now(),
    },
    sessionId,
    `interrupt_${sessionId}_${Date.now()}`
  );
};

export const getSessionRefs = (sessionId, sessionRefs) => {
  if (!sessionRefs.current.has(sessionId)) {
    sessionRefs.current.set(sessionId, {
      eventSource: null,
      buffer: [],
      bufferTimeout: null,
    });
  }
  return sessionRefs.current.get(sessionId);
};

export const updateSession = (sessionId, setSessions, updates) => {
  setSessions((prev) => {
    const newSessions = new Map(prev);
    const currentSession = newSessions.get(sessionId);
    if (currentSession) {
      newSessions.set(sessionId, { ...currentSession, ...updates });
    }
    return newSessions;
  });
};

export const setSessionLoading = (sessionId, setLoadingStates, isLoading) => {
  setLoadingStates((prev) => {
    const newStates = new Map(prev);
    if (isLoading) {
      newStates.set(sessionId, true);
    } else {
      newStates.delete(sessionId);
    }
    return newStates;
  });
};

export const flushBuffer = (sessionId, sessionRefs, setSessions) => {
  const refs = getSessionRefs(sessionId, sessionRefs);
  if (!refs.buffer || refs.buffer.length === 0) return;

  const bufferedMessages = [...refs.buffer];
  refs.buffer = [];

  setSessions((prev) => {
    const newSessions = new Map(prev);
    const session = newSessions.get(sessionId);
    if (session && session.chatTurns.length > 0) {
      const updatedTurns = [...session.chatTurns];
      const lastTurnIndex = updatedTurns.length - 1;
      updatedTurns[lastTurnIndex] = {
        ...updatedTurns[lastTurnIndex],
        aiMessage: [...updatedTurns[lastTurnIndex].aiMessage, ...bufferedMessages],
      };
      newSessions.set(sessionId, { ...session, chatTurns: updatedTurns });
    }
    return newSessions;
  });
};

export const addAiMessage = (sessionId, message, sessionRefs, setSessions, flushBufferFn) => {
  // Filter out empty objects
  if (message && typeof message === "object" && Object.keys(message).length === 0) {
    return;
  }

  const refs = getSessionRefs(sessionId, sessionRefs);

  // Buffer ALL message types to maintain order
  refs.buffer = refs.buffer || [];
  refs.buffer.push(message);

  if (refs.bufferTimeout) {
    clearTimeout(refs.bufferTimeout);
  }

  // For non-text messages, use a much shorter delay to maintain responsiveness
  // but still preserve order
  const messageType = message.type || "text";
  const delay = messageType === "text" || messageType === "think" ? BUFFER_DELAY_MS : 5;

  refs.bufferTimeout = setTimeout(() => {
    flushBufferFn(sessionId, sessionRefs, setSessions);
  }, delay);
};

export const cleanupSSE = (sessionId, sessionRefs, setSessions, flushBufferFn) => {
  const refs = getSessionRefs(sessionId, sessionRefs);

  if (refs.eventSource) {
    refs.eventSource.close();
    refs.eventSource = null;
  }

  if (refs.bufferTimeout) {
    clearTimeout(refs.bufferTimeout);
    flushBufferFn(sessionId, sessionRefs, setSessions);
  }

  updateSession(sessionId, setSessions, { isStreaming: false });
};
