/**
 * State Manager for Lightning Mode
 * Handles all sessionStorage operations for threat modeling data
 */

// SessionStorage key prefixes
const KEYS = {
  JOB_STATUS: "tm_job_status_",
  JOB_RESULTS: "tm_job_results_",
  JOB_TRAIL: "tm_job_trail_",
  ALL_JOBS: "tm_all_jobs",
  UPLOADED_FILES: "tm_uploaded_files_",
  AWS_CREDENTIALS: "tm_aws_credentials",
};

// Job status constants
export const JOB_STATUS = {
  START: "START",
  ASSETS: "ASSETS",
  FLOW: "FLOW",
  THREAT: "THREAT",
  THREAT_RETRY: "THREAT_RETRY",
  FINALIZE: "FINALIZE",
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
};

/**
 * StateManager class for managing threat modeling state in sessionStorage
 */
export class StateManager {
  /**
   * Set job status
   * @param {string} id - Job ID
   * @param {string} state - Job state (START, ASSETS, FLOW, THREAT, THREAT_RETRY, FINALIZE, COMPLETE, FAILED, CANCELLED)
   * @param {number} retry - Retry count
   * @param {string} detail - Optional detail message for status
   */
  setJobStatus(id, state, retry = 0, detail = null) {
    const status = {
      id,
      state,
      retry,
      owner: "LIGHTNING_USER",
      updated_at: new Date().toISOString(),
    };

    // Add detail if provided
    if (detail !== null && detail !== undefined) {
      status.detail = detail;
    }

    sessionStorage.setItem(`${KEYS.JOB_STATUS}${id}`, JSON.stringify(status));
  }

  /**
   * Get job status
   * @param {string} id - Job ID
   * @returns {Object|null} Job status or null if not found
   */
  getJobStatus(id) {
    const stored = sessionStorage.getItem(`${KEYS.JOB_STATUS}${id}`);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error("Failed to parse job status:", error);
      return null;
    }
  }

  /**
   * Set job results
   * @param {string} id - Job ID
   * @param {Object} results - Complete threat model results
   */
  setJobResults(id, results) {
    sessionStorage.setItem(`${KEYS.JOB_RESULTS}${id}`, JSON.stringify(results));
  }

  /**
   * Get job results
   * @param {string} id - Job ID
   * @returns {Object|null} Job results or null if not found
   */
  getJobResults(id) {
    const stored = sessionStorage.getItem(`${KEYS.JOB_RESULTS}${id}`);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error("Failed to parse job results:", error);
      return null;
    }
  }

  /**
   * Update job results (merge with existing)
   * @param {string} id - Job ID
   * @param {Object} updates - Partial updates to merge
   */
  updateJobResults(id, updates) {
    const existing = this.getJobResults(id) || {};
    const updated = { ...existing, ...updates };
    this.setJobResults(id, updated);
  }

  /**
   * Set job trail
   * @param {string} id - Job ID
   * @param {Object} trail - Trail data with assets, flows, gaps, threats
   */
  setJobTrail(id, trail) {
    sessionStorage.setItem(`${KEYS.JOB_TRAIL}${id}`, JSON.stringify(trail));
  }

  /**
   * Get job trail
   * @param {string} id - Job ID
   * @returns {Object|null} Job trail or null if not found
   */
  getJobTrail(id) {
    const stored = sessionStorage.getItem(`${KEYS.JOB_TRAIL}${id}`);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error("Failed to parse job trail:", error);
      return null;
    }
  }

  /**
   * Update job trail (merge with existing)
   * @param {string} id - Job ID
   * @param {Object} updates - Partial updates to merge
   */
  updateJobTrail(id, updates) {
    const existing = this.getJobTrail(id) || { id, assets: "", flows: "", gaps: [], threats: [] };

    // Handle array fields specially
    const updated = { ...existing };

    if (updates.assets !== undefined) {
      updated.assets = updates.assets;
    }
    if (updates.flows !== undefined) {
      updated.flows = updates.flows;
    }
    if (updates.gaps !== undefined) {
      updated.gaps = Array.isArray(updates.gaps)
        ? [...(existing.gaps || []), ...updates.gaps]
        : [...(existing.gaps || []), updates.gaps];
    }
    if (updates.threats !== undefined) {
      updated.threats = Array.isArray(updates.threats)
        ? [...(existing.threats || []), ...updates.threats]
        : [...(existing.threats || []), updates.threats];
    }

    this.setJobTrail(id, updated);
  }

  /**
   * Add job to index
   * @param {string} id - Job ID
   * @param {Object} metadata - Job metadata (title, owner, etc.)
   */
  addJobToIndex(id, metadata) {
    const allJobs = this.getAllJobs();

    // Check if job already exists
    const existingIndex = allJobs.findIndex((job) => job.id === id);

    const jobEntry = {
      id,
      ...metadata,
      created_at: metadata.created_at || new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      // Update existing entry
      allJobs[existingIndex] = { ...allJobs[existingIndex], ...jobEntry };
    } else {
      // Add new entry
      allJobs.push(jobEntry);
    }

    sessionStorage.setItem(KEYS.ALL_JOBS, JSON.stringify(allJobs));
  }

  /**
   * Get all jobs
   * @returns {Array} Array of job metadata
   */
  getAllJobs() {
    const stored = sessionStorage.getItem(KEYS.ALL_JOBS);
    if (!stored) {
      return [];
    }

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error("Failed to parse all jobs:", error);
      return [];
    }
  }

  /**
   * Remove job from index
   * @param {string} id - Job ID
   */
  removeJobFromIndex(id) {
    const allJobs = this.getAllJobs();
    const filtered = allJobs.filter((job) => job.id !== id);
    sessionStorage.setItem(KEYS.ALL_JOBS, JSON.stringify(filtered));
  }

  /**
   * Store uploaded file (base64)
   * @param {string} key - File key/name
   * @param {string} base64Data - Base64 encoded file data
   */
  storeUploadedFile(key, base64Data) {
    sessionStorage.setItem(`${KEYS.UPLOADED_FILES}${key}`, base64Data);
  }

  /**
   * Get uploaded file
   * @param {string} key - File key/name
   * @returns {string|null} Base64 encoded file data or null if not found
   */
  getUploadedFile(key) {
    return sessionStorage.getItem(`${KEYS.UPLOADED_FILES}${key}`);
  }

  /**
   * Delete uploaded file
   * @param {string} key - File key/name
   */
  deleteUploadedFile(key) {
    sessionStorage.removeItem(`${KEYS.UPLOADED_FILES}${key}`);
  }

  /**
   * Clear all data for a specific job
   * @param {string} id - Job ID
   */
  clearJobData(id) {
    sessionStorage.removeItem(`${KEYS.JOB_STATUS}${id}`);
    sessionStorage.removeItem(`${KEYS.JOB_RESULTS}${id}`);
    sessionStorage.removeItem(`${KEYS.JOB_TRAIL}${id}`);
    this.removeJobFromIndex(id);
  }

  /**
   * Clear all threat modeling data (preserves AWS credentials)
   */
  clearAllData() {
    // Preserve AWS credentials before clearing
    const awsCredentials = sessionStorage.getItem(KEYS.AWS_CREDENTIALS);

    // Get all jobs to clear their data
    const allJobs = this.getAllJobs();
    allJobs.forEach((job) => {
      this.clearJobData(job.id);
    });

    // Clear the index
    sessionStorage.removeItem(KEYS.ALL_JOBS);

    // Clear any uploaded files
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(KEYS.UPLOADED_FILES)) {
        sessionStorage.removeItem(key);
      }
    });

    // Restore AWS credentials if they existed
    if (awsCredentials) {
      sessionStorage.setItem(KEYS.AWS_CREDENTIALS, awsCredentials);
    }
  }

  /**
   * Check if a job is active (not in a terminal state)
   * @param {string} id - Job ID
   * @returns {boolean} True if job is active, false otherwise
   */
  isJobActive(id) {
    const status = this.getJobStatus(id);
    if (!status) {
      return false;
    }

    const terminalStates = [JOB_STATUS.CANCELLED, JOB_STATUS.COMPLETE, JOB_STATUS.FAILED];

    return !terminalStates.includes(status.state);
  }
}

// Export singleton instance
const stateManager = new StateManager();

export default stateManager;

// Export convenience functions
export const setJobStatus = (id, state, retry, detail) =>
  stateManager.setJobStatus(id, state, retry, detail);
export const getJobStatus = (id) => stateManager.getJobStatus(id);
export const setJobResults = (id, results) => stateManager.setJobResults(id, results);
export const getJobResults = (id) => stateManager.getJobResults(id);
export const updateJobResults = (id, updates) => stateManager.updateJobResults(id, updates);
export const setJobTrail = (id, trail) => stateManager.setJobTrail(id, trail);
export const getJobTrail = (id) => stateManager.getJobTrail(id);
export const updateJobTrail = (id, updates) => stateManager.updateJobTrail(id, updates);
export const addJobToIndex = (id, metadata) => stateManager.addJobToIndex(id, metadata);
export const getAllJobs = () => stateManager.getAllJobs();
export const removeJobFromIndex = (id) => stateManager.removeJobFromIndex(id);
export const storeUploadedFile = (key, base64Data) =>
  stateManager.storeUploadedFile(key, base64Data);
export const getUploadedFile = (key) => stateManager.getUploadedFile(key);
export const deleteUploadedFile = (key) => stateManager.deleteUploadedFile(key);
export const clearJobData = (id) => stateManager.clearJobData(id);
export const clearAllData = () => stateManager.clearAllData();
export const isJobActive = (id) => stateManager.isJobActive(id);
