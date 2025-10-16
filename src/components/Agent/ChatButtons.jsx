import React, { useState, useCallback } from "react";
import ButtonGroup from "@cloudscape-design/components/button-group";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

const ChatButtons = React.memo(({ content }) => {
  const [feedback, setFeedback] = useState("");
  const handleCopy = useCallback(async (contentArray) => {
    try {
      // Filter for objects with type "text" and extract their text content
      const textContent = contentArray
        .filter((item) => item.type === "text")
        .map((item) => item.content)
        .join("\n");

      await navigator.clipboard.writeText(textContent);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }, []);

  const onItemClick = useCallback(
    ({ detail }) => {
      if (["like", "dislike"].includes(detail.id)) {
        setFeedback(detail.pressed ? detail.id : "");
      }
      if (detail.id === "copy") {
        handleCopy(content);
      }
    },
    [content, handleCopy]
  );

  if (content.length == 1 && content[0].text == "") {
    return;
  }

  return (
    <div style={{ marginTop: 30, marginBottom: 10 }}>
      <ButtonGroup
        onItemClick={onItemClick}
        ariaLabel="Chat actions"
        items={[
          {
            type: "group",
            text: "Vote",
            items: [
              {
                type: "icon-toggle-button",
                id: "like",
                iconName: "thumbs-up",
                pressedIconName: "thumbs-up-filled",
                text: "Like",
                pressed: feedback === "like",
              },
              {
                type: "icon-toggle-button",
                id: "dislike",
                iconName: "thumbs-down",
                pressedIconName: "thumbs-down-filled",
                text: "Dislike",
                pressed: feedback === "dislike",
              },
            ],
          },
          {
            type: "icon-button",
            id: "copy",
            iconName: "copy",
            text: "Copy",
            popoverFeedback: <StatusIndicator type="success">Message copied</StatusIndicator>,
          },
        ]}
        variant="icon"
      />
    </div>
  );
});

export default ChatButtons;
