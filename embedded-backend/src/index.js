/**
 * Main entry point for embedded backend
 * Exports all API adapter functions for Lightning Mode
 */

// Import adapter functions
import {
  startThreatModeling as _startThreatModeling,
  updateTm as _updateTm,
  restoreTm as _restoreTm,
  generateUrl as _generateUrl,
  getDownloadUrl as _getDownloadUrl,
  getThreatModelingStatus as _getThreatModelingStatus,
  getThreatModelingTrail as _getThreatModelingTrail,
  getThreatModelingResults as _getThreatModelingResults,
  getThreatModelingAllResults as _getThreatModelingAllResults,
  deleteTm as _deleteTm,
} from "./adapter/threatDesignerAdapter.js";

// Re-export all functions
export const startThreatModeling = _startThreatModeling;
export const updateTm = _updateTm;
export const restoreTm = _restoreTm;
export const generateUrl = _generateUrl;
export const getDownloadUrl = _getDownloadUrl;
export const getThreatModelingStatus = _getThreatModelingStatus;
export const getThreatModelingTrail = _getThreatModelingTrail;
export const getThreatModelingResults = _getThreatModelingResults;
export const getThreatModelingAllResults = _getThreatModelingAllResults;
export const deleteTm = _deleteTm;

// Export state manager for direct access if needed
export { default as stateManager } from "./storage/stateManager.js";

// Export credentials manager
export {
  getCredentials,
  setCredentials,
  clearCredentials,
  hasValidCredentials,
} from "./config/credentials.js";

// Export error types for error handling
export { ThreatModelingError, ERROR_TYPES } from "./adapter/errors.js";

// Export agent execution control functions
export { interruptJob, isJobExecuting } from "./adapter/agentExecutor.js";
