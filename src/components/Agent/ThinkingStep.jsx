import { ClockFading } from "lucide-react";
import TextContent from "./TextContent";

const ThinkingStep = ({ segments, isLast, theme }) => {
  const textColor = theme === "light" ? "#4a4a4a" : "#b5b5b6";

  return (
    <div className={`timeline-item ${isLast ? "last" : ""}`}>
      <div className="timeline-marker">
        <ClockFading size={18} className="timeline-icon thinking-icon" />
      </div>
      <div className="timeline-content">
        <div className="timeline-thinking-content" style={{ color: textColor }}>
          {segments.map((segment, index) => (
            <div key={index} className="thinking-segment">
              <TextContent content={segment?.content || ""} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ThinkingStep;
