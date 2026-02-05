export const mergeThinkingSteps = (steps) => {
  const merged = [];
  let currentThinkingGroup = null;

  steps.forEach((step) => {
    if (step.type === "thinking") {
      if (currentThinkingGroup) {
        currentThinkingGroup.segments.push(step.segment);
      } else {
        currentThinkingGroup = {
          id: step.id,
          type: "thinking",
          segments: [step.segment],
        };
      }
    } else {
      if (currentThinkingGroup) {
        merged.push(currentThinkingGroup);
        currentThinkingGroup = null;
      }
      merged.push(step);
    }
  });

  if (currentThinkingGroup) {
    merged.push(currentThinkingGroup);
  }

  return merged;
};
