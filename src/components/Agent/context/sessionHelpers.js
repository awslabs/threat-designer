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
      rafId: null,
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

export const scheduleBufferFlush = (sessionId, sessionRefs, setSessions, flushBufferFn) => {
  const refs = getSessionRefs(sessionId, sessionRefs);

  // Cancel any previously scheduled animation frame for this session
  if (refs.rafId !== null) {
    cancelAnimationFrame(refs.rafId);
  }

  // Schedule new animation frame
  refs.rafId = requestAnimationFrame(() => {
    refs.rafId = null;
    flushBufferFn(sessionId, sessionRefs, setSessions);
  });
};

export const addAiMessage = (sessionId, message, sessionRefs, setSessions, flushBufferFn) => {
  // Filter out empty objects
  if (message && typeof message === "object" && Object.keys(message).length === 0) {
    return;
  }

  const refs = getSessionRefs(sessionId, sessionRefs);
  refs.buffer = refs.buffer || [];

  // Deduplicate consecutive tool messages
  if (message.type === "tool" && refs.buffer.length > 0) {
    const lastMsg = refs.buffer[refs.buffer.length - 1];

    if (lastMsg.type === "tool" && lastMsg.id === message.id) {
      const currentKey = `${message.tool_start}_${message.tool_update || false}`;
      const lastKey = `${lastMsg.tool_start}_${lastMsg.tool_update || false}`;

      if (currentKey === lastKey) {
        return; // Skip consecutive duplicate
      }
    }
  }

  refs.buffer.push(message);

  const messageType = message.type || "text";

  // Use requestAnimationFrame for text/think messages for smooth rendering
  // Use setTimeout with 2ms delay for tool messages for immediate feedback
  if (messageType === "text" || messageType === "think") {
    scheduleBufferFlush(sessionId, sessionRefs, setSessions, flushBufferFn);
  } else {
    // Tool messages: use setTimeout with minimal delay
    if (refs.bufferTimeout) {
      clearTimeout(refs.bufferTimeout);
    }
    refs.bufferTimeout = setTimeout(() => {
      flushBufferFn(sessionId, sessionRefs, setSessions);
    }, BUFFER_DELAY_MS);
  }
};

export const cleanupSSE = (sessionId, sessionRefs, setSessions, flushBufferFn) => {
  const refs = getSessionRefs(sessionId, sessionRefs);

  if (refs.eventSource) {
    refs.eventSource.close();
    refs.eventSource = null;
  }

  // Flush any remaining buffered tokens before cleanup
  flushBufferFn(sessionId, sessionRefs, setSessions);

  // Cancel any pending setTimeout for tool messages
  if (refs.bufferTimeout) {
    clearTimeout(refs.bufferTimeout);
    refs.bufferTimeout = null;
  }

  // Cancel any pending requestAnimationFrame
  if (refs.rafId !== null) {
    cancelAnimationFrame(refs.rafId);
    refs.rafId = null;
  }

  updateSession(sessionId, setSessions, { isStreaming: false });
};
