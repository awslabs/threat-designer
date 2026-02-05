import { ChevronDown } from "lucide-react";

const ReasoningHeader = ({ currentStep, isComplete, isExpanded, onClick, theme }) => {
  const textClassName = !isComplete
    ? theme === "light"
      ? "text-reveal-light"
      : "text-reveal"
    : "";

  return (
    <div className={`unified-block-header ${theme}`} onClick={onClick}>
      <div className="unified-header-content">
        <span className={`unified-header-text ${textClassName}`}>{currentStep}</span>
        <button
          className={`unified-expand-button ${theme}`}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <ChevronDown size={16} className={`unified-arrow-icon ${isExpanded ? "rotated" : ""}`} />
        </button>
      </div>
    </div>
  );
};

export default ReasoningHeader;
