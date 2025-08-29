import React, { useMemo } from "react";
import ChatMessage from "./ChatMessage";
import UserChatMessage from "./UserChatMessage";

const ChatTurn = React.memo(function ChatTurn({
  userMessage,
  aiMessage,
  user,
  isLast,
  scroll,
  streaming = false,
  isParentFirstMount,
}) {
  return (
    <div className="chat-turn">
      <UserChatMessage message={userMessage} user={user} isUser={true} />
      <ChatMessage
        message={aiMessage}
        user={user}
        isUser={false}
        streaming={streaming}
        isLast={isLast}
        scroll={scroll}
        isParentFirstMount={isParentFirstMount}
      />
    </div>
  );
});

export default ChatTurn;
