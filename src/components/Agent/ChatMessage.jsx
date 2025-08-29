import React, { useEffect, useMemo, useRef } from "react";
import MessageAvatar from "./MessageAvatar";
import ChatButtons from "./ChatButtons";
import ContentResolver from "./ContentResolver";

const ChatMessage = React.memo(({ message, streaming, isLast, scroll, isParentFirstMount }) => {
  const substract = "330px";
  const isEnd = message?.[message.length - 1]?.end === true;
  const hasScrolled = useRef(false);

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

        // Check if this completes an existing tool block
        const lastBlock = blocks[blocks.length - 1];
        const shouldUpdateExisting =
          lastBlock &&
          lastBlock.type === "tool" &&
          lastBlock.toolName === item.tool_name &&
          !lastBlock.isComplete && // Previous block was incomplete (tool_start: true)
          !item.tool_start; // Current item completes it (tool_start: false)

        if (shouldUpdateExisting) {
          // Update the existing tool block with completion data
          lastBlock.content = item.content;
          lastBlock.isComplete = true;
          lastBlock.error = item.error;
          lastBlock.items.push(item);
        } else {
          // Create new tool block
          blocks.push({
            type: "tool",
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
        height: isLast && `calc(100vh - ${substract})`,
      }}
    >
      <MessageAvatar isUser={false} loading={streaming && !isEnd} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            backgroundColor: "transparent",
            borderRadius: "8px",
            marginTop: "-14px",
          }}
        >
          {messageBlocks.map((block, index) => (
            <div key={index} style={{ marginBottom: "2px" }}>
              <ContentResolver
                msg={block}
                type={block.type}
                isBlockComplete={block.isComplete}
                isParentFirstMount={isParentFirstMount}
              />
            </div>
          ))}

          {isEnd && <ChatButtons content={message} />}
        </div>
      </div>
    </div>
  );
});

export default ChatMessage;
