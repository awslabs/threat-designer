import { memo } from "react";
import { CodeBlock } from "./CodeBlock";
import "./styles.css";
import { useTheme } from "../ThemeContext";

/**
 * Memoized code renderer for markdown code blocks
 * Prevents re-renders during token streaming when code content hasn't changed
 * Distinguishes between inline code (single backticks) and code blocks (triple backticks)
 */
export const CodeRenderer = memo(
  ({ children, className = "", inline, node }) => {
    const code = String(children).replace(/\n$/, "");
    
    // Check if this is inline code (no language class and inline prop or no newlines in short code)
    const isInline = inline || (!className && code.length < 100 && !code.includes('\n'));
    
    if (isInline) {
      // Render inline code with simple styling
      return <code className="inline-code">{code}</code>;
    }
    
    // Block code - use CodeBlock component
    const match = /language-(\w+)/.exec(className);
    const language = match ? match[1] : "default";
    return <CodeBlock code={code} language={language} />;
  },
  (prevProps, nextProps) => {
    // Only re-render if children or className changes
    return (
      prevProps.children === nextProps.children &&
      prevProps.className === nextProps.className &&
      prevProps.inline === nextProps.inline
    );
  }
);

/**
 * Memoized table renderer for markdown tables
 */
export const CustomTable = memo(
  ({ node, ...props }) => {
    const { effectiveTheme } = useTheme();
    return <table className={`custom-table ${effectiveTheme}`} {...props} />;
  }
);
