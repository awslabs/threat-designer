import React, { useEffect, useMemo, useRef } from "react";
import MessageAvatar from "./MessageAvatar";
import ChatButtons from "./ChatButtons";
import ContentResolver from "./ContentResolver";

/**
 * Custom comparison function for ChatMessage memoization.
 * Prevents re-renders when message array reference changes but content is the same.
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

  // Compare message content deeply
  const prevMessage = prevProps.message;
  const nextMessage = nextProps.message;

  // If both are null/undefined, they're equal
  if (!prevMessage && !nextMessage) {
    return true;
  }

  // If one is null/undefined and the other isn't, they're different
  if (!prevMessage || !nextMessage) {
    return false;
  }

  // If lengths differ, they're different
  if (prevMessage.length !== nextMessage.length) {
    return false;
  }

  // Compare each message item
  for (let i = 0; i < prevMessage.length; i++) {
    const prev = prevMessage[i];
    const next = nextMessage[i];

    // Compare all relevant properties
    if (
      prev.type !== next.type ||
      prev.content !== next.content ||
      prev.id !== next.id ||
      prev.tool_name !== next.tool_name ||
      prev.tool_start !== next.tool_start ||
      prev.tool_update !== next.tool_update ||
      prev.error !== next.error ||
      prev.end !== next.end
    ) {
      return false;
    }
  }

  // Messages are equal, don't re-render
  return true;
};

const ChatMessage = React.memo(({ message, streaming, isLast, scroll, isParentFirstMount }) => {
  const [inputHeight] = React.useState(275);
  const isEnd = message?.[message.length - 1]?.end === true;
  const hasScrolled = useRef(false);
  const messageRef = useRef(null);

  useEffect(() => {
    if (isLast && !hasScrolled.current) {
      hasScrolled.current = true;
      const timeout = 60;

      setTimeout(() => {
        scroll();
      }, timeout);
    }
  }, [isLast, scroll]);

  const messageBlocks = useMemo(() => {
    if (!message || message.length === 0) return [];

    const blocks = [];
    let currentBlock = null;

    for (let i = 0; i < message.length; i++) {
      const item = message[i];

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

        // Find existing tool block with the same id (not just the last block)
        const existingBlockIndex = blocks.findIndex(
          (block) => block.type === "tool" && block.id === item.id
        );

        if (existingBlockIndex !== -1) {
          // Update existing tool block
          const existingBlock = blocks[existingBlockIndex];

          // Handle tool update case - just update input
          if (item.tool_update) {
            existingBlock.input = item.content;
            existingBlock.items.push(item);
          }
          // Handle tool completion case (tool_end)
          else if (!item.tool_start) {
            existingBlock.content = item.content;
            existingBlock.isComplete = true;
            existingBlock.error = item.error;
            existingBlock.items.push(item);
          }
          // Handle duplicate tool_start - mark previous as interrupted
          else if (item.tool_start) {
            existingBlock.isComplete = true;
            existingBlock.interrupted = true;

            // Create new block for the new tool_start
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
          // Create new tool block
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
        // Group consecutive items of same type
        if (currentBlock && currentBlock.type === item.type) {
          // Continue current block - just add content and item
          currentBlock.content += item.content;
          currentBlock.items.push(item);
        } else {
          // Mark previous block as complete before starting new block
          if (currentBlock) {
            currentBlock.isComplete = true;
          }

          // Start new block - always start as incomplete
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
  }, [message, isEnd]);

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
          {messageBlocks.map((block, index) => {
            const nextBlock = messageBlocks[index + 1];

            // Add spacing between all blocks when there's a next block
            const marginBottom = nextBlock ? "16px" : "2px";

            return (
              <div key={index} style={{ marginBottom }}>
                <ContentResolver
                  msg={block}
                  type={block.type}
                  isBlockComplete={block.isComplete}
                  isParentFirstMount={isParentFirstMount}
                />
              </div>
            );
          })}

          {isEnd && <ChatButtons content={message} messageRef={messageRef} />}
        </div>
      </div>
    </div>
  );
}, arePropsEqual);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
