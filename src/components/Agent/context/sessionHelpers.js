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
      // Typewriter pump state (see the block below).
      rate: 0, // smoothed chars/frame
      acc: 0, // fractional char accumulator
      netDone: false, // network stream finished (may still be revealing)
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

// --- smooth text reveal (typewriter pump) ------------------------------------
// The network delivers tokens in BURSTS (one packet is often dozens of tokens).
// Batching them per frame — which is all the previous implementation did — still
// pops a whole burst into view at once. Instead we treat the buffer as a QUEUE
// and reveal characters at a steady, smoothed rate every frame, decoupled from
// arrival, so text types out evenly instead of lurching.
//
// The rate is a low-pass-filtered function of the backlog, so it eases up and
// down rather than snapping between fast and slow (that snapping is what reads
// as burst-then-pause), with a fractional accumulator so sub-1-char/frame speeds
// work. Reasoning ("think") is metered like answer text: it streams as summaries
// emitted when a raw-thinking segment completes, so it arrives in paragraph-sized
// bursts that would otherwise appear all at once. Tool and interrupt chunks pass
// through in order, unmetered.
//
// Tuning: DRAIN_FRAMES is how many frames to nominally spread the current
// backlog over (bigger = more cushion = fewer pauses). The rate is clamped so it
// never trickles to a stop mid-answer (MIN) nor bursts (MAX), and eased toward
// its target by SMOOTH (smaller = smoother).
//
// REVEAL_MAX only has to sit above the fastest rate the network can feed us. In
// steady state the backlog term governs (at 100 chars/s arrival the queue holds
// ~100 chars and the rate settles at ~100 chars/s), so the ceiling is reached
// only on a burst — where catching up quickly is the desired behaviour. It used
// to be 6 (~360 chars/s), which is *below* peak generation, so on a long answer
// the queue grew without bound and a 20k-char reply kept typing for the better
// part of a minute after the stream had already finished.
const DRAIN_FRAMES = 60; // ~1s of cushion at 60fps
const REVEAL_MIN = 0.6; // ~36 chars/s floor while content remains
const REVEAL_MAX = 120; // ~7200 chars/s ceiling, above any real stream
const SMOOTH = 0.08; // rate low-pass factor

// Chunks the pump reveals character-by-character. "[empty]" is a control marker
// that groupMessages drops, so it must not be sliced.
const isMetered = (chunk) =>
  (chunk.type === "text" || chunk.type === "think") &&
  typeof chunk.content === "string" &&
  chunk.content !== "[empty]";

const pendingChars = (queue) => {
  let n = 0;
  for (const chunk of queue) {
    if (isMetered(chunk)) n += chunk.content.length;
  }
  return n;
};

/** Merge revealed chunks into the session's last turn and re-group its blocks. */
const applyMessages = (sessionId, setSessions, bufferedMessages) => {
  if (bufferedMessages.length === 0) return;

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

/** Settle isStreaming once the queue is empty AND the network is done. */
const finishIfDrained = (sessionId, sessionRefs, setSessions) => {
  const refs = getSessionRefs(sessionId, sessionRefs);
  if (refs.buffer.length === 0 && refs.netDone) {
    refs.rate = 0;
    refs.acc = 0;
    updateSession(sessionId, setSessions, { isStreaming: false });
  }
};

/**
 * Reveal everything still queued, immediately and unmetered.
 *
 * Used on teardown, explicit stop, and while the tab is hidden — the animation
 * is a foreground nicety, and replaying a backlog at reveal rate after the user
 * returns would look like live generation long after the run finished.
 */
export const flushBuffer = (sessionId, sessionRefs, setSessions) => {
  const refs = getSessionRefs(sessionId, sessionRefs);
  if (refs.rafId !== null) {
    cancelAnimationFrame(refs.rafId);
    refs.rafId = null;
  }
  if (!refs.buffer || refs.buffer.length === 0) return;

  const remaining = refs.buffer;
  refs.buffer = [];
  applyMessages(sessionId, setSessions, remaining);
};

/** One frame of metered reveal; reschedules itself while anything remains. */
const pumpBuffer = (sessionId, sessionRefs, setSessions) => {
  const refs = getSessionRefs(sessionId, sessionRefs);
  refs.rafId = null;

  const queue = refs.buffer;
  if (queue.length === 0) {
    finishIfDrained(sessionId, sessionRefs, setSessions);
    return;
  }

  // Ease the reveal rate toward a target derived from the backlog. Only floor to
  // MIN while text is actually pending, so it keeps trickling steadily rather
  // than stalling; near the end, MIN drains the last few characters.
  //
  // The ceiling exists to pace against an ongoing stream. Once the network is
  // done there is nothing left to pace against, so the tail drains over
  // DRAIN_FRAMES regardless of how much is queued — otherwise finishing a long
  // answer would take longer than generating it did.
  const pending = pendingChars(queue);
  const ideal = pending / DRAIN_FRAMES;
  const target = pending > 0 ? (refs.netDone ? ideal : Math.min(REVEAL_MAX, ideal)) : 0;
  refs.rate += (target - refs.rate) * SMOOTH;
  let effRate = refs.rate;
  if (pending > 0 && effRate < REVEAL_MIN) effRate = REVEAL_MIN;

  // Accumulate fractional chars; reveal the whole-number part this frame.
  refs.acc += effRate;
  let budget = Math.floor(refs.acc);
  refs.acc -= budget;

  const emit = [];
  while (queue.length > 0) {
    const head = queue[0];
    if (isMetered(head)) {
      if (budget <= 0) break;
      if (head.content.length <= budget) {
        emit.push(head);
        budget -= head.content.length;
        queue.shift();
      } else {
        // Reveal a slice; leave the remainder at the head for the next frame.
        // groupMessages concatenates consecutive same-type chunks, so splitting
        // one chunk into several renders identically.
        emit.push({ ...head, content: head.content.slice(0, budget) });
        queue[0] = { ...head, content: head.content.slice(budget) };
        break;
      }
    } else {
      // Tool / interrupt / end markers: pass through in order, unmetered.
      emit.push(head);
      queue.shift();
    }
  }

  applyMessages(sessionId, setSessions, emit);

  if (queue.length > 0) {
    refs.rafId = requestAnimationFrame(() => pumpBuffer(sessionId, sessionRefs, setSessions));
  } else {
    finishIfDrained(sessionId, sessionRefs, setSessions);
  }
};

const ensurePump = (sessionId, sessionRefs, setSessions) => {
  const refs = getSessionRefs(sessionId, sessionRefs);
  if (refs.rafId === null) {
    refs.rafId = requestAnimationFrame(() => pumpBuffer(sessionId, sessionRefs, setSessions));
  }
};

/** Drop any scheduled typewriter frame in every session (teardown). */
export const cancelAllPumps = (sessionRefs) => {
  sessionRefs.current.forEach((refs) => {
    if (refs.rafId !== null) {
      cancelAnimationFrame(refs.rafId);
      refs.rafId = null;
    }
  });
};

/** Drain every session's backlog — used when the tab's visibility flips. */
export const drainAllSessions = (sessionRefs, setSessions) => {
  sessionRefs.current.forEach((_refs, sessionId) => {
    flushBuffer(sessionId, sessionRefs, setSessions);
    finishIfDrained(sessionId, sessionRefs, setSessions);
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

  if (document.hidden) {
    // Hidden tabs get no animation frames, so the pump would stall while chunks
    // keep queueing. Reveal immediately instead — see flushBuffer.
    flushBufferFn(sessionId, sessionRefs, setSessions);
    finishIfDrained(sessionId, sessionRefs, setSessions);
  } else {
    ensurePump(sessionId, sessionRefs, setSessions);
  }
};

/**
 * Tear down a session's stream.
 *
 * @param {boolean} immediate - Reveal the remaining backlog at once instead of
 *   letting the pump type it out. Set this when the user asked the stream to
 *   STOP: continuing to type afterwards contradicts the button they just
 *   pressed, and because isStreaming is already false the composer is live, so
 *   they can send a new message while the old answer is still appearing.
 */
export const cleanupSSE = (
  sessionId,
  sessionRefs,
  setSessions,
  flushBufferFn,
  immediate = false
) => {
  const refs = getSessionRefs(sessionId, sessionRefs);

  if (refs.eventSource) {
    refs.eventSource.close();
    refs.eventSource = null;
  }

  // Cancel any pending setTimeout for tool messages
  if (refs.bufferTimeout) {
    clearTimeout(refs.bufferTimeout);
    refs.bufferTimeout = null;
  }

  // The network is done, but text may still be revealing. Mark it and let the
  // pump type out the tail, settling isStreaming when the queue drains. With a
  // hidden tab (no frames) or nothing left, reveal and settle right away.
  refs.netDone = true;

  if (immediate || document.hidden || refs.buffer.length === 0) {
    flushBufferFn(sessionId, sessionRefs, setSessions);
    finishIfDrained(sessionId, sessionRefs, setSessions);
    return;
  }

  ensurePump(sessionId, sessionRefs, setSessions);
};
