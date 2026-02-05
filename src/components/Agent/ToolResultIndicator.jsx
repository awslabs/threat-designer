import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { getToolCategory, getToolDisplayText } from "./utils/toolHelpers";
import { TOOL_CATEGORIES } from "./utils/constants";
import {
  parseWebResults,
  parseThreatResults,
  getResultCount,
  formatRawContent,
} from "./utils/parsers";
import SourceItem from "./SourceItem";
import ThreatItem from "./ThreatItem";

const ToolResultIndicator = ({ toolName, content, isComplete, error }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const category = getToolCategory(toolName);
  const isWebSearch = category === TOOL_CATEGORIES.WEB_SEARCH;
  const isWebExtract = category === TOOL_CATEGORIES.WEB_EXTRACT;
  const isThreat = category === TOOL_CATEGORIES.THREAT;
  const isGeneric = category === TOOL_CATEGORIES.GENERIC;

  const webResults = useMemo(() => {
    if (isWebSearch || isWebExtract) return parseWebResults(content);
    return [];
  }, [isWebSearch, isWebExtract, content]);

  const threatResults = useMemo(() => {
    if (isThreat) return parseThreatResults(content);
    return [];
  }, [isThreat, content]);

  const resultCount = useMemo(() => {
    if (isWebSearch || isWebExtract) return webResults.length || getResultCount(content);
    if (isThreat) return threatResults.length || getResultCount(content);
    return getResultCount(content);
  }, [isWebSearch, isWebExtract, isThreat, webResults, threatResults, content]);

  const rawContent = useMemo(() => {
    if (isGeneric && content) return formatRawContent(content);
    return null;
  }, [isGeneric, content]);

  const displayText = getToolDisplayText(toolName, resultCount, isComplete, error);

  const hasExpandableContent =
    isComplete &&
    !error &&
    ((isWebSearch && webResults.length > 0) ||
      (isWebExtract && webResults.length > 0) ||
      (isThreat && threatResults.length > 0) ||
      (isGeneric && rawContent));

  const handleToggle = (e) => {
    e.stopPropagation();
    if (hasExpandableContent) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className="tool-result-content">
      <div
        className={`tool-result-header ${hasExpandableContent ? "clickable" : ""} ${!isComplete ? "loading" : ""}`}
        onClick={handleToggle}
      >
        <span className="tool-result-text">{displayText}</span>
        {hasExpandableContent && (
          <ChevronDown size={14} className={`tool-result-chevron ${isExpanded ? "rotated" : ""}`} />
        )}
      </div>

      {isExpanded && (isWebSearch || isWebExtract) && webResults.length > 0 && (
        <div className="tool-result-sources">
          {webResults.map((item) => (
            <SourceItem key={item.id} title={item.title} url={item.url} favicon={item.favicon} />
          ))}
        </div>
      )}

      {isExpanded && isThreat && threatResults.length > 0 && (
        <div className="tool-result-sources">
          {threatResults.map((threat) => (
            <ThreatItem key={threat.id} name={threat.name} />
          ))}
        </div>
      )}

      {isExpanded && isGeneric && rawContent && (
        <div className="tool-result-raw">
          <div className="tool-result-raw-header">Response</div>
          <div className="tool-result-raw-scroll">
            <pre className="tool-result-raw-content">{rawContent}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolResultIndicator;
