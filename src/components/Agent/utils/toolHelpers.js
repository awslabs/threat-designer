import { WEB_SEARCH_TOOLS, WEB_EXTRACT_TOOLS, THREAT_TOOLS, TOOL_CATEGORIES } from "./constants";

export const getToolCategory = (toolName) => {
  if (WEB_SEARCH_TOOLS.includes(toolName)) return TOOL_CATEGORIES.WEB_SEARCH;
  if (WEB_EXTRACT_TOOLS.includes(toolName)) return TOOL_CATEGORIES.WEB_EXTRACT;
  if (THREAT_TOOLS.includes(toolName)) return TOOL_CATEGORIES.THREAT;
  return TOOL_CATEGORIES.GENERIC;
};

export const formatToolName = (toolName) => {
  if (!toolName) return "Tool";

  let name = toolName
    .replace(/^aws___/, "")
    .replace(/^remote_/, "")
    .replace(/^tavily_/, "");

  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export const getThreatActionText = (toolName, count, isComplete) => {
  if (!isComplete) {
    if (toolName === "add_threats") return "Adding threats";
    if (toolName === "edit_threats") return "Editing threats";
    if (toolName === "delete_threats" || toolName === "remove_threat") return "Removing threats";
    return "Updating threats...";
  }

  const plural = count === 1 ? "threat" : "threats";

  if (toolName === "add_threats") return `Added ${count} ${plural}`;
  if (toolName === "edit_threats") return `Edited ${count} ${plural}`;
  if (toolName === "delete_threats" || toolName === "remove_threat")
    return `Removed ${count} ${plural}`;
  return `Updated ${count} ${plural}`;
};

export const getToolDisplayText = (toolName, resultCount, isComplete, error) => {
  if (error) return "Failed";

  const category = getToolCategory(toolName);
  const formattedName = formatToolName(toolName);

  if (!isComplete) {
    switch (category) {
      case TOOL_CATEGORIES.WEB_SEARCH:
        return "Searching";
      case TOOL_CATEGORIES.WEB_EXTRACT:
        return "Reading";
      case TOOL_CATEGORIES.THREAT:
        return getThreatActionText(toolName, 0, false);
      default:
        return `Running ${formattedName}`;
    }
  }

  switch (category) {
    case TOOL_CATEGORIES.WEB_SEARCH:
      return resultCount === 1 ? "1 result returned" : `${resultCount} results returned`;
    case TOOL_CATEGORIES.WEB_EXTRACT:
      return resultCount === 1 ? "Read from 1 source" : `Read from ${resultCount} sources`;
    case TOOL_CATEGORIES.THREAT:
      return getThreatActionText(toolName, resultCount, true);
    default:
      return `${formattedName} completed`;
  }
};
