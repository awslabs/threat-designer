import React, { useState, useEffect, useRef } from "react";
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
const StackedFavicons = ({ urls, maxShow = 5 }) => {
  const displayUrls = urls.slice(0, maxShow);

  return (
    <div className="stacked-favicons">
      {displayUrls.map((url, index) => (
        <div key={index} className="stacked-favicon" style={{ zIndex: maxShow - index }}>
          <Favicon url={url} size={18} />
        </div>
      ))}
    </div>
  );
};

/**
 * Single search result item (for tavily_search)
 */
const SearchResultItem = ({ result }) => {
  return (
    <a href={result.url} target="_blank" rel="noopener noreferrer" className="search-result-item">
      <div className="search-result-favicon">
        <Favicon url={result.url} size={16} />
      </div>
      <div className="search-result-content">
        <div className="search-result-title">{result.title}</div>
        <div className="search-result-snippet">{result.content}</div>
      </div>
      <ExternalLink size={12} className="search-result-external" />
    </a>
  );
};

/**
 * Single extract result item (for tavily_extract) - shows only URL/title, no content
 */
const ExtractResultItem = ({ result }) => {
  // Extract domain from URL for display
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
      className="search-result-item extract-item"
    >
      <div className="search-result-favicon">
        <Favicon url={result.url} size={16} />
      </div>
      <div className="search-result-content">
        <div className="search-result-title">{displayUrl}</div>
      </div>
      <ExternalLink size={12} className="search-result-external" />
    </a>
  );
};

/**
 * Web Search Tool component - handles both tavily_search and tavily_extract
 */
const WebSearchTool = ({ content, isLoading, error, toolType = "search" }) => {
  const { effectiveTheme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [shouldExpandWidth, setShouldExpandWidth] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [prevLoading, setPrevLoading] = useState(true);
  const containerRef = useRef(null);

  const isExtract = toolType === "extract";

  // Parse content
  const parsedContent = React.useMemo(() => {
    if (!content) return null;
    if (typeof content !== "string") return content;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  // Get results based on tool type
  const results = React.useMemo(() => {
    if (!parsedContent) return [];
    if (isExtract) {
      return parsedContent?.results || [];
    }
    return parsedContent?.results || [];
  }, [parsedContent, isExtract]);

  const hasResults = results.length > 0;
  const isComplete = !isLoading && hasResults;

  // Handle state transitions - same pattern as ToolContent
  useEffect(() => {
    if (!isLoading && prevLoading && hasResults) {
      // Force a reflow to ensure transition triggers
      if (containerRef.current) {
        containerRef.current.offsetHeight; // Force reflow
      }

      // Delay the width expansion to trigger animation
      requestAnimationFrame(() => {
        setShouldExpandWidth(true);

        // Show extras (favicons, button) after width starts expanding
        setTimeout(() => {
          setShowExtras(true);
        }, 200);
      });
    } else if (isLoading) {
      // Reset everything when going back to loading
      setShouldExpandWidth(false);
      setShowExtras(false);
      setIsExpanded(false);
      setShowContent(false);
    }

    setPrevLoading(isLoading);
  }, [isLoading, prevLoading, hasResults]);

  // Get URLs for stacked favicons
  const urls = results.map((r) => r.url);

  // Get status text based on tool type and state
  const getStatusText = () => {
    if (isLoading) {
      return isExtract ? "Reading..." : "Searching web...";
    }
    if (error) {
      return isExtract ? "Read failed" : "Search failed";
    }
    if (isExtract) {
      return `Read from ${results.length} source${results.length !== 1 ? "s" : ""}`;
    }
    return "Search completed";
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
          {isLoading ? (
            <StatusIndicator type="loading" />
          ) : error ? (
            <StatusIndicator type="error" />
          ) : (
            <StatusIndicator type="success" />
          )}
          <span className="web-search-text">{getStatusText()}</span>

          {showExtras && isComplete && (
            <div className="web-search-favicons">
              <StackedFavicons urls={urls} />
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
            {results.map((result, index) =>
              isExtract ? (
                <ExtractResultItem key={index} result={result} />
              ) : (
                <SearchResultItem key={index} result={result} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WebSearchTool;
