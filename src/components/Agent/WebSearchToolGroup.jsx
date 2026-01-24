import { useState, useEffect, useRef, useMemo } from "react";
import { ExternalLink, Globe } from "lucide-react";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useTheme } from "../ThemeContext";
import "./WebSearchTool.css";

/**
 * Get favicon URL for a given website URL
 */
const getFaviconUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch {
    return null;
  }
};

/**
 * Favicon component with fallback to Globe icon
 */
const Favicon = ({ url, size = 16, className = "" }) => {
  const [hasError, setHasError] = useState(false);
  const faviconUrl = getFaviconUrl(url);

  if (hasError || !faviconUrl) {
    return <Globe size={size} className={className} />;
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      className={className}
      onError={() => setHasError(true)}
      style={{ borderRadius: 2 }}
    />
  );
};

/**
 * Stacked favicons component showing overlapping icons
 */
const StackedFavicons = ({ urls }) => {
  return (
    <div className="stacked-favicons">
      {urls.map((url, index) => (
        <div key={index} className="stacked-favicon" style={{ zIndex: urls.length - index }}>
          <Favicon url={url} size={18} />
        </div>
      ))}
    </div>
  );
};

/**
 * Single search result item
 */
const SearchResultItem = ({ result }) => {
  let displayUrl = result.url;
  try {
    const urlObj = new URL(result.url);
    displayUrl = urlObj.hostname + urlObj.pathname;
  } catch {
    // Keep original URL if parsing fails
  }

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className="search-result-item"
    >
      <div className="search-result-favicon">
        <Favicon url={result.url} size={16} />
      </div>
      <div className="search-result-content">
        <div className="search-result-title">{result.title || displayUrl}</div>
        {result.content && <div className="search-result-snippet">{result.content}</div>}
      </div>
      <ExternalLink size={12} className="search-result-external" />
    </a>
  );
};

/**
 * WebSearchToolGroup - Groups multiple consecutive search tools into one UI element
 * isGroupComplete is determined by parent: true when followed by non-search block or stream ended
 * toolType is 'search' or 'extract' - groups are homogeneous (same type only)
 */
const WebSearchToolGroup = ({ blocks, isGroupComplete, toolType }) => {
  const { effectiveTheme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [shouldExpandWidth, setShouldExpandWidth] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const containerRef = useRef(null);
  const wasCompleteRef = useRef(false);

  const isExtract = toolType === "extract";

  // Parse and combine all results from all blocks
  const { allResults, hasAnyError } = useMemo(() => {
    const results = [];
    let anyError = false;

    blocks.forEach((block) => {
      if (block.error) {
        anyError = true;
      }

      if (block.content) {
        try {
          const parsed =
            typeof block.content === "string" ? JSON.parse(block.content) : block.content;
          if (parsed?.results && Array.isArray(parsed.results)) {
            results.push(...parsed.results);
          }
        } catch {
          // Ignore parse errors
        }
      }
    });

    return {
      allResults: results,
      hasAnyError: anyError,
    };
  }, [blocks]);

  const hasResults = allResults.length > 0;
  const isComplete = isGroupComplete && hasResults;

  // Handle transition when group becomes complete
  useEffect(() => {
    if (isGroupComplete && !wasCompleteRef.current && hasResults) {
      wasCompleteRef.current = true;
      
      requestAnimationFrame(() => {
        setShouldExpandWidth(true);
        setTimeout(() => {
          setShowExtras(true);
        }, 200);
      });
    }
  }, [isGroupComplete, hasResults]);

  // Get unique URLs by hostname for stacked favicons (one per domain)
  const uniqueDomainUrls = useMemo(() => {
    const seenHostnames = new Set();
    return allResults
      .map((r) => r.url)
      .filter((url) => {
        try {
          const hostname = new URL(url).hostname;
          if (seenHostnames.has(hostname)) return false;
          seenHostnames.add(hostname);
          return true;
        } catch {
          return false;
        }
      });
  }, [allResults]);

  // Get status text based on tool type
  const getStatusText = () => {
    if (!isGroupComplete) {
      return isExtract ? "Reading from sources" : "Searching the web";
    }
    if (hasAnyError && !hasResults) {
      return isExtract ? "Reading failed" : "Search failed";
    }
    const sourceCount = allResults.length;
    return isExtract 
      ? `Read ${sourceCount} source${sourceCount !== 1 ? "s" : ""}`
      : `Searched ${sourceCount} source${sourceCount !== 1 ? "s" : ""}`;
  };

  const handleToggle = () => {
    if (!isComplete) return;

    if (!isExpanded) {
      setIsExpanded(true);
      requestAnimationFrame(() => {
        setShowContent(true);
      });
    } else {
      setShowContent(false);
      setTimeout(() => setIsExpanded(false), 300);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`web-search-tool ${effectiveTheme} ${isExpanded ? "expanded" : ""} ${shouldExpandWidth ? "width-expanded" : ""}`}
    >
      <div className={`web-search-header ${isComplete ? "clickable" : ""}`} onClick={handleToggle}>
        <div className="web-search-status">
          {!isGroupComplete ? (
            <StatusIndicator type="loading" />
          ) : hasAnyError && !hasResults ? (
            <StatusIndicator type="error" />
          ) : (
            <StatusIndicator type="success" />
          )}
          <span className="web-search-text">{getStatusText()}</span>

          {showExtras && isComplete && (
            <div className="web-search-favicons">
              <StackedFavicons urls={uniqueDomainUrls} />
            </div>
          )}
        </div>

        {showExtras && isComplete && (
          <button
            className="web-search-expand-button"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              className={`web-search-arrow-icon ${showContent ? "rotated" : ""}`}
              width="20"
              height="20"
              viewBox="0 0 20 20"
            >
              <path
                d="M6 8l4 4 4-4"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {isExpanded && hasResults && (
        <div className={`web-search-results ${showContent ? "show" : ""}`}>
          <div className="web-search-results-inner">
            {allResults.map((result, index) => (
              <SearchResultItem key={index} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WebSearchToolGroup;
