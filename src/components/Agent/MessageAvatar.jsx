import React from "react";
import Avatar from "@cloudscape-design/chat-components/avatar";

function getInitials(firstName, surname) {
  return ((firstName?.[0] || "") + (surname?.[0] || "")).toUpperCase();
}

const MessageAvatar = ({ isUser, firstName, surname, loading }) => {
  return isUser ? (
    <Avatar
      ariaLabel={`${firstName} ${surname}`}
      initials={getInitials(firstName, surname)}
      tooltipText={`${firstName} ${surname}`}
    />
  ) : (
    <Avatar
      ariaLabel="Avatar of generative AI assistant"
      color="gen-ai"
      iconName="gen-ai"
      tooltipText="Generative AI assistant"
      loading={loading}
    />
  );
};

export default MessageAvatar;
