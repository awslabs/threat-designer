import ChatTurn from "./ChatTurn";
import React, { memo } from "react";

const ChatContent = memo(({ chatTurns, streaming, user, scroll, isParentFirstMount }) => {
  return (
    <>
      {chatTurns.map((turn, index) => {
        const isLast = index === chatTurns.length - 1;
        return (
          <ChatTurn
            key={turn.id}
            userMessage={turn.userMessage}
            aiMessage={turn?.aiMessage}
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
