import React from "react";
import ToolContent from "./ToolContent";
import List from "@cloudscape-design/components/list";
import CodeView from "@cloudscape-design/code-view/code-view";

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

  try {
    return TOOL_CONFIG[toolName][state]; // Fixed: use bracket notation
  } catch {
    console.error(`Wrong parameters for toolName: ${toolName} and state: ${state}`);
    return "Unknown tool state";
  }
};

const ThreatModelingTools = React.memo(
  ({ toolName, content, toolStart, error, isParentFirstMount }) => {
    // console.log(content);
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

    // Determine current state based on props
    const getCurrentState = () => {
      if (error) return "error";
      if (toolStart) return "loading";
      if (parsedContent && !toolStart) return "success";
      return "pending";
    };

    const currentState = getCurrentState();
    // Update message count logic based on the structure of your parsed object
    const messageCount = parsedContent
      ? Array.isArray(parsedContent)
        ? parsedContent.length
        : Object.keys(parsedContent).length
      : 0;
    const displayText = toolConfig(toolName, currentState, messageCount);

    return (
      <ToolContent
        state={currentState}
        expanded={true}
        text={displayText}
        isParentFirstMount={isParentFirstMount}
        children={
          !error ? (
            <ListComponent threats={parsedContent} />
          ) : (
            <span style={{ fontSize: " 14px" }}>{parsedContent?.response || parsedContent}</span>
          )
        }
      />
    );
  }
);

export default ThreatModelingTools;
