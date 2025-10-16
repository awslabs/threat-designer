import React from "react";
import TextContent from "./TextContent";
import ThinkingContent from "./ThinkingContent";
import ToolContent from "./ToolContent";
import ThreatModelingTools from "./ThreatModelingTools";

const ContentResolver = React.memo(({ msg, type, isBlockComplete, isParentFirstMount }) => {
  switch (type) {
    case "tool":
      return (
        <ThreatModelingTools
          toolName={msg.toolName}
          content={msg.content}
          toolStart={!msg.isComplete}
          error={msg.error}
          isParentFirstMount={isParentFirstMount}
        />
      );
    case "text":
      return <TextContent content={msg.content} />;
    case "think":
      return (
        <ThinkingContent
          content={msg.content}
          thinkingLoading={!isBlockComplete}
          isParentFirstMount={isParentFirstMount}
        />
      );
    default:
      return null;
  }
});

export default ContentResolver;
