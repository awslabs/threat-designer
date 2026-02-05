import ToolIcon from "./ToolIcon";
import ToolResultIndicator from "./ToolResultIndicator";

const ToolStep = ({ step, isLast }) => (
  <div className={`timeline-item ${isLast ? "last" : ""}`}>
    <div className="timeline-marker">
      <ToolIcon toolName={step.toolName} />
    </div>
    <div className="timeline-content">
      <ToolResultIndicator
        toolName={step.toolName}
        content={step.toolContent}
        isComplete={step.isToolComplete}
        error={step.toolError}
      />
    </div>
  </div>
);

export default ToolStep;
