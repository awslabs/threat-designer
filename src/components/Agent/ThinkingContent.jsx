import React, { useState, useCallback, useRef, useEffect } from "react";
import TextContent from "./TextContent";
import ThinkingComponent from "./ThinkingComponent";
import { useTheme } from "../ThemeContext";
import "./ThinkingContent.css";

const ThinkingContent = ({ content, onToggle, thinkingLoading, isParentFirstMount }) => {
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef(null);
  const wrapperRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const { effectiveTheme } = useTheme();
  const wasFirstMountRef = useRef(isParentFirstMount);
  const prevThinkingLoading = useRef(thinkingLoading);

  const handleToggle = useCallback(() => {
    const newState = !expanded;
    setExpanded(newState);
    onToggle?.(newState);
  }, [expanded, onToggle]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const wasLoading = prevThinkingLoading.current;
      const isNowNotLoading = !thinkingLoading;

      if (wasLoading && isNowNotLoading && !wasFirstMountRef.current) {
        setExpanded(true);
      }

      prevThinkingLoading.current = thinkingLoading;
    }, 1);

    return () => clearTimeout(timer);
  }, [thinkingLoading]);

  const getTextColor = () => {
    return effectiveTheme === "light" ? "#706D6C" : "#8b8b8c";
  };

  const getLineColor = () => {
    return effectiveTheme === "light" ? "#d0d0d0" : "#3a3a3a";
  };

  const calculateHeight = useCallback(() => {
    if (wrapperRef.current) {
      // Get the actual content height including the 5px padding
      const rect = wrapperRef.current.getBoundingClientRect();
      const height = Math.ceil(rect.height);

      setContentHeight(height);
    }
  }, []);

  useEffect(() => {
    const measureHeight = () => {
      requestAnimationFrame(() => {
        calculateHeight();
      });
    };

    measureHeight();

    if (wrapperRef.current && window.ResizeObserver) {
      resizeObserverRef.current = new ResizeObserver(() => {
        measureHeight();
      });
      resizeObserverRef.current.observe(wrapperRef.current);
    }

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [content, calculateHeight]);

  const generateLineElements = () => {
    if (!contentHeight) return null;

    const dotSpacing = 110; // Balanced spacing
    const dotSize = 6;
    const gapSize = 18;

    const lineHeight = expanded ? contentHeight : 0;

    return (
      <div
        className="thinking-line-mask"
        style={{
          height: `${lineHeight}px`,
        }}
      >
        {contentHeight < dotSpacing ? (
          <div
            className="thinking-line-segment-static"
            style={{
              position: "absolute",
              left: "5px",
              width: "2px",
              top: "0px",
              height: `${contentHeight}px`,
              backgroundColor: getLineColor(),
              opacity: expanded ? 1 : 0,
            }}
          />
        ) : (
          <>
            {(() => {
              const numDots = Math.floor(contentHeight / dotSpacing);
              let currentTop = 0;
              const lineElements = [];

              for (let i = 0; i <= numDots; i++) {
                const isLast = i === numDots;
                const segmentHeight = isLast
                  ? contentHeight - currentTop
                  : i === 0
                    ? dotSpacing - gapSize / 2
                    : dotSpacing - gapSize;

                if (segmentHeight > 0) {
                  lineElements.push(
                    <div
                      key={`line-${i}`}
                      className="thinking-line-segment-static"
                      style={{
                        position: "absolute",
                        left: "5px",
                        width: "2px",
                        top: `${currentTop}px`,
                        height: `${segmentHeight}px`,
                        backgroundColor: getLineColor(),
                        opacity: expanded ? 1 : 0,
                      }}
                    />
                  );
                }

                currentTop += segmentHeight;

                if (i < numDots && currentTop < contentHeight - 10) {
                  lineElements.push(
                    <div
                      key={`dot-${i}`}
                      className="thinking-line-dot-static"
                      style={{
                        position: "absolute",
                        left: "2px",
                        width: `${dotSize}px`,
                        height: `${dotSize}px`,
                        borderRadius: "50%",
                        top: `${currentTop + gapSize / 2 - dotSize / 2}px`,
                        backgroundColor: getLineColor(),
                        opacity: expanded ? 1 : 0,
                      }}
                    />
                  );
                  currentTop += gapSize;
                }
              }

              return lineElements;
            })()}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="thinking-container">
      <ThinkingComponent loading={thinkingLoading} onClick={handleToggle} />
      <div className="thinking-content-area">
        <div className="thinking-line-container">{generateLineElements()}</div>
        <div
          ref={contentRef}
          className={`thinking-content-container ${expanded ? "expanded" : "collapsed"}`}
          style={{
            maxHeight: expanded ? `${contentHeight}px` : "0",
          }}
        >
          <div
            ref={wrapperRef}
            className="thinking-content-wrapper"
            style={{ color: getTextColor() }}
          >
            <TextContent content={content} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThinkingContent;
