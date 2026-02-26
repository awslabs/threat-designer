import { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { useTheme } from "../ThemeContext";
import { buildTimelineSteps } from "./utils/timelineParser";
import { mergeThinkingSteps } from "./utils/stepMerger";
import { getToolCategory, formatToolName } from "./utils/toolHelpers";
import { TOOL_CATEGORIES } from "./utils/constants";
import ReasoningHeader from "./ReasoningHeader";
import CompletionStep from "./CompletionStep";
import ThinkingStep from "./ThinkingStep";
import ToolStep from "./ToolStep";
import "./UnifiedThinkingBlock.css";

const UnifiedThinkingBlock = ({ contentBlocks = [], isGroupComplete = false }) => {
  const { effectiveTheme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [isToggling, setIsToggling] = useState(false);

  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const mergedSteps = useMemo(() => {
    const steps = buildTimelineSteps(contentBlocks);
    return mergeThinkingSteps(steps);
  }, [contentBlocks]);

  const currentStepText = useMemo(() => {
    if (mergedSteps.length === 0) return "Reasoning";

    const lastStep = mergedSteps[mergedSteps.length - 1];

    const getSearchQuery = (step) => {
      if (!step.toolInput) return null;
      try {
        const parsed =
          typeof step.toolInput === "string" ? JSON.parse(step.toolInput) : step.toolInput;
        return parsed.query || parsed.search_query || parsed.q || null;
      } catch {
        return typeof step.toolInput === "string" ? step.toolInput : null;
      }
    };

    if (isGroupComplete) {
      if (lastStep.type === "thinking") return "Reasoning";
      const category = getToolCategory(lastStep.toolName);
      switch (category) {
        case TOOL_CATEGORIES.WEB_SEARCH: {
          const q = getSearchQuery(lastStep);
          return q ? `Searched for ${q}` : "Searched";
        }
        case TOOL_CATEGORIES.WEB_EXTRACT:
          return "Read sources";
        case TOOL_CATEGORIES.THREAT:
          return "Updated threats";
        default:
          return formatToolName(lastStep.toolName);
      }
    }

    if (lastStep.type === "thinking") return "Reasoning";

    const category = getToolCategory(lastStep.toolName);

    if (!lastStep.isToolComplete) {
      switch (category) {
        case TOOL_CATEGORIES.WEB_SEARCH: {
          const q = getSearchQuery(lastStep);
          return q ? `Searching for ${q}` : "Searching";
        }
        case TOOL_CATEGORIES.WEB_EXTRACT:
          return "Reading";
        case TOOL_CATEGORIES.THREAT:
          return "Updating threats";
        default:
          return `Running ${formatToolName(lastStep.toolName)}`;
      }
    } else {
      switch (category) {
        case TOOL_CATEGORIES.WEB_SEARCH: {
          const q = getSearchQuery(lastStep);
          return q ? `Searched for ${q}` : "Searched";
        }
        case TOOL_CATEGORIES.WEB_EXTRACT:
          return "Read sources";
        case TOOL_CATEGORIES.THREAT:
          return "Updated threats";
        default:
          return `${formatToolName(lastStep.toolName)} complete`;
      }
    }
  }, [mergedSteps, isGroupComplete]);

  const handleToggle = useCallback(() => {
    // Enable transition only for the explicit user toggle
    setIsToggling(true);
    setIsExpanded((prev) => !prev);
  }, []);

  // Immediate height calculation without debounce for streaming
  // Add 5px buffer to ensure line extends slightly beyond content
  const calculateHeightImmediate = useCallback(() => {
    if (wrapperRef.current) {
      const newHeight = Math.ceil(wrapperRef.current.getBoundingClientRect().height) + 5;
      setContentHeight((prev) => (prev !== newHeight ? newHeight : prev));
    }
  }, []);

  // Clear the toggling flag once the CSS transition finishes
  // so subsequent content resizes (e.g. tool expand) apply instantly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onEnd = (e) => {
      if (e.propertyName === "max-height") setIsToggling(false);
    };
    el.addEventListener("transitionend", onEnd);
    return () => el.removeEventListener("transitionend", onEnd);
  }, []);

  // Setup ResizeObserver — use immediate height calc so the parent
  // max-height stays in sync with child expand/collapse animations
  useEffect(() => {
    if (wrapperRef.current && window.ResizeObserver) {
      resizeObserverRef.current = new ResizeObserver(calculateHeightImmediate);
      resizeObserverRef.current.observe(wrapperRef.current);
    }

    return () => {
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
    };
  }, [calculateHeightImmediate]);

  // Use useLayoutEffect for immediate height updates when content changes
  // This runs synchronously after DOM mutations but before paint
  useLayoutEffect(() => {
    calculateHeightImmediate();
  }, [contentBlocks, isGroupComplete, calculateHeightImmediate]);

  return (
    <div className={`unified-thinking-block ${effectiveTheme}`}>
      <ReasoningHeader
        currentStep={currentStepText}
        isComplete={isGroupComplete}
        isExpanded={isExpanded}
        onClick={handleToggle}
        theme={effectiveTheme}
      />

      <div
        ref={containerRef}
        className={`unified-content-container ${isExpanded ? "expanded" : "collapsed"} ${isToggling ? "animating" : ""}`}
        style={{ maxHeight: isExpanded ? `${contentHeight}px` : "0" }}
      >
        <div ref={wrapperRef} className="unified-content-wrapper">
          <div className="timeline">
            <div className="timeline-line" />

            {mergedSteps.map((step, index) => {
              const isLast = !isGroupComplete && index === mergedSteps.length - 1;

              if (step.type === "thinking") {
                return (
                  <ThinkingStep
                    key={step.id}
                    segments={step.segments}
                    isLast={isLast}
                    theme={effectiveTheme}
                  />
                );
              }

              return <ToolStep key={step.id} step={step} isLast={isLast} />;
            })}

            {isGroupComplete && <CompletionStep />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedThinkingBlock;
