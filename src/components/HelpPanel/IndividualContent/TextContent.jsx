import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { CustomTable } from "./../MarkDownRenderers";

const TextContent = ({ content }) => (
  <Markdown
    children={content}
    remarkPlugins={[remarkGfm]}
    rehypePlugins={rehypeSanitize}
    components={{
      table: CustomTable,
    }}
  />
);

export default TextContent;
