import React, { useEffect, useCallback, useRef } from "react";
import { languageMap } from "./languageMap";
import { CodeView } from "@cloudscape-design/code-view";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import ToolLoading from "./ToolLoading";

export const CodeBlock = React.memo(({ code, language, width = "95%" }) => {
  const codeBlockRef = useRef(null);

  useEffect(() => {
    // Apply styles only to code blocks within this component's container
    // This runs once on mount and when the container changes
    if (!codeBlockRef.current) return;

    const applyStyles = () => {
      const codeBlocks = codeBlockRef.current?.querySelectorAll("pre.ace-cloud_editor");
      codeBlocks?.forEach((el) => {
        Object.assign(el.style, {
          overflowX: "scroll",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        });
      });
    };

    // Apply styles once after a short delay to ensure CodeView has rendered
    const timeoutId = setTimeout(applyStyles, 50);

    // Only observe this specific container, not the entire document
    const observer = new MutationObserver(applyStyles);
    observer.observe(codeBlockRef.current, { childList: true, subtree: true });

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [code]); // Re-run when code changes

  return (
    <div ref={codeBlockRef} className="code-block-container" style={{ width: width }}>
      <CodeView
        content={code}
        highlight={languageMap[language] || languageMap.zsh}
        actions={
          <CopyToClipboard
            copyButtonAriaLabel="Copy code"
            copyErrorText="Code failed to copy"
            copySuccessText="Code copied"
            textToCopy={code}
            variant="icon"
          />
        }
      />
    </div>
  );
});

export const RenderCode = React.memo(({ output, loading, error }) => {
  const renderCodeView = useCallback(
    (output) => (
      <CodeView
        content={JSON.stringify(output, null, 2)}
        highlight={languageMap.json}
        actions={
          <CopyToClipboard
            copyButtonAriaLabel="Copy code"
            copyErrorText="Code failed to copy"
            copySuccessText="Code copied"
            textToCopy={JSON.stringify(output, null, 2)}
            variant="icon"
          />
        }
      />
    ),
    []
  );

  if (loading) {
    return <ToolLoading text={"Querying logs"} />;
  }
  if (error) {
    return;
  }

  return (
    <div style={{ width: "100%" }}>
      {output && (
        <ExpandableSection headerText="Query result">
          <div style={{ overflowY: "auto", width: "100%", height: "500px" }}>
            {renderCodeView(output)}
          </div>
        </ExpandableSection>
      )}
    </div>
  );
});
