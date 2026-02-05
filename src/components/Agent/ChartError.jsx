import React from "react";
import { useTheme } from "../ThemeContext";
import "./ChartStyles.css";

/**
 * ChartError Component
 *
 * Displays error messages for chart rendering failures.
 * Used when chart configuration is malformed, unsupported, or missing required fields.
 *
 * Features:
 * - Clear error message display centered in container
 * - Theme-aware styling (light/dark mode)
 * - Accessibility support with role="alert" and aria-live
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} props.message - The error message to display
 * @returns {JSX.Element} The rendered error display
 *
 * Requirements: 3.3, 3.4, 3.5
 */
const ChartError = ({ message }) => {
  const { effectiveTheme } = useTheme();
  const themeClass = effectiveTheme === "light" ? "light" : "dark";

  return (
    <div className={`chart-error ${themeClass}`} role="alert" aria-live="assertive">
      <span className="chart-error-text">
        Unable to render chart{message ? `: ${message}` : ""}
      </span>
    </div>
  );
};

export default ChartError;
