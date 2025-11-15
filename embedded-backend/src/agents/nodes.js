/**
 * LangGraph Agent Nodes for Threat Modeling Workflow
 *
 * This module implements all node functions for the threat modeling agent workflow,
 * converted from Python backend/threat_designer/nodes.py to JavaScript.
 *
 * PROVIDER-AGNOSTIC DESIGN:
 * All nodes use LangChain's unified interface to ensure identical behavior
 * regardless of the selected provider (Amazon Bedrock or OpenAI):
 *
 * 1. Structured Output: Uses bindTools() instead of withStructuredOutput()
 *    to support reasoning/thinking modes while maintaining tool calling
 *
 * 2. Tool Calling: Extracts structured responses via response.tool_calls[0].args
 *    which works identically for both Bedrock and OpenAI
 *
 * 3. Reasoning Extraction: extractReasoningContent() checks both:
 *    - Bedrock format: response.content[0].reasoning_content.text
 *    - OpenAI format: response.additional_kwargs.reasoning_content
 *
 * 4. Error Handling: Provider-specific errors are mapped to standardized
 *    error types in the agent executor layer
 *
 * The workflow behavior is identical regardless of provider selection.
 */

import { SystemMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { MessageBuilder, list_to_string } from "../services/messageBuilder.js";
import {
  summary_prompt,
  asset_prompt,
  flow_prompt,
  threats_prompt,
  threats_improve_prompt,
  gap_prompt,
} from "../services/prompts.js";
import {
  SummaryStateSchema,
  AssetsListSchema,
  FlowsListSchema,
  ThreatsListSchema,
  ContinueThreatModelingSchema,
} from "./state.js";
import stateManager from "../storage/stateManager.js";

// Constants
const JobState = {
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

const FLUSH_MODE_REPLACE = 0;
const FLUSH_MODE_APPEND = 1;
const MAX_RETRY_DEFAULT = 15;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if workflow was aborted and throw appropriate error
 * @param {Object} config - Runnable configuration
 * @param {string} nodeName - Name of the node checking for abort
 * @throws {Error} AbortError if workflow was aborted
 */
function checkAbortSignal(config, nodeName) {
  if (config?.signal?.aborted) {
    console.log(`Workflow aborted, skipping ${nodeName}`);
    const error = new Error("AbortError");
    error.name = "AbortError";
    throw error;
  }
}

/**
 * Check if job was cancelled (not in active registry or status is CANCELLED)
 * @param {string} jobId - Job ID
 * @returns {boolean} True if job was cancelled
 */
function isJobCancelled(jobId) {
  const status = stateManager.getJobStatus(jobId);
  return status?.state === JobState.CANCELLED;
}

/**
 * Extract reasoning content from model response (provider-agnostic)
 * Supports both Bedrock and OpenAI reasoning formats
 * @param {Object} response - AIMessage response from model
 * @returns {string|null} Reasoning content text or null
 */
function extractReasoningContent(response) {
  // Bedrock format: reasoning_content in content array
  if (response.content && Array.isArray(response.content) && response.content.length > 0) {
    const firstContent = response.content[0];
    if (firstContent && typeof firstContent === "object") {
      const reasoningContent = firstContent.reasoning_content;
      if (reasoningContent && reasoningContent.text) {
        return reasoningContent.text;
      }
    }
  }

  // OpenAI format: reasoning_content in additional_kwargs
  if (response.additional_kwargs) {
    const reasoningContent = response.additional_kwargs.reasoning_content;
    if (reasoningContent) {
      // OpenAI returns reasoning_content as a string directly
      return typeof reasoningContent === "string"
        ? reasoningContent
        : reasoningContent.text || null;
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
  console.log("Node: generateSummary");

  // Check if workflow was aborted
  checkAbortSignal(config, "generateSummary");

  // If summary already exists, skip generation
  if (state.summary) {
    console.log("Summary already exists, skipping generation");
    return { image_data: state.image_data };
  }

  const job_id = state.job_id || "unknown";

  try {
    // Check if job was cancelled before starting work
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled, aborting generateSummary`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || "",
      list_to_string(state.assumptions || [])
    );

    const message = msg_builder.createSummaryMessage(40);
    const system_prompt = new SystemMessage({ content: summary_prompt() });
    const messages = [system_prompt, message];

    // Get model from config
    const model = config.configurable?.model_summary;
    if (!model) {
      const error = new Error("Summary model not found in config");
      console.error("Configuration error:", error.message);
      throw error;
    }

    // Use bindTools() instead of withStructuredOutput to allow thinking with tool calling
    // This is provider-agnostic and works identically for both Bedrock and OpenAI
    // Summary model doesn't use reasoning and doesn't support tool_choice, so omit it
    const summaryTool = tool(async (input) => input, {
      name: "summary_state",
      description: "Generate a summary of the architecture",
      schema: SummaryStateSchema,
    });
    const model_with_tools = model.bindTools([summaryTool]);

    // Invoke model
    console.log(`Invoking summary model for job ${job_id}`);
    const response = await model_with_tools.invoke(messages);

    // Check again after async operation
    checkAbortSignal(config, "generateSummary (after model invocation)");

    // Check if job was cancelled during model invocation
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled during model invocation`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Extract structured response from tool calls
    const structured_response = response.tool_calls[0].args;

    console.log(`Summary generated successfully for job ${job_id}`);
    return {
      image_data: state.image_data,
      summary: structured_response.summary,
    };
  } catch (error) {
    // Check if this is an abort/cancellation error
    const isAbortError = error.name === "AbortError" || error.message === "AbortError";

    if (isAbortError) {
      console.log(`generateSummary aborted for job ${job_id}`);
    } else {
      console.error(`Error in generateSummary for job ${job_id}:`, error);
      console.error("Error details:", { name: error.name, message: error.message });

      // Only update status if job wasn't cancelled
      if (!isJobCancelled(job_id)) {
        try {
          stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
        } catch (storageError) {
          console.error(`Failed to update job status for ${job_id}:`, storageError);
        }
      }
    }
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
  console.log("Node: defineAssets");

  // Check if workflow was aborted
  checkAbortSignal(config, "defineAssets");

  const job_id = state.job_id || "unknown";

  try {
    // Check if job was cancelled before updating status
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled, aborting defineAssets`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Update job state
    stateManager.setJobStatus(job_id, JobState.ASSETS, state.retry || 0);

    // Prepare message
    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || "",
      list_to_string(state.assumptions || [])
    );

    const human_message = msg_builder.createAssetMessage();
    const system_prompt = new SystemMessage({ content: asset_prompt() });
    const messages = [system_prompt, human_message];

    // Get model from config
    const model = config.configurable?.model_assets;
    if (!model) {
      const error = new Error("Assets model not found in config");
      console.error("Configuration error:", error.message);
      throw error;
    }

    // Use bindTools() for provider-agnostic structured output with tool calling
    // This works identically for both Bedrock and OpenAI models
    // When reasoning is enabled, don't force tool_choice to allow thinking mode
    const reasoning = config.configurable?.reasoning || 0;
    const assetsTool = tool(async (input) => input, {
      name: "assets_list",
      description: "Define the list of system assets",
      schema: AssetsListSchema,
    });

    // Determine tool_choice based on model type and reasoning
    const modelId = model.model || "";
    const isOpenAI = modelId.startsWith("gpt-") || modelId.startsWith("o1-");
    const isSonnet = modelId.includes("sonnet");

    let model_with_tools;
    if (isOpenAI) {
      // OpenAI models always use explicit tool name (even with reasoning enabled)
      model_with_tools = model.bindTools([assetsTool], { tool_choice: "assets_list" });
    } else if (!isSonnet) {
      // Haiku 4.5 doesn't support tool_choice
      model_with_tools = model.bindTools([assetsTool]);
    } else if (reasoning > 0) {
      // Bedrock with reasoning: don't force tool_choice to allow thinking mode
      model_with_tools = model.bindTools([assetsTool]);
    } else {
      // Bedrock Sonnet without reasoning uses 'any'
      model_with_tools = model.bindTools([assetsTool], { tool_choice: "any" });
    }

    // Invoke model
    console.log(`Invoking assets model for job ${job_id}`);
    const response = await model_with_tools.invoke(messages);

    // Check again after async operation
    checkAbortSignal(config, "defineAssets (after model invocation)");

    // Check if job was cancelled during model invocation
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled during model invocation`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Extract structured response from tool calls
    const structured_response = response.tool_calls[0].args;

    // Extract reasoning if enabled
    if (reasoning > 0) {
      const reasoningContent = extractReasoningContent(response);
      if (reasoningContent) {
        stateManager.updateJobTrail(job_id, { assets: reasoningContent });
      }
    }

    console.log(`Assets defined successfully for job ${job_id}`);
    return { assets: structured_response };
  } catch (error) {
    // Check if this is an abort/cancellation error
    const isAbortError = error.name === "AbortError" || error.message === "AbortError";

    if (isAbortError) {
      console.log(`defineAssets aborted for job ${job_id}`);
    } else {
      console.error(`Error in defineAssets for job ${job_id}:`, error);
      console.error("Error details:", { name: error.name, message: error.message });

      // Only update status if job wasn't cancelled
      if (!isJobCancelled(job_id)) {
        try {
          stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
        } catch (storageError) {
          console.error(`Failed to update job status for ${job_id}:`, storageError);
        }
      }
    }
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
  console.log("Node: defineFlows");

  // Check if workflow was aborted
  checkAbortSignal(config, "defineFlows");

  const job_id = state.job_id || "unknown";

  try {
    // Check if job was cancelled before updating status
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled, aborting defineFlows`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Update job state
    stateManager.setJobStatus(job_id, JobState.FLOW, state.retry || 0);

    // Prepare message
    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || "",
      list_to_string(state.assumptions || [])
    );

    const human_message = msg_builder.createSystemFlowsMessage(state.assets);
    const system_prompt = new SystemMessage({ content: flow_prompt() });
    const messages = [system_prompt, human_message];

    // Get model from config
    const model = config.configurable?.model_flows;
    if (!model) {
      const error = new Error("Flows model not found in config");
      console.error("Configuration error:", error.message);
      throw error;
    }

    // Use bindTools() for provider-agnostic structured output with tool calling
    // This works identically for both Bedrock and OpenAI models
    // When reasoning is enabled, don't force tool_choice to allow thinking mode
    const reasoning = config.configurable?.reasoning || 0;
    const flowsTool = tool(async (input) => input, {
      name: "flows_list",
      description: "Define data flows, trust boundaries, and threat sources",
      schema: FlowsListSchema,
    });

    // Determine tool_choice based on model type and reasoning
    const modelId = model.model || "";
    const isOpenAI = modelId.startsWith("gpt-") || modelId.startsWith("o1-");
    const isSonnet = modelId.includes("sonnet");

    let model_with_tools;
    if (isOpenAI) {
      // OpenAI models always use explicit tool name (even with reasoning enabled)
      model_with_tools = model.bindTools([flowsTool], { tool_choice: "flows_list" });
    } else if (!isSonnet) {
      // Haiku 4.5 doesn't support tool_choice
      model_with_tools = model.bindTools([flowsTool]);
    } else if (reasoning > 0) {
      // Bedrock with reasoning: don't force tool_choice to allow thinking mode
      model_with_tools = model.bindTools([flowsTool]);
    } else {
      // Bedrock Sonnet without reasoning uses 'any'
      model_with_tools = model.bindTools([flowsTool], { tool_choice: "any" });
    }

    // Invoke model
    console.log(`Invoking flows model for job ${job_id}`);
    const response = await model_with_tools.invoke(messages);

    // Check again after async operation
    checkAbortSignal(config, "defineFlows (after model invocation)");

    // Check if job was cancelled during model invocation
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled during model invocation`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Extract structured response from tool calls
    const structured_response = response.tool_calls[0].args;

    // Extract reasoning if enabled
    if (reasoning > 0) {
      const reasoningContent = extractReasoningContent(response);
      if (reasoningContent) {
        stateManager.updateJobTrail(job_id, { flows: reasoningContent });
      }
    }

    console.log(`Flows defined successfully for job ${job_id}`);
    return { system_architecture: structured_response };
  } catch (error) {
    // Check if this is an abort/cancellation error
    const isAbortError = error.name === "AbortError" || error.message === "AbortError";

    if (isAbortError) {
      console.log(`defineFlows aborted for job ${job_id}`);
    } else {
      console.error(`Error in defineFlows for job ${job_id}:`, error);
      console.error("Error details:", { name: error.name, message: error.message });

      // Only update status if job wasn't cancelled
      if (!isJobCancelled(job_id)) {
        try {
          stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
        } catch (storageError) {
          console.error(`Failed to update job status for ${job_id}:`, storageError);
        }
      }
    }
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
  console.log("Node: defineThreats");

  // Check if workflow was aborted
  checkAbortSignal(config, "defineThreats");

  const job_id = state.job_id || "unknown";
  const retry_count = parseInt(state.retry || 0);
  const iteration = parseInt(state.iteration || 0);
  const max_retry = config.configurable?.max_retry || MAX_RETRY_DEFAULT;

  try {
    // Check if job was cancelled before starting work
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled, aborting defineThreats`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Check if we've completed enough iterations
    // retry_count is 0-indexed: 0 = first iteration, 1 = second iteration, etc.
    const max_retries_reached = retry_count >= max_retry;
    const iteration_limit_reached = retry_count >= iteration && iteration !== 0;

    if (max_retries_reached || iteration_limit_reached) {
      console.log(
        `Iteration limit reached for job ${job_id} (retry: ${retry_count}, iteration: ${iteration}, max: ${max_retry})`
      );
      // Go to finalize - use retry_count as-is (will be displayed correctly in finalize)
      stateManager.setJobStatus(job_id, JobState.FINALIZE, retry_count);
      return new Command({ goto: "finalize" });
    }

    // Update job state with display count (retry_count + 1 for 1-indexed display)
    // The retry_count in state is 0-indexed, but we display it as 1-indexed
    const display_count = retry_count + 1;
    if (retry_count > 0) {
      stateManager.setJobStatus(job_id, JobState.THREAT_RETRY, display_count);
    } else {
      stateManager.setJobStatus(job_id, JobState.THREAT, display_count);
    }

    // Prepare messages
    const gap = state.gap || [];
    const threat_list = state.threat_list;
    const threats = threat_list?.threats || [];

    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || "",
      list_to_string(state.assumptions || [])
    );

    let human_message;
    let system_prompt;

    if (retry_count > 0 || threats.length > 0) {
      // Improvement iteration
      human_message = msg_builder.createThreatImproveMessage(
        state.assets,
        state.system_architecture,
        state.threat_list,
        gap
      );

      if (state.replay && state.instructions) {
        system_prompt = new SystemMessage({
          content: threats_improve_prompt(state.instructions),
        });
      } else {
        system_prompt = new SystemMessage({ content: threats_improve_prompt() });
      }
    } else {
      // Initial threat identification
      human_message = msg_builder.createThreatMessage(state.assets, state.system_architecture);

      if (state.replay && state.instructions) {
        system_prompt = new SystemMessage({
          content: threats_prompt(state.instructions),
        });
      } else {
        system_prompt = new SystemMessage({ content: threats_improve_prompt() });
      }
    }

    const messages = [system_prompt, human_message];

    // Get model from config
    const model = config.configurable?.model_threats;
    if (!model) {
      throw new Error("Threats model not found in config");
    }

    // Use bindTools() for provider-agnostic structured output with tool calling
    // This works identically for both Bedrock and OpenAI models
    // When reasoning is enabled, don't force tool_choice to allow thinking mode
    const reasoning = config.configurable?.reasoning || 0;
    const threatsTool = tool(async (input) => input, {
      name: "threats_list",
      description: "Define the list of security threats",
      schema: ThreatsListSchema,
    });

    // Determine tool_choice based on model type and reasoning
    const modelId = model.model || "";
    const isOpenAI = modelId.startsWith("gpt-") || modelId.startsWith("o1-");
    const isSonnet = modelId.includes("sonnet");

    let model_with_tools;
    if (isOpenAI) {
      // OpenAI models always use explicit tool name (even with reasoning enabled)
      model_with_tools = model.bindTools([threatsTool], { tool_choice: "threats_list" });
    } else if (!isSonnet) {
      // Haiku 4.5 doesn't support tool_choice
      model_with_tools = model.bindTools([threatsTool]);
    } else if (reasoning > 0) {
      // Bedrock with reasoning: don't force tool_choice to allow thinking mode
      model_with_tools = model.bindTools([threatsTool]);
    } else {
      // Bedrock Sonnet without reasoning uses 'any'
      model_with_tools = model.bindTools([threatsTool], { tool_choice: "any" });
    }

    // Invoke model
    console.log(`Invoking threats model for job ${job_id} (iteration ${retry_count + 1})`);
    const response = await model_with_tools.invoke(messages);

    // Check again after async operation
    checkAbortSignal(config, "defineThreats (after model invocation)");

    // Check if job was cancelled during model invocation
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled during model invocation`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Extract structured response from tool calls
    const structured_response = response.tool_calls[0].args;

    // Extract reasoning if enabled
    if (reasoning > 0) {
      const reasoningContent = extractReasoningContent(response);
      if (reasoningContent) {
        const flush = retry_count === 0 ? FLUSH_MODE_REPLACE : FLUSH_MODE_APPEND;

        if (flush === FLUSH_MODE_REPLACE) {
          stateManager.updateJobTrail(job_id, { threats: [reasoningContent] });
        } else {
          stateManager.updateJobTrail(job_id, { threats: reasoningContent });
        }
      }
    }

    // Increment retry count for next iteration
    const next_retry = retry_count + 1;

    if (iteration === 0) {
      // Auto mode: go to gap analysis (AI decides when to stop)
      console.log(`Job ${job_id}: Auto mode (iteration 0), routing to gap analysis`);
      return new Command({
        goto: "gap_analysis",
        update: {
          threat_list: structured_response,
          retry: next_retry,
        },
      });
    }

    // Fixed iteration mode: loop back to threats directly (bypass gap analysis)
    console.log(`Job ${job_id}: Fixed iteration mode, looping back to threats`);
    return new Command({
      goto: "define_threats",
      update: {
        threat_list: structured_response,
        retry: next_retry,
      },
    });
  } catch (error) {
    // Check if this is an abort/cancellation error
    const isAbortError = error.name === "AbortError" || error.message === "AbortError";

    if (isAbortError) {
      console.log(`defineThreats aborted for job ${job_id}`);
    } else {
      console.error(`Error in defineThreats for job ${job_id}:`, error);
      console.error("Error details:", { name: error.name, message: error.message });

      // Only update status if job wasn't cancelled
      if (!isJobCancelled(job_id)) {
        try {
          stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
        } catch (storageError) {
          console.error(`Failed to update job status for ${job_id}:`, storageError);
        }
      }
    }
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
  console.log("Node: gapAnalysis");

  // Check if workflow was aborted
  checkAbortSignal(config, "gapAnalysis");

  const job_id = state.job_id || "unknown";

  try {
    // Check if job was cancelled before starting work
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled, aborting gapAnalysis`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Extract threat sources from state
    let threat_sources_str = null;
    const system_architecture = state.system_architecture;
    if (
      system_architecture &&
      system_architecture.threat_sources &&
      system_architecture.threat_sources.length > 0
    ) {
      const source_categories = system_architecture.threat_sources.map((source) => source.category);
      threat_sources_str = source_categories.map((cat) => `  - ${cat}`).join("\n");
    }

    // Prepare messages
    const msg_builder = new MessageBuilder(
      state.image_data,
      state.description || "",
      list_to_string(state.assumptions || [])
    );

    const human_message = msg_builder.createGapAnalysisMessage(
      state.assets,
      state.system_architecture,
      state.threat_list || "",
      state.gap || [],
      threat_sources_str,
      null // kpis parameter - not used in this context
    );

    let system_prompt;
    if (state.replay && state.instructions) {
      system_prompt = new SystemMessage({
        content: gap_prompt(state.instructions, threat_sources_str),
      });
    } else {
      system_prompt = new SystemMessage({ content: gap_prompt(null, threat_sources_str) });
    }

    const messages = [system_prompt, human_message];

    // Get model from config
    const model = config.configurable?.model_gaps;
    if (!model) {
      const error = new Error("Gaps model not found in config");
      console.error("Configuration error:", error.message);
      throw error;
    }

    // Use bindTools() for provider-agnostic structured output with tool calling
    // This works identically for both Bedrock and OpenAI models
    // When reasoning is enabled, don't force tool_choice to allow thinking mode
    const reasoning = config.configurable?.reasoning || 0;
    const gapTool = tool(async (input) => input, {
      name: "continue_threat_modeling",
      description: "Analyze gaps and decide whether to continue threat modeling",
      schema: ContinueThreatModelingSchema,
    });

    // Determine tool_choice based on model type and reasoning
    const modelId = model.model || "";
    const isOpenAI = modelId.startsWith("gpt-") || modelId.startsWith("o1-");
    const isSonnet = modelId.includes("sonnet");

    let model_with_tools;
    if (isOpenAI) {
      // OpenAI models always use explicit tool name (even with reasoning enabled)
      model_with_tools = model.bindTools([gapTool], { tool_choice: "continue_threat_modeling" });
    } else if (!isSonnet) {
      // Haiku 4.5 doesn't support tool_choice
      model_with_tools = model.bindTools([gapTool]);
    } else if (reasoning > 0) {
      // Bedrock with reasoning: don't force tool_choice to allow thinking mode
      model_with_tools = model.bindTools([gapTool]);
    } else {
      // Bedrock Sonnet without reasoning uses 'any'
      model_with_tools = model.bindTools([gapTool], { tool_choice: "any" });
    }

    // Invoke model
    console.log(`Invoking gap analysis model for job ${job_id}`);
    const response = await model_with_tools.invoke(messages);

    // Check again after async operation
    checkAbortSignal(config, "gapAnalysis (after model invocation)");

    // Check if job was cancelled during model invocation
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled during model invocation`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Extract structured response from tool calls
    const structured_response = response.tool_calls[0].args;

    // Extract reasoning if enabled
    if (reasoning > 0) {
      const reasoningContent = extractReasoningContent(response);
      if (reasoningContent) {
        const retry_count = parseInt(state.retry || 0);
        const flush = retry_count === 0 ? FLUSH_MODE_REPLACE : FLUSH_MODE_APPEND;

        if (flush === FLUSH_MODE_REPLACE) {
          stateManager.updateJobTrail(job_id, { gaps: [reasoningContent] });
        } else {
          stateManager.updateJobTrail(job_id, { gaps: reasoningContent });
        }
      }
    }

    // Route based on stop flag
    if (structured_response.stop) {
      console.log(`Job ${job_id}: Gap analysis determined to stop, routing to finalize`);
      return new Command({ goto: "finalize" });
    }

    console.log(`Job ${job_id}: Gap analysis determined to continue, routing to define_threats`);
    return new Command({
      goto: "define_threats",
      update: { gap: [structured_response.gap] },
    });
  } catch (error) {
    // Check if this is an abort/cancellation error
    const isAbortError = error.name === "AbortError" || error.message === "AbortError";

    if (isAbortError) {
      console.log(`gapAnalysis aborted for job ${job_id}`);
    } else {
      console.error(`Error in gapAnalysis for job ${job_id}:`, error);
      console.error("Error details:", { name: error.name, message: error.message });

      // Only update status if job wasn't cancelled
      if (!isJobCancelled(job_id)) {
        try {
          stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);
        } catch (storageError) {
          console.error(`Failed to update job status for ${job_id}:`, storageError);
        }
      }
    }
    throw error;
  }
}

/**
 * Finalize the threat modeling workflow
 * @param {Object} state - Agent state
 * @param {Object} config - Runnable configuration
 * @returns {Object} Final state updates
 */
export async function finalize(state, config) {
  console.log("Node: finalize");

  // Check if workflow was aborted
  checkAbortSignal(config, "finalize");

  const job_id = state.job_id || "unknown";

  try {
    // Check if job was cancelled before finalizing (race condition handling)
    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled before finalization, aborting`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Get the internal retry count (0-indexed)
    const retry_count = parseInt(state.retry || 0);

    // Update job state to FINALIZE (use retry_count as-is, represents completed iterations)
    console.log(`Finalizing job ${job_id} with ${retry_count} completed iterations`);
    stateManager.setJobStatus(job_id, JobState.FINALIZE, retry_count);

    // Get existing results to preserve backup if it exists
    const existingResults = stateManager.getJobResults(job_id);
    const existingBackup = existingResults?.backup || null;

    // Store final results (preserve backup from replay operations)
    const results = {
      job_id,
      s3_location: state.s3_location || "",
      owner: state.owner || "LIGHTNING_USER",
      title: state.title || "",
      summary: state.summary || "",
      description: state.description || "",
      assumptions: state.assumptions || [],
      assets: state.assets || null,
      system_architecture: state.system_architecture || null,
      threat_list: state.threat_list || null,
      retry: retry_count,
      backup: existingBackup,
      completed_at: new Date().toISOString(),
    };

    stateManager.setJobResults(job_id, results);

    // Small delay to simulate finalization processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check again after async operation (race condition: job might be cancelled during delay)
    checkAbortSignal(config, "finalize (before completion)");

    if (isJobCancelled(job_id)) {
      console.log(`Job ${job_id} was cancelled during finalization delay`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Update job state to COMPLETE (use same count as finalize)
    stateManager.setJobStatus(job_id, JobState.COMPLETE, retry_count);
    console.log(`Job ${job_id} completed successfully`);

    return {};
  } catch (error) {
    // Check if this is an abort/cancellation error
    const isAbortError = error.name === "AbortError" || error.message === "AbortError";

    if (isAbortError) {
      console.log(`finalize aborted for job ${job_id} - job was cancelled`);
    } else {
      console.error(`Error in finalize for job ${job_id}:`, error);
      console.error("Error details:", { name: error.name, message: error.message });

      // Only update status if job wasn't cancelled
      if (!isJobCancelled(job_id)) {
        try {
          stateManager.setJobStatus(job_id, JobState.FAILED, state.retry || 0);

          // Store error in results
          const existingResults = stateManager.getJobResults(job_id) || {};
          stateManager.setJobResults(job_id, {
            ...existingResults,
            error: error.message || "Finalization failed",
            error_type: error.name || "Error",
            failed_at: new Date().toISOString(),
          });
        } catch (storageError) {
          console.error(`Failed to update job status for ${job_id}:`, storageError);
        }
      }
    }
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
  console.log("Routing: routeReplay");

  if (!state.replay) {
    return "full";
  }

  const job_id = state.job_id || "unknown";

  try {
    // Clear previous trail data for replay
    stateManager.updateJobTrail(job_id, {
      threats: [],
      gaps: [],
    });

    // Restore from backup if available
    const results = stateManager.getJobResults(job_id);
    if (results && results.backup) {
      // Restore backup data to current results
      const restored = {
        ...results,
        assets: results.backup.assets,
        system_architecture: results.backup.system_architecture,
        threat_list: results.backup.threat_list,
      };
      stateManager.setJobResults(job_id, restored);
    }

    return "replay";
  } catch (error) {
    console.error("Error in routeReplay:", error);
    return "full";
  }
}

/**
 * Determine if should continue with threats or move to gap analysis
 * This is called after defineThreats when iteration > 0
 * @param {Object} state - Agent state
 * @returns {string} Route name ('gap_analysis' or 'finalize')
 */
export function shouldContinue(state) {
  console.log("Routing: shouldContinue");

  const iteration = parseInt(state.iteration || 0);

  // If iteration is 0, always go to gap_analysis
  // This shouldn't be called when iteration is 0, but handle it anyway
  if (iteration === 0) {
    return "gap_analysis";
  }

  // For iteration > 0, the defineThreats node already handles routing
  // This function is here for compatibility but shouldn't be reached
  // in the current workflow design
  return "finalize";
}

/**
 * Determine if should retry threats or finalize after gap analysis
 * @param {Object} state - Agent state
 * @returns {string} Route name ('continue' or 'finalize')
 */
export function shouldRetry(state) {
  console.log("Routing: shouldRetry");

  // This routing is handled by the gapAnalysis node itself
  // which returns a Command with the appropriate goto
  // This function is here for compatibility
  return "continue";
}

/**
 * Threats router passthrough node
 * Routes to either agentic subgraph (iteration=0) or traditional node (iteration>0)
 * @param {Object} state - Agent state
 * @returns {Object} Empty object (passthrough)
 */
export function threatsRouter(state) {
  console.log("Node: threatsRouter");
  // Passthrough node that returns empty object
  // Routing decision is made by routeThreatsBy Iteration function
  return {};
}

/**
 * Route threats generation based on iteration parameter
 * @param {Object} state - Agent state
 * @returns {string} Route name ('threats_subgraph' or 'define_threats')
 */
export function routeThreatsByIteration(state) {
  console.log("Routing: routeThreatsByIteration");

  const iteration = parseInt(state.iteration || 0);

  if (iteration === 0) {
    console.log(`Routing to threats_subgraph (Auto mode, iteration=${iteration})`);
    return "threats_subgraph";
  }

  console.log(`Routing to define_threats (Traditional mode, iteration=${iteration})`);
  return "define_threats";
}
