/**
 * Agent Executor for Lightning Mode
 * Handles execution of the LangGraph threat modeling workflow
 */

import { v4 as uuidv4 } from 'uuid';
import { createThreatModelingWorkflow } from '../agents/threatDesigner.js';
import { initializeModels } from '../services/modelService.js';
import stateManager from '../storage/stateManager.js';
import { ThreatModelingError, validateCredentials } from './errors.js';
import { getCredentials } from '../config/credentials.js';

// Job states
const JobState = {
  START: 'START',
  ASSETS: 'ASSETS',
  FLOW: 'FLOW',
  THREAT: 'THREAT',
  THREAT_RETRY: 'THREAT_RETRY',
  FINALIZE: 'FINALIZE',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
};

/**
 * Initialize model configuration for agent execution
 * @param {number} reasoning - Reasoning/retry count
 * @returns {Object} Configuration object with model instances
 */
function initializeModelConfig(reasoning = 0) {
  const credentials = getCredentials();
  validateCredentials(credentials);

  // Initialize all models with granular configuration
  const models = initializeModels(reasoning);

  // Build configuration object with all model instances
  return {
    configurable: {
      // Node-specific models
      model_assets: models.assets_model,
      model_flows: models.flows_model,
      model_threats: models.threats_model,
      model_gaps: models.gaps_model,
      
      // Utility models
      model_summary: models.summary_model,
      model_struct: models.struct_model,
      
      // Workflow configuration
      reasoning: reasoning > 0,
      max_retry: 15
    }
  };
}

/**
 * Initialize state for new threat modeling job
 * @param {Object} params - Job parameters
 * @returns {Object} Initial state
 */
function initializeNewJobState(params) {
  const {
    id,
    s3_location,
    iteration,
    reasoning,
    description,
    assumptions,
    title,
    instructions
  } = params;

  // Get uploaded file data if s3_location is provided
  let image_data = null;
  if (s3_location) {
    const fileData = stateManager.getUploadedFile(s3_location);
    if (fileData) {
      try {
        // Parse the stored JSON object
        const parsed = JSON.parse(fileData);
        // Extract the base64 data (may be null if image was too large)
        image_data = parsed.data || null;
        if (!image_data && parsed.error) {
          console.warn(`Image data not available: ${parsed.error}`);
        }
      } catch (error) {
        // If parsing fails, assume it's raw base64 data
        image_data = fileData;
      }
    }
  }

  return {
    job_id: id,
    s3_location: s3_location || '',
    owner: 'LIGHTNING_USER',
    title: title || '',
    description: description || '',
    assumptions: assumptions || [],
    iteration: iteration || 0,
    retry: 1, // Always start at 1 - retry is the iteration counter, reasoning is for model config
    image_data,
    replay: false,
    instructions: instructions || null,
    summary: null,
    assets: null,
    system_architecture: null,
    threat_list: null,
    gap: [],
    stop: false
  };
}

/**
 * Initialize state for replay job
 * @param {string} id - Job ID to replay
 * @param {Object} params - Additional parameters
 * @returns {Object} Replay state
 */
function initializeReplayState(id, params) {
  const { iteration, reasoning, instructions } = params;

  // Get existing results
  const existingResults = stateManager.getJobResults(id);
  if (!existingResults) {
    throw new ThreatModelingError(
      'NOT_FOUND',
      `Job ${id} not found for replay`,
      id
    );
  }

  // Create backup of current state
  const backup = {
    assets: existingResults.assets,
    system_architecture: existingResults.system_architecture,
    threat_list: existingResults.threat_list
  };

  // Update results with backup
  stateManager.updateJobResults(id, { backup });

  // Get uploaded file data if s3_location is provided
  let image_data = null;
  if (existingResults.s3_location) {
    const fileData = stateManager.getUploadedFile(existingResults.s3_location);
    if (fileData) {
      try {
        // Parse the stored JSON object
        const parsed = JSON.parse(fileData);
        // Extract the base64 data (may be null if image was too large)
        image_data = parsed.data || null;
        if (!image_data && parsed.error) {
          console.warn(`Image data not available: ${parsed.error}`);
        }
      } catch (error) {
        // If parsing fails, assume it's raw base64 data
        image_data = fileData;
      }
    }
  }

  return {
    job_id: id,
    s3_location: existingResults.s3_location || '',
    owner: 'LIGHTNING_USER',
    title: existingResults.title || '',
    description: existingResults.description || '',
    assumptions: existingResults.assumptions || [],
    iteration: iteration || 0,
    retry: 1, // Always reset retry to 1 for replay to avoid using previous run's retry count
    image_data,
    replay: true,
    instructions: instructions || null,
    summary: existingResults.summary || null,
    assets: existingResults.assets || null,
    system_architecture: existingResults.system_architecture || null,
    threat_list: existingResults.threat_list || null,
    gap: [],
    stop: false
  };
}

/**
 * Execute the threat modeling agent workflow
 * @param {Object} params - Execution parameters
 * @returns {Promise<Object>} Execution result with job ID
 */
export async function executeAgent(params) {
  const {
    s3_location,
    id,
    iteration,
    reasoning,
    description,
    assumptions,
    title,
    replay = false,
    instructions
  } = params;

  // Generate job ID if not provided
  const jobId = id || uuidv4();

  try {
    // Initialize state based on replay flag
    let initialState;
    if (replay) {
      initialState = initializeReplayState(jobId, {
        iteration,
        reasoning,
        instructions
      });
    } else {
      initialState = initializeNewJobState({
        id: jobId,
        s3_location,
        iteration,
        reasoning,
        description,
        assumptions,
        title,
        instructions
      });
    }

    // Initialize job status
    stateManager.setJobStatus(jobId, JobState.START, reasoning || 1);

    // Initialize job trail
    stateManager.setJobTrail(jobId, {
      id: jobId,
      assets: '',
      flows: '',
      gaps: [],
      threats: []
    });

    // Add job to index if not replay
    if (!replay) {
      stateManager.addJobToIndex(jobId, {
        title: title || '',
        owner: 'LIGHTNING_USER',
        s3_location: s3_location || '',
        retry: reasoning || 1
      });
    }

    // Execute workflow in background (simulate async execution)
    executeWorkflowBackground(jobId, initialState, reasoning || 1);

    return { id: jobId };
  } catch (error) {
    console.error('Error executing agent:', error);

    // Update job status to failed
    stateManager.setJobStatus(jobId, JobState.FAILED, reasoning || 1);

    // Re-throw as ThreatModelingError if not already
    if (error instanceof ThreatModelingError) {
      throw error;
    }

    throw new ThreatModelingError(
      'INTERNAL_ERROR',
      `Failed to execute agent: ${error.message}`,
      jobId
    );
  }
}

/**
 * Execute workflow in background (Promise-based simulation)
 * @param {string} jobId - Job ID
 * @param {Object} initialState - Initial state
 * @param {number} reasoning - Reasoning count
 */
function executeWorkflowBackground(jobId, initialState, reasoning) {
  // Execute in next tick to simulate background execution
  setTimeout(async () => {
    try {
      console.log(`Starting background execution for job ${jobId}`);

      // Initialize model configuration
      const config = initializeModelConfig(reasoning);

      // Create and compile workflow
      const workflow = createThreatModelingWorkflow();

      // Execute workflow
      console.log('Invoking workflow...');
      const result = await workflow.invoke(initialState, config);

      console.log(`Workflow completed for job ${jobId}`);
      console.log('Final state:', result);

      // Results are already stored by the finalize node
      // Just log completion
      console.log(`Job ${jobId} completed successfully`);
    } catch (error) {
      console.error(`Background execution failed for job ${jobId}:`, error);

      // Update job status to failed
      stateManager.setJobStatus(jobId, JobState.FAILED, reasoning);

      // Store error in results
      const existingResults = stateManager.getJobResults(jobId) || {};
      stateManager.setJobResults(jobId, {
        ...existingResults,
        error: error.message,
        error_type: error.name
      });
    }
  }, 0);
}

/**
 * Check if a job is currently executing
 * @param {string} jobId - Job ID
 * @returns {boolean} True if job is executing
 */
export function isJobExecuting(jobId) {
  const status = stateManager.getJobStatus(jobId);
  if (!status) {
    return false;
  }

  const executingStates = [
    JobState.START,
    JobState.ASSETS,
    JobState.FLOW,
    JobState.THREAT,
    JobState.THREAT_RETRY,
    JobState.FINALIZE
  ];

  return executingStates.includes(status.state);
}

/**
 * Wait for job to complete (with timeout)
 * @param {string} jobId - Job ID
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5 minutes)
 * @returns {Promise<Object>} Job results
 */
export async function waitForJobCompletion(jobId, timeoutMs = 300000) {
  const startTime = Date.now();
  const pollInterval = 1000; // Poll every second

  while (Date.now() - startTime < timeoutMs) {
    const status = stateManager.getJobStatus(jobId);

    if (!status) {
      throw new ThreatModelingError(
        'NOT_FOUND',
        `Job ${jobId} not found`,
        jobId
      );
    }

    if (status.state === JobState.COMPLETE) {
      const results = stateManager.getJobResults(jobId);
      return results;
    }

    if (status.state === JobState.FAILED) {
      const results = stateManager.getJobResults(jobId);
      const errorMsg = results?.error || 'Job execution failed';
      throw new ThreatModelingError(
        'INTERNAL_ERROR',
        errorMsg,
        jobId
      );
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new ThreatModelingError(
    'INTERNAL_ERROR',
    `Job ${jobId} execution timeout`,
    jobId
  );
}

