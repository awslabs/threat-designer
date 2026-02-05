import { memo } from "react";
import { useTheme } from "../ThemeContext";
import "./ChartStyles.css";

/**
 * ChartPlaceholder Component
 *
 * Displays a loading indicator while a chart is being generated during streaming.
 * Uses the same shimmer animation as the Reasoning header in UnifiedThinkingBlock.
 *
 * Features:
 * - Shimmer text animation matching the Reasoning header style
 * - Theme-aware styling (light/dark mode)
 * - Accessible loading state
 *
 * @component
 * @returns {JSX.Element} The placeholder loading state
 *
 * Requirements: 2.2, 2.3
 */
const ChartPlaceholder = memo(() => {
  const { effectiveTheme } = useTheme();
  const themeClass = effectiveTheme === "light" ? "light" : "dark";
  const textClassName = themeClass === "light" ? "chart-text-shimmer-light" : "chart-text-shimmer";

  return (
    <div
      className={`chart-placeholder ${themeClass}`}
      role="status"
      aria-live="polite"
      aria-label="Generating chart"
    >
      <span className={`chart-placeholder-text ${textClassName}`}>Generating chart</span>
    </div>
  );
});

ChartPlaceholder.displayName = "ChartPlaceholder";

export default ChartPlaceholder;
