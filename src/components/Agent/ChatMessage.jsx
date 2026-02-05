import React, { useEffect, useRef, useMemo } from "react";
import MessageAvatar from "./MessageAvatar";
import ChatButtons from "./ChatButtons";
import ContentResolver from "./ContentResolver";
import UnifiedThinkingBlock from "./UnifiedThinkingBlock";

/**
 * Custom comparison function for ChatMessage memoization.
 * Compares pre-computed messageBlocks instead of raw messages.
 *
 * @param {Object} prevProps - Previous props
 * @param {Object} nextProps - Next props
 * @returns {boolean} - True if props are equal (should NOT re-render)
 */
const arePropsEqual = (prevProps, nextProps) => {
  // Always re-render if streaming state changes
  if (prevProps.streaming !== nextProps.streaming) {
    return false;
  }

  // Always re-render if isLast changes
  if (prevProps.isLast !== nextProps.isLast) {
    return false;
  }

  // Always re-render if isParentFirstMount changes
  if (prevProps.isParentFirstMount !== nextProps.isParentFirstMount) {
    return false;
  }

  // Re-render if webSearchResults changes (for citation resolution)
  if (prevProps.webSearchResults !== nextProps.webSearchResults) {
    // Deep compare arrays
    const prev = prevProps.webSearchResults || [];
    const next = nextProps.webSearchResults || [];
    if (prev.length !== next.length) return false;
  }

  // Compare pre-computed messageBlocks
  const prevBlocks = prevProps.messageBlocks;
  const nextBlocks = nextProps.messageBlocks;

  // If both are null/undefined/empty, they're equal
  if (!prevBlocks?.length && !nextBlocks?.length) {
    return true;
  }

  // If one is empty and the other isn't, they're different
  if (!prevBlocks?.length || !nextBlocks?.length) {
    return false;
  }

  // If lengths differ, they're different
  if (prevBlocks.length !== nextBlocks.length) {
    return false;
  }

  // Compare each block
  for (let i = 0; i < prevBlocks.length; i++) {
    const prev = prevBlocks[i];
    const next = nextBlocks[i];

    if (
      prev.type !== next.type ||
      prev.content !== next.content ||
      prev.id !== next.id ||
      prev.toolName !== next.toolName ||
      prev.isComplete !== next.isComplete ||
      prev.error !== next.error ||
      prev.interrupted !== next.interrupted ||
      prev.input !== next.input
    ) {
      return false;
    }
  }

  return true;
};

const ChatMessage = React.memo(
  ({ message, messageBlocks, webSearchResults, streaming, isLast, scroll, isParentFirstMount }) => {
    const [inputHeight] = React.useState(260);
    const isEnd = message?.[message.length - 1]?.end === true;
    const hasScrolled = useRef(false);
    const messageRef = useRef(null);

    // Use pre-computed blocks from buffering layer, fallback to empty array
    const blocks = messageBlocks || [];

    // Group all think and tool blocks (including web search) into unified groups
    // The unified block ends only when a text block appears
    const groupedBlocks = useMemo(() => {
      const result = [];
      let currentUnifiedGroup = null; // For think + tool grouping

      const flushUnifiedGroup = (markComplete = false) => {
        if (currentUnifiedGroup) {
          result.push({
            ...currentUnifiedGroup,
            isGroupComplete: markComplete || isEnd,
          });
          currentUnifiedGroup = null;
        }
      };

      blocks.forEach((block) => {
        // Handle think blocks - add to existing unified group or start new one
        if (block.type === "think") {
          if (currentUnifiedGroup) {
            // Add to existing unified group - preserve order in contentBlocks
            currentUnifiedGroup.contentBlocks.push(block);
          } else {
            // Start a new unified group
            currentUnifiedGroup = {
              type: "unified_thinking",
              contentBlocks: [block], // Array preserving order of think/tool blocks
              id: `unified_${block.id || result.length}`,
              isGroupComplete: false,
              thinkingStartTime: Date.now(),
            };
          }
          return;
        }

        // Handle ALL tool blocks (including web search tools)
        if (block.type === "tool") {
          if (currentUnifiedGroup) {
            // Add to existing unified group - preserve order in contentBlocks
            currentUnifiedGroup.contentBlocks.push(block);
          } else {
            // Tool without preceding think - start a new unified group
            currentUnifiedGroup = {
              type: "unified_thinking",
              contentBlocks: [block], // Array preserving order
              id: `unified_${block.id || result.length}`,
              isGroupComplete: false,
              thinkingStartTime: Date.now(),
            };
          }
          return;
        }

        // Handle text blocks - flush all groups (this ends the unified block)
        if (block.type === "text") {
          flushUnifiedGroup(true);
          result.push(block);
          return;
        }

        // Default: flush groups and add block as-is
        flushUnifiedGroup(true);
        result.push(block);
      });

      // Flush remaining groups - only complete if stream ended
      flushUnifiedGroup(false);

      return result;
    }, [blocks, isEnd]);

    useEffect(() => {
      if (isLast && !hasScrolled.current) {
        hasScrolled.current = true;
        // Use instant scroll on initial page load (Requirement 2.3)
        // Use smooth scroll for new messages added after initial mount (Requirement 1.1)
        const useSmooth = !isParentFirstMount;
        scroll(useSmooth);
      }
    }, [isLast, scroll, isParentFirstMount]);

    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          columnGap: "8px",
          width: "100%",
          marginBottom: "50px",
          height: isLast && `calc(100vh - ${inputHeight}px)`,
        }}
      >
        <MessageAvatar isUser={false} loading={streaming && !isEnd} />

        <div
          ref={messageRef}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              backgroundColor: "",
            }}
          >
            {groupedBlocks.map((block, index) => {
              const nextBlock = groupedBlocks[index + 1];

              // Add spacing between all blocks when there's a next block
              const marginBottom = nextBlock ? "16px" : "2px";

              // Handle unified thinking + tools groups
              if (block.type === "unified_thinking") {
                return (
                  <div key={block.id} style={{ marginBottom }}>
                    <UnifiedThinkingBlock
                      contentBlocks={block.contentBlocks}
                      isGroupComplete={block.isGroupComplete}
                      thinkingStartTime={block.thinkingStartTime}
                      isParentFirstMount={isParentFirstMount}
                    />
                  </div>
                );
              }

              return (
                <div key={index} style={{ marginBottom }}>
                  <ContentResolver
                    msg={block}
                    type={block.type}
                    isBlockComplete={block.isComplete}
                    isParentFirstMount={isParentFirstMount}
                    webSearchResults={webSearchResults}
                  />
                </div>
              );
            })}

            {isEnd && <ChatButtons content={message} messageRef={messageRef} />}
          </div>
        </div>
      </div>
    );
  },
  arePropsEqual
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
