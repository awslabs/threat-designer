import React from "react";
import MessageAvatar from "./MessageAvatar";
import ContentResolver from "./ContentResolver";
import { colorBackgroundChatBubbleIncoming } from "@cloudscape-design/design-tokens";

const UserChatMessage = React.memo(({ message, user }) => {
  const normalizedContent = React.useMemo(() => {
    if (typeof message === "string") {
      return { type: "text", content: message, isComplete: true };
    }
    // If it's already an array, extract the text
    if (Array.isArray(message) && message.length > 0) {
      const textContent = message
        .filter((item) => item.type === "text")
        .map((item) => item.text || item.content)
        .join("");
      return { type: "text", content: textContent, isComplete: true };
    }
    // If it's already a formatted object
    if (message && typeof message === "object") {
      return {
        type: "text",
        content: message.content || message.text || "",
        isComplete: true,
      };
    }
    return { type: "text", content: "", isComplete: true };
  }, [message]);

  return (
    <div
      className="message-item"
      style={{
        display: "flex",
        alignItems: "flex-start",
        columnGap: "8px",
        width: "100%",
        marginBottom: "50px",
      }}
    >
      <MessageAvatar
        isUser={true}
        firstName={user.given_name}
        surname={user.family_name}
        loading={false}
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          marginTop: "-14px",
        }}
      >
        <div
          style={{
            backgroundColor: colorBackgroundChatBubbleIncoming,
            padding: "1px 12px 1px 12px",
            borderRadius: "8px",
            width: "100%",
          }}
        >
          <ContentResolver
            msg={normalizedContent}
            type="text"
            thinkingLoading={false}
            isBlockComplete={true}
          />
        </div>
      </div>
    </div>
  );
});

export default UserChatMessage;
