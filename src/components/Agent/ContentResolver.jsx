import React from "react";
import TextContent from "./TextContent";

const ContentResolver = React.memo(({ msg, type, webSearchResults, disableMarkdown }) => {
  switch (type) {
    case "text":
      return (
        <TextContent
          content={msg.content}
          webSearchResults={webSearchResults}
          disableMarkdown={disableMarkdown}
        />
      );
    default:
      return null;
  }
});

export default ContentResolver;
