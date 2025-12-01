// Import all guide markdown files
import quickStartMd from "../../quick-start-guide/quick-start.md?raw";
import submitThreatModelMd from "../../quick-start-guide/submit-threat-model.md?raw";
import interactWithResultsMd from "../../quick-start-guide/interact-with-threat-model-results.md?raw";
import replayThreatModelMd from "../../quick-start-guide/replay-threat-model.md?raw";
import usingAttackTreesMd from "../../quick-start-guide/using-attack-trees.md?raw";
import usingSentryMd from "../../quick-start-guide/using-sentry.md?raw";
import collaborateMd from "../../quick-start-guide/collaborate-on-threat-models.md?raw";

// Guide metadata and content mapping
export const guides = {
  "quick-start": {
    title: "Quick Start",
    content: quickStartMd,
  },
  "submit-threat-model": {
    title: "Submit Threat Model",
    content: submitThreatModelMd,
  },
  "interact-with-threat-model-results": {
    title: "Interact with Results",
    content: interactWithResultsMd,
  },
  "replay-threat-model": {
    title: "Replay Threat Model",
    content: replayThreatModelMd,
  },
  "using-attack-trees": {
    title: "Using Attack Trees",
    content: usingAttackTreesMd,
  },
  "using-sentry": {
    title: "Using Sentry",
    content: usingSentryMd,
  },
  "collaborate-on-threat-models": {
    title: "Collaborate on Threat Models",
    content: collaborateMd,
  },
};

// Helper to get guide by slug
export const getGuide = (slug) => {
  return guides[slug] || null;
};

// Get all guide slugs
export const getGuideSlugs = () => {
  return Object.keys(guides);
};
