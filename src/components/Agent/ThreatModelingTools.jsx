import React from "react";
import ToolContent from "./ToolContent";
import List from "@cloudscape-design/components/list";
import { CodeBlock } from "./CodeBlock";

const ListComponent = ({ threats }) => {
  if (!threats || threats.length === 0) {
    return <div>No threats available</div>;
  }

  return (
    <List
      ariaLabel="Threat list with review actions"
      items={threats}
      renderItem={(item) => ({
        id: item.name,
        content: item.name,
      })}
      sortable
      sortDisabled
    />
  );
};

const toolConfig = (toolName, state, msg) => {
  const TOOL_CONFIG = {
    add_threats: {
      loading: "Adding new threats to the catalog",
      error: "Failed to add threats",
      success: `Added ${msg} threats`,
      pending: "Ready to add threats",
    },
    edit_threats: {
      loading: "Updating threat catalog",
      error: "Failed to update threat catalog",
      success: `Updated ${msg} threats`,
      pending: "Ready to update threats",
    },
    delete_threats: {
      loading: "Deleting threats from catalog",
      error: "Failed to delete threats",
      success: `Deleted ${msg} threats`,
      pending: "Ready to delete threats",
    },
  };

  // Check if toolName exists in TOOL_CONFIG
  if (TOOL_CONFIG[toolName]) {
    try {
      return TOOL_CONFIG[toolName][state];
    } catch {
      console.error(`Wrong state for toolName: ${toolName} and state: ${state}`);
      return "Unknown tool state";
    }
  }

  // Generic handler for unknown tools
  const GENERIC_CONFIG = {
    loading: `Calling tool: ${toolName}`,
    error: `Failed to call tool: ${toolName}`,
    success: `Tool call: ${toolName} succeeded`,
    pending: `Ready to call tool: ${toolName}`,
  };

  return GENERIC_CONFIG[state] || "Unknown tool state";
};

const ThreatModelingTools = React.memo(
  ({ toolName, content, toolStart, error, isParentFirstMount }) => {
    // Check if this is a known threat modeling tool
    const isKnownTool = ["add_threats", "edit_threats", "delete_threats"].includes(toolName);

    // Parse content from JSON string to object
    const getParsedContent = () => {
      if (!content) return null;

      if (typeof content !== "string") return content;

      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    };

    const parsedContent = getParsedContent();

    // Check if there's an error in the content for generic tools
    const hasContentError = () => {
      return !isKnownTool && parsedContent?.error;
    };

    // Extract the threats array from the response (only for known tools)
    const getThreatsArray = () => {
      if (!isKnownTool || !parsedContent) return null;

      // If parsedContent has a 'response' property that's an array, use that
      if (parsedContent.response && Array.isArray(parsedContent.response)) {
        return parsedContent.response;
      }

      // If parsedContent is already an array, use it directly
      if (Array.isArray(parsedContent)) {
        return parsedContent;
      }

      return null;
    };

    const threats = getThreatsArray();

    // Determine current state based on props
    const getCurrentState = () => {
      if (error || hasContentError()) return "error";
      if (toolStart) return "loading";
      if ((isKnownTool && threats) || (!isKnownTool && parsedContent && !hasContentError())) {
        return "success";
      }
      return "pending";
    };

    const currentState = getCurrentState();

    // Update message count for known tools, or use empty string for generic tools
    const messageCount = isKnownTool && threats ? threats.length : "";
    const displayText = toolConfig(toolName, currentState, messageCount);

    // Format content for CodeBlock (for unknown tools)
    const getCodeBlockContent = () => {
      if (typeof parsedContent === "string") {
        return parsedContent;
      }
      return JSON.stringify(parsedContent, null, 2);
    };

    // Render appropriate child component based on tool type
    const renderContent = () => {
      // Handle errors for known threat modeling tools
      if (isKnownTool && error) {
        return <span style={{ fontSize: "14px" }}>{parsedContent?.response || parsedContent}</span>;
      }

      // Handle content for known threat modeling tools
      if (isKnownTool && !error) {
        return <ListComponent threats={threats} />;
      }

      // For unknown tools, always render JSON in CodeBlock (including errors)
      return <CodeBlock code={getCodeBlockContent()} language={"json"} width={"100%"} />;
    };

    return (
      <ToolContent
        state={currentState}
        expanded={true}
        text={displayText}
        isParentFirstMount={isParentFirstMount}
        children={renderContent()}
      />
    );
  }
);

export default ThreatModelingTools;
