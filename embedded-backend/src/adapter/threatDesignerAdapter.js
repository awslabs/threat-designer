/**
 * Threat Designer Adapter for Lightning Mode
 * Implements API functions matching Python backend interface
 */

import { v4 as uuidv4 } from "uuid";
import stateManager from "../storage/stateManager.js";
import { executeAgent } from "./agentExecutor.js";
import { ThreatModelingError, withErrorHandling, validateParams } from "./errors.js";

/**
 * Start a new threat modeling job
 * Matches Python backend: invoke_lambda(owner, body)
 *
 * @param {string} key - S3 location/key for uploaded architecture diagram
 * @param {number} iteration - Number of threat iterations
 * @param {number} reasoning - Reasoning/retry count
 * @param {string} title - Threat model title
 * @param {string} description - System description
 * @param {Array<string>} assumptions - List of assumptions
 * @param {boolean} replay - Whether this is a replay job
 * @param {string} id - Job ID (required for replay)
 * @param {string} instructions - Additional instructions for replay
 * @returns {Promise<Object>} Response with job ID: { data: { id: string } }
 */
export const startThreatModeling = withErrorHandling(
  async (
    key,
    iteration,
    reasoning,
    title,
    description,
    assumptions,
    replay = false,
    id = null,
    instructions = null
  ) => {
    console.log("startThreatModeling called", {
      key,
      iteration,
      reasoning,
      title,
      replay,
      id,
    });

    // Validate required parameters based on mode
    if (replay) {
      // For replay, only iteration, reasoning, and id are required
      validateParams({ iteration, reasoning, id }, ["iteration", "reasoning", "id"]);
    } else {
      // For new jobs, title and description are also required
      validateParams({ iteration, reasoning, title, description }, [
        "iteration",
        "reasoning",
        "title",
        "description",
      ]);
    }

    // Execute agent
    const result = await executeAgent({
      s3_location: key,
      id,
      iteration,
      reasoning,
      description,
      assumptions: assumptions || [],
      title,
      replay,
      instructions,
    });

    return { data: result };
  }
);

/**
 * Update threat model results
 * Matches Python backend: update_results(id, body, owner)
 *
 * @param {string} id - Job ID
 * @param {Object} payload - Update payload
 * @returns {Promise<Object>} Response with updated results: { data: Object }
 */
export const updateTm = withErrorHandling(async (id, payload) => {
  console.log("updateTm called", { id, payload });

  // Validate parameters
  validateParams({ id }, ["id"]);

  if (!payload || typeof payload !== "object") {
    throw new ThreatModelingError("VALIDATION_ERROR", "Payload must be an object", id);
  }

  // Get existing results
  const existingResults = stateManager.getJobResults(id);
  if (!existingResults) {
    throw new ThreatModelingError("NOT_FOUND", `Job ${id} not found`, id);
  }

  // Locked attributes that cannot be updated
  const lockedAttributes = ["owner", "s3_location", "job_id"];

  // Remove locked attributes from payload
  const filteredPayload = Object.keys(payload)
    .filter((key) => !lockedAttributes.includes(key))
    .reduce((obj, key) => {
      obj[key] = payload[key];
      return obj;
    }, {});

  // Create backup before update
  if (!existingResults.backup) {
    const backup = {
      assets: existingResults.assets,
      system_architecture: existingResults.system_architecture,
      threat_list: existingResults.threat_list,
    };
    filteredPayload.backup = backup;
  }

  // Update results
  stateManager.updateJobResults(id, filteredPayload);

  // Get updated results
  const updatedResults = stateManager.getJobResults(id);

  return { data: updatedResults };
});

/**
 * Restore threat model to previous version
 * Matches Python backend: restore(id, owner)
 *
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Response with success status: { data: boolean }
 */
export const restoreTm = withErrorHandling(async (id) => {
  console.log("restoreTm called", { id });

  // Validate parameters
  validateParams({ id }, ["id"]);

  // Get existing results
  const existingResults = stateManager.getJobResults(id);
  if (!existingResults) {
    throw new ThreatModelingError("NOT_FOUND", `Job ${id} not found`, id);
  }

  // Check if backup exists
  if (!existingResults.backup) {
    throw new ThreatModelingError("NOT_FOUND", `No backup found for job ${id}`, id);
  }

  // Restore from backup
  const restoredResults = {
    ...existingResults,
    assets: existingResults.backup.assets,
    system_architecture: existingResults.backup.system_architecture,
    threat_list: existingResults.backup.threat_list,
  };

  stateManager.setJobResults(id, restoredResults);

  // Update job status to COMPLETE
  const status = stateManager.getJobStatus(id);
  if (status) {
    stateManager.setJobStatus(id, "COMPLETE", status.retry || 0);
  }

  return { data: true };
});

/**
 * Generate presigned URL for file upload (mocked for Lightning Mode)
 * Matches Python backend: generate_presigned_url(file_type)
 *
 * In Lightning Mode, we don't actually upload to S3. Instead, we:
 * 1. Generate a unique key
 * 2. Return a mock presigned URL
 * 3. The frontend will store the base64 data using this key
 *
 * @param {string} fileType - File MIME type (e.g., 'image/png')
 * @returns {Promise<Object>} Response with presigned URL and key: { data: { presigned: string, name: string } }
 */
export const generateUrl = withErrorHandling(async (fileType = "image/png") => {
  console.log("generateUrl called", { fileType });

  // Generate unique key
  const key = uuidv4();

  // Return mock presigned URL
  // The frontend will intercept this and store data locally
  const mockPresignedUrl = `lightning://upload/${key}`;

  return {
    data: {
      presigned: mockPresignedUrl,
      name: key,
    },
  };
});

/**
 * Get download URL for stored file (mocked for Lightning Mode)
 * Matches Python backend: generate_presigned_download_url(object_name)
 *
 * In Lightning Mode, we retrieve the base64 data from sessionStorage
 * and return it as a Blob
 *
 * @param {string} fileName - File key/name
 * @returns {Promise<Blob>} File data as Blob
 */
export const getDownloadUrl = withErrorHandling(async (fileName) => {
  console.log("getDownloadUrl called", { fileName });

  // Validate parameters
  validateParams({ fileName }, ["fileName"]);

  // Get file data from storage
  const storedData = stateManager.getUploadedFile(fileName);

  if (!storedData) {
    throw new ThreatModelingError("NOT_FOUND", `File ${fileName} not found`, null);
  }

  // Convert base64 to Blob
  try {
    let mimeType;
    let base64;

    // Check if stored data is JSON format (from uploadFile)
    try {
      const parsed = JSON.parse(storedData);
      if (parsed.data && parsed.type) {
        base64 = parsed.data;
        mimeType = parsed.type;
      } else {
        throw new Error("Invalid JSON format");
      }
    } catch (jsonError) {
      // Not JSON, try data URL format
      const matches = storedData.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error("Invalid data format - not JSON or data URL");
      }
      mimeType = matches[1];
      base64 = matches[2];
    }

    // Convert base64 to binary
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create Blob
    const blob = new Blob([bytes], { type: mimeType });

    return blob;
  } catch (error) {
    throw new ThreatModelingError(
      "INTERNAL_ERROR",
      `Failed to retrieve file: ${error.message}`,
      null
    );
  }
});

/**
 * Get threat modeling job status
 * Matches Python backend: check_status(job_id)
 *
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Response with job status: { data: { id: string, state: string, retry: number, detail: string | null } }
 */
export const getThreatModelingStatus = withErrorHandling(async (id) => {
  // Validate parameters
  validateParams({ id }, ["id"]);

  // Get job status
  const status = stateManager.getJobStatus(id);

  if (!status) {
    return {
      data: {
        id,
        state: "Not Found",
        retry: 0,
        detail: null,
      },
    };
  }

  return {
    data: {
      id: status.id,
      state: status.state,
      retry: status.retry || 0,
      detail: status.detail !== undefined ? status.detail : null,
    },
  };
});

/**
 * Get threat modeling trail (reasoning data)
 * Matches Python backend: check_trail(job_id)
 *
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Response with trail data: { data: { id: string, assets: string, flows: string, gaps: Array, threats: Array } }
 */
export const getThreatModelingTrail = withErrorHandling(async (id) => {
  console.log("getThreatModelingTrail called", { id });

  // Validate parameters
  validateParams({ id }, ["id"]);

  // Get job trail
  const trail = stateManager.getJobTrail(id);

  if (!trail) {
    return {
      data: {
        id,
        assets: "",
        flows: "",
        gaps: [],
        threats: [],
      },
    };
  }

  return {
    data: {
      id: trail.id,
      assets: trail.assets || "",
      flows: trail.flows || "",
      gaps: trail.gaps || [],
      threats: trail.threats || [],
    },
  };
});

/**
 * Get threat modeling results
 * Matches Python backend: fetch_results(job_id)
 *
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Response with results: { data: { job_id: string, state: string, item: Object } }
 */
export const getThreatModelingResults = withErrorHandling(async (id) => {
  console.log("getThreatModelingResults called", { id });

  // Validate parameters
  validateParams({ id }, ["id"]);

  // Get job results
  const results = stateManager.getJobResults(id);

  if (!results) {
    return {
      data: {
        job_id: id,
        state: "Not Found",
        item: null,
      },
    };
  }

  return {
    data: {
      job_id: id,
      state: "Found",
      item: results,
    },
  };
});

/**
 * Get all threat modeling results for current user
 * Matches Python backend: fetch_all(owner)
 *
 * @returns {Promise<Object>} Response with all results: { data: { catalogs: Array } }
 */
export const getThreatModelingAllResults = withErrorHandling(async () => {
  console.log("getThreatModelingAllResults called");

  // Get all jobs from index
  const allJobs = stateManager.getAllJobs();

  // Get full results for each job
  const catalogs = allJobs
    .map((jobMeta) => {
      const results = stateManager.getJobResults(jobMeta.id);
      return results || jobMeta;
    })
    .filter(Boolean);

  return {
    data: {
      catalogs,
    },
  };
});

/**
 * Delete threat model
 * Matches Python backend: delete_tm(job_id, owner)
 *
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Response with deletion status: { data: { job_id: string, state: string } }
 */
export const deleteTm = withErrorHandling(async (id) => {
  console.log("deleteTm called", { id });

  // Validate parameters
  validateParams({ id }, ["id"]);

  // Check if job exists
  const results = stateManager.getJobResults(id);
  if (!results) {
    throw new ThreatModelingError("NOT_FOUND", `Job ${id} not found`, id);
  }

  // Delete uploaded file if exists
  if (results.s3_location) {
    stateManager.deleteUploadedFile(results.s3_location);
  }

  // Clear all job data
  stateManager.clearJobData(id);

  return {
    data: {
      job_id: id,
      state: "Deleted",
    },
  };
});
