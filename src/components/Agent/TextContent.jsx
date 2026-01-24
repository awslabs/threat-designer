import { useState, useRef, useMemo, memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { CodeRenderer, CustomTable } from "./MarkDownRenderers";
import { ExternalLink, Globe } from "lucide-react";
import "./CitationStyles.css";

/**
 * Custom sanitize schema that extends the default to allow <cite> tags with data-urls attribute
 * and <span> tags with class attribute for loading placeholders.
 * This provides XSS protection while preserving citation functionality.
 * Note: In hast (the AST format), data-urls becomes dataUrls (camelCase).
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "cite", "span"],
  attributes: {
    ...defaultSchema.attributes,
    cite: ["dataUrls"],
    span: [...(defaultSchema.attributes?.span || []), "className", "class"],
  },
};

/**
 * Get favicon URL for a given website URL using Google's favicon service
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
 * Truncate text to a max length with ellipsis
 */
const truncateText = (text, maxLength = 10) => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "…";
};

/**
 * Extract domain name from URL
 */
const extractDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Custom hover card component with smart positioning
 * Memoized to preserve hover state during parent re-renders
 */
const HoverCard = memo(
  ({ trigger, children, urlKey }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ top: true, left: false });
    const timeoutRef = useRef(null);
    const triggerRef = useRef(null);
    const contentRef = useRef(null);

    const calculatePosition = () => {
      if (!triggerRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // Check if there's enough space above (need ~200px for popover)
      const spaceAbove = triggerRect.top;
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const showOnTop = spaceAbove > 150 || spaceAbove > spaceBelow;

      // Check if popover would overflow right edge
      const spaceRight = viewportWidth - triggerRect.left;
      const alignLeft = spaceRight < 280;

      setPosition({ top: showOnTop, left: alignLeft });
    };

    const handleMouseEnter = () => {
      clearTimeout(timeoutRef.current);
      calculatePosition();
      setIsOpen(true);
    };

    const handleMouseLeave = () => {
      timeoutRef.current = setTimeout(() => {
        setIsOpen(false);
      }, 150);
    };

    const positionClass = `hover-card-content ${position.top ? "position-top" : "position-bottom"} ${position.left ? "align-right" : "align-left"}`;

    return (
      <span className="hover-card-container">
        <span ref={triggerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          {trigger}
        </span>
        {isOpen && (
          <div
            ref={contentRef}
            className={positionClass}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {children}
          </div>
        )}
      </span>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if urlKey changes (content identity)
    return prevProps.urlKey === nextProps.urlKey;
  }
);

/**
 * Favicon component with fallback to Globe icon
 * Memoized to prevent unnecessary re-renders
 */
const Favicon = memo(({ url, size = 13, className }) => {
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
});

/**
 * Web Search Citation component for URLs
 * Memoized to prevent re-renders during token streaming
 */
const WebSearchCitation = memo(
  ({ urls }) => {
    if (!urls || urls.length === 0) return null;

    const firstDomain = extractDomain(urls[0]);
    const truncatedDomain = truncateText(firstDomain, 12);
    const extraCount = urls.length - 1;

    // Create a stable key from URLs for memoization
    const urlKey = urls.join(",");

    return (
      <HoverCard
        urlKey={urlKey}
        trigger={
          <span className="citation-label web-citation-label">
            <Globe size={11} />
            <span className="citation-label-text">
              {truncatedDomain}
              {extraCount > 0 && <span className="citation-extra-count">+{extraCount}</span>}
            </span>
          </span>
        }
      >
        <div className="citation-popover">
          <div className="citation-popover-header">Sources · {urls.length}</div>
          <div className="citation-popover-list">
            {urls.map((url, index) => {
              const domain = extractDomain(url);
              return (
                <a
                  key={index}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="citation-link-item"
                >
                  <Favicon url={url} size={14} className="citation-link-icon" />
                  <span className="citation-link-domain">{truncateText(domain, 28)}</span>
                  <ExternalLink size={11} className="citation-external-icon" />
                </a>
              );
            })}
          </div>
        </div>
      </HoverCard>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if urls array content changes
    if (!prevProps.urls && !nextProps.urls) return true;
    if (!prevProps.urls || !nextProps.urls) return false;
    if (prevProps.urls.length !== nextProps.urls.length) return false;
    return prevProps.urls.every((url, i) => url === nextProps.urls[i]);
  }
);

/**
 * Citation component rendered inline via markdown
 * Memoized to prevent re-renders during streaming
 */
const CitationRenderer = memo(
  ({ ...props }) => {
    // In hast/react, data-urls becomes dataUrls (camelCase)
    const urlsAttr = props.dataUrls || props["data-urls"];
    if (urlsAttr) {
      const urls = urlsAttr
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean);
      return <WebSearchCitation urls={urls} />;
    }
    return null;
  },
  (prevProps, nextProps) => {
    // Only re-render if dataUrls changes
    const prevUrls = prevProps.dataUrls || prevProps["data-urls"];
    const nextUrls = nextProps.dataUrls || nextProps["data-urls"];
    return prevUrls === nextUrls;
  }
);

/**
 * Resolve index-based citation [X:Y] to actual URL
 * X = search call number (1-indexed)
 * Y = result index within that call (1-indexed)
 */
const resolveIndexCitation = (searchIndex, resultIndex, webSearchResults) => {
  if (!webSearchResults || !Array.isArray(webSearchResults)) return null;

  // Convert to 0-indexed
  const sIdx = searchIndex - 1;
  const rIdx = resultIndex - 1;

  if (sIdx < 0 || sIdx >= webSearchResults.length) return null;
  const searchResultUrls = webSearchResults[sIdx];
  if (!searchResultUrls || rIdx < 0 || rIdx >= searchResultUrls.length) return null;

  return searchResultUrls[rIdx];
};

/**
 * Parse multiple citations from a bracket like [1:1, 1:2, 2:3]
 * Returns array of resolved URLs
 */
const parseMultipleCitations = (citationContent, webSearchResults) => {
  const urls = [];
  // Match patterns like 1:1, 2:3, etc.
  const citationPattern = /(\d+):(\d+)/g;
  let match;

  while ((match = citationPattern.exec(citationContent)) !== null) {
    const searchIdx = parseInt(match[1], 10);
    const resultIdx = parseInt(match[2], 10);
    const url = resolveIndexCitation(searchIdx, resultIdx, webSearchResults);
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
};

/**
 * Placeholder for loading citation during streaming
 */
const CITATION_PLACEHOLDER = '<span class="citation-loading"></span>';

/**
 * Preprocess content to convert XML-style citations to URL-based citations
 * Format: <cite ref="X:Y" /> or <cite ref="X:Y,Z:W" />
 * Converted to: <cite data-urls="resolved_url1,resolved_url2"></cite>
 * 
 * Also shows a loading placeholder for incomplete citations during streaming
 * and hides incomplete code fences to prevent flash
 */
const preprocessCitations = (content, webSearchResults) => {
  if (!content) return content;

  let processed = content;

  // Convert XML-style citations <cite ref="X:Y" /> or <cite ref="X:Y,Z:W" />
  processed = processed.replace(/<cite\s+ref="([^"]+)"\s*\/>/gi, (match, refContent) => {
    // Check if this looks like a citation (contains X:Y pattern)
    if (!/\d+:\d+/.test(refContent)) {
      return match; // Not a citation, keep original
    }

    const urls = parseMultipleCitations(refContent, webSearchResults);
    if (urls.length > 0) {
      return `<cite data-urls="${urls.join(",")}"></cite>`;
    }
    // If can't resolve any, keep original text
    return match;
  });

  // Replace incomplete citation patterns with a loading placeholder
  // This handles all streaming states: <c, <ci, <cit, <cite, <cite , <cite r, <cite ref, <cite ref=, <cite ref="..., etc.
  // Match incomplete <cite tags that haven't been closed with />
  processed = processed.replace(/<cite(?:\s+ref(?:="[^"]*)?)?(?:\s*)$/gi, CITATION_PLACEHOLDER);
  
  // Also catch partial tag starts like <c, <ci, <cit at the end
  processed = processed.replace(/<cit?e?$/gi, CITATION_PLACEHOLDER);
  processed = processed.replace(/<ci$/gi, CITATION_PLACEHOLDER);
  processed = processed.replace(/<c$/gi, CITATION_PLACEHOLDER);
  
  // Hide lone < at the end (could be start of any tag)
  processed = processed.replace(/<$/g, "");

  // Hide incomplete code fences during streaming to prevent flash
  // Matches trailing ``` or ```language at end of content without closing fence
  processed = processed.replace(/```[a-zA-Z]*\s*$/g, "");
  // Also catch partial backticks at the very end
  processed = processed.replace(/`{1,2}$/g, "");

  return processed;
};

const TextContent = ({ content, webSearchResults, disableMarkdown }) => {
  const processedContent = useMemo(
    () => preprocessCitations(content, webSearchResults),
    [content, webSearchResults]
  );

  // Create citation renderer with access to webSearchResults
  // Use a stable reference to prevent re-renders during streaming
  const components = useMemo(
    () => ({
      code: CodeRenderer,
      table: CustomTable,
      cite: CitationRenderer,
    }),
    []
  );

  // For user messages, render as plain text without markdown
  if (disableMarkdown) {
    return <div style={{ fontSize: "var(--font-size-base, 14px)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{content}</div>;
  }

  return (
    <div style={{ fontSize: "var(--font-size-base, 14px)", lineHeight: 1.5 }}>
      <Markdown
        children={processedContent}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={components}
      />
    </div>
  );
};

export default TextContent;
