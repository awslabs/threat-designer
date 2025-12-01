import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { CustomTable } from "./../MarkDownRenderers";

const TextContent = ({ content }) => (
  <div className="markdown-content" style={{ marginTop: "1rem" }}>
    <Markdown
      children={content}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={rehypeSanitize}
      components={{
        table: CustomTable,
      }}
    />
  </div>
);

export default TextContent;
