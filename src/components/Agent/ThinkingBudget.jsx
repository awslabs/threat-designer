import React from "react";
import EffortSlider from "../EffortSlider";

/**
 * Sentry's reasoning-effort picker, shown in the Think button's dropdown.
 *
 * Thinking is always on — the lever only selects how much. Budget is held as a
 * string ("1".."4") because it is persisted to localStorage and sent as-is.
 */
function ThinkingBudgetControl({ budget, setBudget }) {
  return (
    <div
      style={{
        padding: "10px 16px 12px 12px",
        width: "220px",
        fontSize: "14px",
      }}
    >
      <EffortSlider value={budget} onChange={(value) => setBudget(String(value))} />
    </div>
  );
}

const ThinkingBudget = React.memo(ThinkingBudgetControl);

export default ThinkingBudget;
