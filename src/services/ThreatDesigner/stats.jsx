/**
 * Threat Designer API
 * Re-exports from API adapter layer for backward compatibility
 * All API calls are routed through the adapter based on build-time configuration
 */

export {
  startThreatModeling,
  updateTm,
  restoreTm,
  generateUrl,
  getDownloadUrl,
  getThreatModelingStatus,
  getThreatModelingTrail,
  getThreatModelingResults,
  getThreatModelingAllResults,
  deleteTm,
} from "./apiAdapter.js";
