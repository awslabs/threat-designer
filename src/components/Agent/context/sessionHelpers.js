/**
 * Groups raw message array into blocks for rendering.
 * Consecutive text/think messages are merged, tools are tracked by ID.
 * This runs in the buffering layer so grouping happens once when messages arrive,
 * not during every render.
 *
 * @param {Array} messages - Raw message array from aiMessage
 * @param {boolean} isEnd - Whether the message stream has ended
 * @returns {Array} - Grouped message blocks ready for rendering
 */
export const groupMessages = (messages, isEnd = false) => {
  if (!messages || messages.length === 0) return [];

  const blocks = [];
  let currentBlock = null;

  for (let i = 0; i < messages.length; i++) {
    const item = messages[i];

    // Skip interrupt messages - they don't influence block calculation
    if (item.type === "interrupt") {
      continue;
    }

    // Skip empty text messages
    if (item.type === "text" && item.content === "[empty]") {
      continue;
    }

    if (item.type === "tool") {
      // Mark previous non-tool block as complete when transitioning to tool
      if (currentBlock && currentBlock.type !== "tool") {
        currentBlock.isComplete = true;
      }

      // Find existing tool block with the same id
      const existingBlockIndex = blocks.findIndex(
        (block) => block.type === "tool" && block.id === item.id
      );

      if (existingBlockIndex !== -1) {
        const existingBlock = blocks[existingBlockIndex];

        if (item.tool_update) {
          existingBlock.input = item.content;
          existingBlock.items.push(item);
        } else if (!item.tool_start) {
          existingBlock.content = item.content;
          existingBlock.isComplete = true;
          existingBlock.error = item.error;
          existingBlock.items.push(item);
        } else if (item.tool_start) {
          existingBlock.isComplete = true;
          existingBlock.interrupted = true;

          blocks.push({
            type: "tool",
            id: item.id,
            toolName: item.tool_name,
            content: item.content,
            isComplete: false,
            error: item.error,
            items: [item],
          });
        }
      } else {
        blocks.push({
          type: "tool",
          id: item.id,
          toolName: item.tool_name,
          content: item.content,
          isComplete: !item.tool_start,
          error: item.error,
          items: [item],
        });
      }
      currentBlock = null;
    } else if ((item.type === "text" || item.type === "think") && item.content != null) {
      if (currentBlock && currentBlock.type === item.type) {
        currentBlock.content += item.content;
        currentBlock.items.push(item);
      } else {
        if (currentBlock) {
          currentBlock.isComplete = true;
        }

        currentBlock = {
          type: item.type,
          content: item.content,
          isComplete: false,
          items: [item],
        };
        blocks.push(currentBlock);
      }
    }
  }

  // Mark all blocks as complete when message ends
  if (isEnd) {
    blocks.forEach((block) => {
      block.isComplete = true;
    });
  }

  return blocks;
};

/**
 * Set pending interrupt on session state
 * Components can react to this via normal React context updates
 */
export const setPendingInterrupt = (sessionId, interruptMessage, source, setSessions) => {
  setSessions((prev) => {
    const newSessions = new Map(prev);
    const session = newSessions.get(sessionId);
    if (session) {
      newSessions.set(sessionId, {
        ...session,
        pendingInterrupt: {
          interruptMessage,
          source,
          timestamp: Date.now(),
        },
      });
    }
    return newSessions;
  });
};

/**
 * Clear pending interrupt after it has been handled
 */
export const clearPendingInterrupt = (sessionId, setSessions) => {
  setSessions((prev) => {
    const newSessions = new Map(prev);
    const session = newSessions.get(sessionId);
    if (session && session.pendingInterrupt) {
      newSessions.set(sessionId, {
        ...session,
        pendingInterrupt: null,
      });
    }
    return newSessions;
  });
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
      const lastTurn = updatedTurns[lastTurnIndex];

      // Merge new messages with existing
      const newAiMessage = [...lastTurn.aiMessage, ...bufferedMessages];

      // Check if stream has ended (last message has end: true)
      const isEnd =
        bufferedMessages.length > 0 && bufferedMessages[bufferedMessages.length - 1]?.end === true;

      // Pre-compute message blocks during buffering, not during render
      const messageBlocks = groupMessages(newAiMessage, isEnd);

      updatedTurns[lastTurnIndex] = {
        ...lastTurn,
        aiMessage: newAiMessage,
        messageBlocks, // Store pre-grouped blocks
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

  // Use requestAnimationFrame for all message types for smooth, unified rendering
  // RAF batches updates to the next frame (~16ms at 60fps), preventing jank
  scheduleBufferFlush(sessionId, sessionRefs, setSessions, flushBufferFn);
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
