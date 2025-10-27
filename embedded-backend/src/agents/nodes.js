/**
 * LangGraph Agent Nodes for Threat Modeling Workflow
 * 
 * This module implements all node functions for the threat modeling agent workflow,
 * converted from Python backend/threat_designer/nodes.py to JavaScript.
 */

import { SystemMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import { MessageBuilder, list_to_string } from '../services/messageBuilder.js';
import {
  summary_prompt,
  asset_prompt,
  flow_prompt,
  threats_prompt,
  threats_improve_prompt,
  gap_prompt
} from '../services/prompts.js';
import {
  SummaryStateSchema,
  AssetsListSchema,
  FlowsListSchema,
  ThreatsListSchema,
  ContinueThreatModelingSchema
} from './state.js';
import stateManager from '../storage/stateManager.js';

// Constants
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

const FLUSH_MODE_REPLACE = 0;
const FLUSH_MODE_APPEND = 1;
const MAX_RETRY_DEFAULT = 15;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract reasoning content from model response
 * @param {Object} response - AIMessage response from model
 * @returns {string|null} Reasoning content text or null
 */
function extractReasoningContent(response) {
  if (response.content && Array.isArray(response.content) && response.content.length > 0) {
    const firstContent = response.content[0];
    if (firstContent && typeof firstContent === 'object') {
      const reasoningContent = firstContent.reasoning_content;
      if (reasoningContent && reasoningContent.text) {
        return reasoningContent.text;
      }
    }
  }
  return null;
}

// ============================================================================
// NODE FUNCTIONS
// ============================================================================

/**
 * Generate architecture summary
 * @param {Object} state - Agent state
 * @param {Object} config - Runnable configuration
 * @returns {Object} Updated state with summary
 */
export async function generateSummary(state, config) {
  console.log('Node: generateSummary');
  
  // If summary already exists, skip generation
  if (state.summary) {
    return { image_data: state.image_data };
  }

  const job_id = state.job_id || 'unknown';
  
  try {
    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || '',
      list_to_string(state.assumptions || [])
    );
    
    const message = msg_builder.createSummaryMessage(40);
    const system_prompt = new SystemMessage({ content: summary_prompt() });
    const messages = [system_prompt, message];
    
    // Get model from config
    const model = config.configurable?.model_summary;
    if (!model) {
      throw new Error('Summary model not found in config');
    }
    
    // Use withStructuredOutput with includeRaw to get both structured output and raw response
    const model_with_structure = model.withStructuredOutput(SummaryStateSchema, {
      includeRaw: true
    });
    
    // Invoke model
    const result = await model_with_structure.invoke(messages);
    
    // Extract structured response and raw response
    const structured_response = result.parsed;
    
    return {
      image_data: state.image_data,
      summary: structured_response.summary
    };
  } catch (error) {
    console.error('Error in generateSummary:', error);
    stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
    throw error;
  }
}

/**
 * Define assets from architecture analysis
 * @param {Object} state - Agent state
 * @param {Object} config - Runnable configuration
 * @returns {Object} Updated state with assets
 */
export async function defineAssets(state, config) {
  console.log('Node: defineAssets');
  
  const job_id = state.job_id || 'unknown';
  
  try {
    // Update job state
    stateManager.setJobStatus(job_id, JobState.ASSETS, state.retry || 0);
    
    // Prepare message
    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || '',
      list_to_string(state.assumptions || [])
    );
    
    const human_message = msg_builder.createAssetMessage();
    const system_prompt = new SystemMessage({ content: asset_prompt() });
    const messages = [system_prompt, human_message];
    
    // Get model from config
    const model = config.configurable?.model_assets;
    if (!model) {
      throw new Error('Assets model not found in config');
    }
    
    // Use withStructuredOutput with includeRaw to get both structured output and raw response
    const model_with_structure = model.withStructuredOutput(AssetsListSchema, {
      includeRaw: true
    });
    
    // Invoke model
    const result = await model_with_structure.invoke(messages);
    
    // Extract structured response and raw response
    const structured_response = result.parsed;
    const raw_response = result.raw;
    
    // Extract reasoning if enabled
    const reasoning = config.configurable?.reasoning || false;
    if (reasoning && raw_response) {
      const reasoningContent = extractReasoningContent(raw_response);
      if (reasoningContent) {
        stateManager.updateJobTrail(job_id, { assets: reasoningContent });
      }
    }
    
    return { assets: structured_response };
  } catch (error) {
    console.error('Error in defineAssets:', error);
    stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
    throw error;
  }
}

/**
 * Define data flows between assets
 * @param {Object} state - Agent state
 * @param {Object} config - Runnable configuration
 * @returns {Object} Updated state with flows
 */
export async function defineFlows(state, config) {
  console.log('Node: defineFlows');
  
  const job_id = state.job_id || 'unknown';
  
  try {
    // Update job state
    stateManager.setJobStatus(job_id, JobState.FLOW, state.retry || 0);
    
    // Prepare message
    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || '',
      list_to_string(state.assumptions || [])
    );
    
    const human_message = msg_builder.createSystemFlowsMessage(state.assets);
    const system_prompt = new SystemMessage({ content: flow_prompt() });
    const messages = [system_prompt, human_message];
    
    // Get model from config
    const model = config.configurable?.model_flows;
    if (!model) {
      throw new Error('Flows model not found in config');
    }
    
    // Use withStructuredOutput with includeRaw to get both structured output and raw response
    const model_with_structure = model.withStructuredOutput(FlowsListSchema, {
      includeRaw: true
    });
    
    // Invoke model
    const result = await model_with_structure.invoke(messages);
    
    // Extract structured response and raw response
    const structured_response = result.parsed;
    const raw_response = result.raw;
    
    // Extract reasoning if enabled
    const reasoning = config.configurable?.reasoning || false;
    if (reasoning && raw_response) {
      const reasoningContent = extractReasoningContent(raw_response);
      if (reasoningContent) {
        stateManager.updateJobTrail(job_id, { flows: reasoningContent });
      }
    }
    
    return { system_architecture: structured_response };
  } catch (error) {
    console.error('Error in defineFlows:', error);
    stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
    throw error;
  }
}

/**
 * Define threats and mitigations with iteration logic
 * @param {Object} state - Agent state
 * @param {Object} config - Runnable configuration
 * @returns {Command} Command to route to next node
 */
export async function defineThreats(state, config) {
  console.log('Node: defineThreats');
  
  const job_id = state.job_id || 'unknown';
  const retry_count = parseInt(state.retry || 1);
  const iteration = parseInt(state.iteration || 0);
  const max_retry = config.configurable?.max_retry || MAX_RETRY_DEFAULT;
  
  try {
    // Check if should finalize
    const max_retries_reached = retry_count > max_retry;
    const iteration_limit_reached = (retry_count > iteration) && (iteration !== 0);
    
    if (max_retries_reached || iteration_limit_reached) {
      return new Command({ goto: 'finalize' });
    }
    
    // Update job state based on retry count
    if (retry_count > 1) {
      stateManager.setJobStatus(job_id, JobState.THREAT_RETRY, retry_count);
    } else {
      stateManager.setJobStatus(job_id, JobState.THREAT, retry_count);
    }
    
    // Prepare messages
    const gap = state.gap || [];
    const threat_list = state.threat_list;
    const threats = threat_list?.threats || [];
    
    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || '',
      list_to_string(state.assumptions || [])
    );
    
    let human_message;
    let system_prompt;
    
    if (retry_count > 1 || threats.length > 0) {
      // Improvement iteration
      human_message = msg_builder.createThreatImproveMessage(
        state.assets,
        state.system_architecture,
        state.threat_list,
        gap
      );
      
      if (state.replay && state.instructions) {
        system_prompt = new SystemMessage({
          content: threats_improve_prompt(state.instructions)
        });
      } else {
        system_prompt = new SystemMessage({ content: threats_improve_prompt() });
      }
    } else {
      // Initial threat identification
      human_message = msg_builder.createThreatMessage(
        state.assets,
        state.system_architecture
      );
      
      if (state.replay && state.instructions) {
        system_prompt = new SystemMessage({
          content: threats_prompt(state.instructions)
        });
      } else {
        system_prompt = new SystemMessage({ content: threats_improve_prompt() });
      }
    }
    
    const messages = [system_prompt, human_message];
    
    // Get model from config
    const model = config.configurable?.model_threats;
    if (!model) {
      throw new Error('Threats model not found in config');
    }
    
    // Use withStructuredOutput with includeRaw to get both structured output and raw response
    const model_with_structure = model.withStructuredOutput(ThreatsListSchema, {
      includeRaw: true
    });
    
    // Invoke model
    const result = await model_with_structure.invoke(messages);
    
    // Extract structured response and raw response
    const structured_response = result.parsed;
    const raw_response = result.raw;
    
    // Extract reasoning if enabled
    const reasoning = config.configurable?.reasoning || false;
    if (reasoning && raw_response) {
      const reasoningContent = extractReasoningContent(raw_response);
      if (reasoningContent) {
        const flush = retry_count === 1 ? FLUSH_MODE_REPLACE : FLUSH_MODE_APPEND;
        
        if (flush === FLUSH_MODE_REPLACE) {
          stateManager.updateJobTrail(job_id, { threats: [reasoningContent] });
        } else {
          stateManager.updateJobTrail(job_id, { threats: reasoningContent });
        }
      }
    }
    
    // Create next command
    const next_retry = retry_count + 1;
    
    if (iteration === 0) {
      // Auto mode: go to gap analysis (AI decides when to stop)
      return new Command({
        goto: 'gap_analysis',
        update: {
          threat_list: structured_response,
          retry: next_retry
        }
      });
    }
    
    // Fixed iteration mode: loop back to threats directly (bypass gap analysis)
    return new Command({
      goto: 'define_threats',
      update: {
        threat_list: structured_response,
        retry: next_retry
      }
    });
  } catch (error) {
    console.error('Error in defineThreats:', error);
    stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
    throw error;
  }
}

/**
 * Analyze gaps in the threat model
 * @param {Object} state - Agent state
 * @param {Object} config - Runnable configuration
 * @returns {Command} Command to route to next node
 */
export async function gapAnalysis(state, config) {
  console.log('Node: gapAnalysis');
  
  const job_id = state.job_id || 'unknown';
  
  try {
    // Prepare messages
    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || '',
      list_to_string(state.assumptions || [])
    );
    
    const human_message = msg_builder.createGapAnalysisMessage(
      state.assets,
      state.system_architecture,
      state.threat_list || '',
      state.gap || []
    );
    
    let system_prompt;
    if (state.replay && state.instructions) {
      system_prompt = new SystemMessage({
        content: gap_prompt(state.instructions)
      });
    } else {
      system_prompt = new SystemMessage({ content: gap_prompt() });
    }
    
    const messages = [system_prompt, human_message];
    
    // Get model from config
    const model = config.configurable?.model_gaps;
    if (!model) {
      throw new Error('Gaps model not found in config');
    }
    
    // Use withStructuredOutput with includeRaw to get both structured output and raw response
    const model_with_structure = model.withStructuredOutput(ContinueThreatModelingSchema, {
      includeRaw: true
    });
    
    // Invoke model
    const result = await model_with_structure.invoke(messages);
    
    // Extract structured response and raw response
    const structured_response = result.parsed;
    const raw_response = result.raw;
    
    // Extract reasoning if enabled
    const reasoning = config.configurable?.reasoning || false;
    if (reasoning && raw_response) {
      const reasoningContent = extractReasoningContent(raw_response);
      if (reasoningContent) {
        const retry_count = parseInt(state.retry || 1);
        const flush = retry_count === 1 ? FLUSH_MODE_REPLACE : FLUSH_MODE_APPEND;
        
        if (flush === FLUSH_MODE_REPLACE) {
          stateManager.updateJobTrail(job_id, { gaps: [reasoningContent] });
        } else {
          stateManager.updateJobTrail(job_id, { gaps: reasoningContent });
        }
      }
    }
    
    // Route based on stop flag
    if (structured_response.stop) {
      return new Command({ goto: 'finalize' });
    }
    
    return new Command({
      goto: 'define_threats',
      update: { gap: [structured_response.gap] }
    });
  } catch (error) {
    console.error('Error in gapAnalysis:', error);
    stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
    throw error;
  }
}

/**
 * Finalize the threat modeling workflow
 * @param {Object} state - Agent state
 * @returns {Object} Final state updates
 */
export async function finalize(state) {
  console.log('Node: finalize');
  
  const job_id = state.job_id || 'unknown';
  
  try {
    // Update job state to FINALIZE
    stateManager.setJobStatus(job_id, JobState.FINALIZE, state.retry || 0);
    
    // Store final results
    const results = {
      job_id,
      s3_location: state.s3_location || '',
      owner: state.owner || 'LIGHTNING_USER',
      title: state.title || '',
      summary: state.summary || '',
      description: state.description || '',
      assumptions: state.assumptions || [],
      assets: state.assets || null,
      system_architecture: state.system_architecture || null,
      threat_list: state.threat_list || null,
      retry: state.retry || 0,
      backup: null
    };
    
    stateManager.setJobResults(job_id, results);
    
    // Small delay to simulate finalization processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update job state to COMPLETE
    stateManager.setJobStatus(job_id, JobState.COMPLETE, state.retry || 0);
    
    return {};
  } catch (error) {
    console.error('Error in finalize:', error);
    stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
    throw error;
  }
}

// ============================================================================
// ROUTING FUNCTIONS
// ============================================================================

/**
 * Route workflow based on replay flag
 * @param {Object} state - Agent state
 * @returns {string} Route name ('replay' or 'full')
 */
export function routeReplay(state) {
  console.log('Routing: routeReplay');
  
  if (!state.replay) {
    return 'full';
  }
  
  const job_id = state.job_id || 'unknown';
  
  try {
    // Clear previous trail data for replay
    stateManager.updateJobTrail(job_id, {
      threats: [],
      gaps: []
    });
    
    // Restore from backup if available
    const results = stateManager.getJobResults(job_id);
    if (results && results.backup) {
      // Restore backup data to current results
      const restored = {
        ...results,
        assets: results.backup.assets,
        system_architecture: results.backup.system_architecture,
        threat_list: results.backup.threat_list
      };
      stateManager.setJobResults(job_id, restored);
    }
    
    return 'replay';
  } catch (error) {
    console.error('Error in routeReplay:', error);
    return 'full';
  }
}

/**
 * Determine if should continue with threats or move to gap analysis
 * This is called after defineThreats when iteration > 0
 * @param {Object} state - Agent state
 * @returns {string} Route name ('gap_analysis' or 'finalize')
 */
export function shouldContinue(state) {
  console.log('Routing: shouldContinue');
  
  const iteration = parseInt(state.iteration || 0);
  
  // If iteration is 0, always go to gap_analysis
  // This shouldn't be called when iteration is 0, but handle it anyway
  if (iteration === 0) {
    return 'gap_analysis';
  }
  
  // For iteration > 0, the defineThreats node already handles routing
  // This function is here for compatibility but shouldn't be reached
  // in the current workflow design
  return 'finalize';
}

/**
 * Determine if should retry threats or finalize after gap analysis
 * @param {Object} state - Agent state
 * @returns {string} Route name ('continue' or 'finalize')
 */
export function shouldRetry(state) {
  console.log('Routing: shouldRetry');
  
  // This routing is handled by the gapAnalysis node itself
  // which returns a Command with the appropriate goto
  // This function is here for compatibility
  return 'continue';
}
