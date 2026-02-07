import { CircleCheck } from "lucide-react";

const CompletionStep = () => (
  <div className="timeline-item last completion-step">
    <div className="timeline-marker">
      <CircleCheck size={18} className="timeline-icon thinking-icon" />
    </div>
  </div>
);

export default CompletionStep;
