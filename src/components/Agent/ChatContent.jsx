import ChatTurn from "./ChatTurn";
import React, { memo, useMemo } from "react";
import { WEB_SEARCH_TOOLS, WEB_EXTRACT_TOOLS } from "./utils/constants";

// Any tool whose result carries a `results[]` array of sources worth citing —
// both web search providers and the extract tool.
const WEB_RESULT_TOOLS = [...WEB_SEARCH_TOOLS, ...WEB_EXTRACT_TOOLS];

/**
 * Extract web search results from message blocks for citation resolution
 * Returns a map of searchIndex -> array of result URLs
 */
const extractWebSearchResults = (chatTurns) => {
  const searchResults = [];

  chatTurns.forEach((turn) => {
    const blocks = turn.messageBlocks || [];
    blocks.forEach((block) => {
      if (
        block.type === "tool" &&
        WEB_RESULT_TOOLS.includes(block.toolName) &&
        block.content &&
        block.isComplete
      ) {
        try {
          const parsed =
            typeof block.content === "string" ? JSON.parse(block.content) : block.content;
          if (parsed?.results && Array.isArray(parsed.results)) {
            searchResults.push(parsed.results.map((r) => r.url));
          }
        } catch {
          // Ignore parse errors
        }
      }
    });
  });

  return searchResults;
};

const ChatContent = memo(({ chatTurns, streaming, user, scroll, isParentFirstMount }) => {
  // Extract all web search results for citation resolution
  const webSearchResults = useMemo(() => extractWebSearchResults(chatTurns), [chatTurns]);

  return (
    <>
      {chatTurns.map((turn, index) => {
        const isLast = index === chatTurns.length - 1;
        return (
          <ChatTurn
            key={turn.id}
            userMessage={turn.userMessage}
            aiMessage={turn?.aiMessage}
            messageBlocks={turn?.messageBlocks}
            webSearchResults={webSearchResults}
            user={user}
            streaming={streaming && isLast}
            isLast={isLast}
            scroll={scroll}
            isParentFirstMount={isParentFirstMount}
          />
        );
      })}
    </>
  );
});

export default ChatContent;
