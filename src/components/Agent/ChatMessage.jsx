import React, { useEffect, useRef, useMemo } from "react";
import MessageAvatar from "./MessageAvatar";
import ChatButtons from "./ChatButtons";
import ContentResolver from "./ContentResolver";
import WebSearchToolGroup from "./WebSearchToolGroup";

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
    const [inputHeight] = React.useState(270);
    const isEnd = message?.[message.length - 1]?.end === true;
    const hasScrolled = useRef(false);
    const messageRef = useRef(null);

    // Use pre-computed blocks from buffering layer, fallback to empty array
    const blocks = messageBlocks || [];

    // Group consecutive web search tools into single UI elements
    // Only group same tool types together (search with search, extract with extract)
    const groupedBlocks = useMemo(() => {
      const result = [];
      let currentSearchGroup = [];
      let currentGroupType = null; // 'search' or 'extract'

      const getToolType = (block) => {
        if (block.type !== "tool") return null;
        if (block.toolName === "tavily_search") return "search";
        if (block.toolName === "tavily_extract") return "extract";
        return null;
      };

      const flushSearchGroup = (followedByNonSearch = false) => {
        if (currentSearchGroup.length > 0) {
          result.push({
            type: "search_group",
            toolType: currentGroupType, // 'search' or 'extract'
            blocks: [...currentSearchGroup],
            id: `search_group_${currentSearchGroup[0].id || result.length}`,
            // Group is complete if followed by non-search block OR stream ended
            isGroupComplete: followedByNonSearch || isEnd,
          });
          currentSearchGroup = [];
          currentGroupType = null;
        }
      };

      blocks.forEach((block) => {
        const toolType = getToolType(block);
        
        if (toolType) {
          // If switching tool types, flush the current group first
          if (currentGroupType && currentGroupType !== toolType) {
            flushSearchGroup(true);
          }
          currentGroupType = toolType;
          currentSearchGroup.push(block);
        } else {
          // Flush with followedByNonSearch = true since we hit a non-search block
          flushSearchGroup(true);
          result.push(block);
        }
      });

      // Trailing search tools - only complete if stream ended
      flushSearchGroup(false);

      return result;
    }, [blocks, isEnd]);

    useEffect(() => {
      if (isLast && !hasScrolled.current) {
        hasScrolled.current = true;
        // Immediate scroll without delay
        scroll();
      }
    }, [isLast, scroll]);

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

              // Handle grouped search tools
              if (block.type === "search_group") {
                return (
                  <div key={block.id} style={{ marginBottom }}>
                    <WebSearchToolGroup 
                      blocks={block.blocks} 
                      isGroupComplete={block.isGroupComplete}
                      toolType={block.toolType}
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
