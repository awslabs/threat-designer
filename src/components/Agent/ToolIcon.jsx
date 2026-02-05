import { Globe, FileText, Shield, Wrench } from "lucide-react";
import { getToolCategory } from "./utils/toolHelpers";
import { TOOL_CATEGORIES } from "./utils/constants";

const ToolIcon = ({ toolName, size = 16, className = "timeline-icon tool-icon" }) => {
  const category = getToolCategory(toolName);
  const iconProps = { size, className };

  switch (category) {
    case TOOL_CATEGORIES.WEB_SEARCH:
      return <Globe {...iconProps} />;
    case TOOL_CATEGORIES.WEB_EXTRACT:
      return <FileText {...iconProps} />;
    case TOOL_CATEGORIES.THREAT:
      return <Shield {...iconProps} />;
    default:
      return <Wrench {...iconProps} />;
  }
};

export default ToolIcon;
