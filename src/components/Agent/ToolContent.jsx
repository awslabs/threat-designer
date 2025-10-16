import React, { useState, useEffect, useRef } from "react";
import "./ToolContent.css";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useTheme } from "../ThemeContext";

const ToolContent = React.memo(
  ({
    state: propState,
    expanded,
    onExpand,
    text: propText,
    children: propChildren,
    isParentFirstMount,
  }) => {
    const { effectiveTheme } = useTheme();
    const [isExpanded, setIsExpanded] = useState(false);
    const [showExpandButton, setShowExpandButton] = useState(false);
    const [prevState, setPrevState] = useState("loading");
    const [hasAutoExpanded, setHasAutoExpanded] = useState(false);
    const [showContent, setShowContent] = useState(false);
    const [shouldExpandWidth, setShouldExpandWidth] = useState(false);
    const containerRef = useRef(null);
    const wasFirstMountRef = useRef(isParentFirstMount);

    const state = propState || "loading";
    const text = propText || "";
    const children = propChildren;

    const hasChildren = children != null;

    // Handle state transitions and width expansion
    useEffect(() => {
      if (state !== "loading" && prevState === "loading" && hasChildren) {
        // Force a reflow to ensure transition triggers
        if (containerRef.current) {
          containerRef.current.offsetHeight; // Force reflow
        }

        // Delay the width expansion to trigger animation
        requestAnimationFrame(() => {
          setShouldExpandWidth(true);

          // Show button after width starts expanding
          setTimeout(() => {
            setShowExpandButton(true);

            // Auto-expand content if needed - use captured initial value
            const shouldAutoExpand = !wasFirstMountRef.current && expanded;

            if (shouldAutoExpand && !hasAutoExpanded) {
              setTimeout(() => {
                setIsExpanded(true);
                // Another frame for the content animation
                requestAnimationFrame(() => {
                  setShowContent(true);
                });
                setHasAutoExpanded(true);
                onExpand?.(true);
              }, 200); // Wait for button to appear
            }
          }, 200); // Wait for width animation to start
        });
      } else if (state === "loading") {
        // Reset everything when going back to loading
        setShouldExpandWidth(false);
        setShowExpandButton(false);
        setIsExpanded(false);
        setShowContent(false);
      }

      setPrevState(state);
    }, [state, prevState, hasChildren, expanded, hasAutoExpanded]);

    const handleExpand = () => {
      if (!isExpanded) {
        setIsExpanded(true);
        requestAnimationFrame(() => {
          setShowContent(true);
        });
      } else {
        setShowContent(false);
        setTimeout(() => setIsExpanded(false), 300);
      }
      onExpand?.(!isExpanded);
    };

    const getStateConfig = () => {
      const configs = {
        pending: {
          icon: <StatusIndicator type="warning" />,
          className: "pending",
        },
        error: {
          icon: <StatusIndicator type="error" />,
          className: "error",
        },
        success: {
          icon: <StatusIndicator type="success" />,
          className: "success",
        },
        loading: {
          icon: <StatusIndicator type="loading" />,
          className: "loading",
        },
      };

      return configs[state] || configs.loading;
    };

    const config = getStateConfig();

    return (
      <div
        ref={containerRef}
        className={`status-container ${config.className} ${effectiveTheme} ${isExpanded ? "expanded" : ""} ${!hasChildren ? "no-children" : ""} ${shouldExpandWidth ? "width-expanded" : ""}`}
      >
        <div className="status-main">
          <div className="status-indicator">
            {config.icon}
            <span className="status-text">{text}</span>
          </div>

          <div className="status-content">
            {showExpandButton && hasChildren && state !== "loading" && (
              <button
                className={`expand-button ${effectiveTheme}`}
                onClick={handleExpand}
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                <svg
                  className={`arrow-icon ${showContent ? "rotated" : ""}`}
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
        </div>

        {isExpanded && hasChildren && (
          <div className={`expanded-content ${effectiveTheme} ${showContent ? "show" : ""}`}>
            <div className="expanded-content-inner">{children}</div>
          </div>
        )}
      </div>
    );
  }
);

export default ToolContent;
