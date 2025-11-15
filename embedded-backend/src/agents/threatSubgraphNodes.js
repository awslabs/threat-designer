/**
 * Threat Subgraph Node Functions for Auto Mode
 *
 * This module implements the agent node and routing functions for the agentic
 * threat generation workflow (Auto mode with iteration=0).
 *
 * The subgraph uses a ReAct pattern where the agent:
 * 1. Reasons about the current threat catalog
 * 2. Calls tools to add, remove, read, or analyze threats
 * 3. Continues until the catalog is comprehensive
 */

import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { tools } from "./tools.js";
import { MessageBuilder, list_to_string } from "../services/messageBuilder.js";
import { create_agent_system_prompt } from "../services/prompts.js";
import stateManager from "../storage/stateManager.js";

// Job status constants
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
 * Create the initial human message for the agent
 * Handles starred threats in replay mode
 * @param {Object} state - Current state
 * @returns {HumanMessage} Human message for agent
 */
export function createAgentHumanMessage(state) {
  const msgBuilder = new MessageBuilder(
    state.image_data,
    state.description || "",
    list_to_string(state.assumptions || [])
  );

  // Check for starred threats in replay mode
  const starredThreats = [];
  const threatList = state.threat_list;
  if (threatList && threatList.threats) {
    starredThreats.push(...threatList.threats.filter((t) => t.starred));
  }

  // Determine if we have threats in the catalog
  const hasThreats = threatList && threatList.threats && threatList.threats.length > 0;

  // Create message with complete context
  const humanMessage = msgBuilder.createThreatAgentMessage(
    state.assets,
    state.system_architecture,
    starredThreats,
    hasThreats
  );

  return humanMessage;
}

// ============================================================================
// NODE FUNCTIONS
// ============================================================================

/**
 * Agent node for agentic threat generation
 * Uses ReAct pattern with tool calling to build comprehensive threat catalog
 * @param {Object} state - Threat subgraph state
 * @param {Object} config - Runnable configuration
 * @returns {Command} Command with updated messages
 */
export async function agentNode(state, config) {
  console.log("Node: agentNode (threat subgraph)", {
    tool_use: state.tool_use || 0,
    gap_tool_use: state.gap_tool_use || 0,
  });

  // Check if workflow was aborted
  checkAbortSignal(config, "agentNode");

  const jobId = state.job_id || "unknown";
  const retry = state.retry || 0;

  try {
    // Check if job was cancelled before starting work
    if (isJobCancelled(jobId)) {
      console.log(`Job ${jobId} was cancelled, aborting agentNode`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Initialize messages on first invocation
    let messages = state.messages || [];
    let stateUpdate = {};
    if (messages.length === 0) {
      console.log("Initializing agent messages with system prompt and human message");

      // Create system prompt
      const systemPromptText = create_agent_system_prompt(state.instructions);
      const systemPrompt = new SystemMessage({ content: systemPromptText });

      // Create human message
      const humanMessage = createAgentHumanMessage(state);

      messages = [systemPrompt, humanMessage];
    }

    // Update job status to "Thinking" before model invocation
    stateManager.setJobStatus(jobId, JobState.THREAT, retry, "Thinking");

    // Get model_threats_agent from config.configurable
    const model = config.configurable?.model_threats_agent;
    if (!model) {
      throw new Error("Threats agent model not found in config");
    }

    // Check if this is an OpenAI model
    const modelId = model.model || "";
    const isOpenAI = modelId.startsWith("gpt-") || modelId.startsWith("o1-");

    // Clean messages for OpenAI only - remove reasoning blocks from additional_kwargs
    // OpenAI doesn't want reasoning blocks sent back in subsequent requests
    // Claude/Bedrock handles reasoning differently and doesn't have this issue
    let messagesToSend = messages;
    if (isOpenAI) {
      messagesToSend = messages.map((msg) => {
        if (msg._getType && msg._getType() === "ai" && msg.additional_kwargs?.reasoning) {
          const { reasoning, ...otherKwargs } = msg.additional_kwargs;

          return new AIMessage({
            content: msg.content,
            tool_calls: msg.tool_calls,
            id: msg.id,
            additional_kwargs: otherKwargs,
            response_metadata: msg.response_metadata,
          });
        }
        return msg;
      });
    }

    // Bind tools to model with tool_choice="auto"
    const modelWithTools = model.bindTools(tools, { tool_choice: "auto" });

    // Invoke model and get response
    console.log(`Invoking threats agent model for job ${jobId}`);
    let response;

    try {
      response = await modelWithTools.invoke(messagesToSend);
    } catch (modelError) {
      // Map provider-specific errors to standardized types
      console.error(`Model invocation error in agentNode for job ${jobId}:`, {
        name: modelError.name,
        message: modelError.message,
        provider: model.model || "unknown",
      });

      // Check if this is a rate limit error
      if (
        modelError.message?.includes("rate limit") ||
        modelError.message?.includes("throttl") ||
        modelError.status === 429
      ) {
        const userMessage =
          "The AI model is currently rate limited. Please try again in a few moments.";
        console.error(`Rate limit error for job ${jobId}: ${userMessage}`);
        throw new Error(userMessage);
      }

      // Check if this is an authentication error
      if (
        modelError.message?.includes("authentication") ||
        modelError.message?.includes("unauthorized") ||
        modelError.message?.includes("invalid api key") ||
        modelError.status === 401 ||
        modelError.status === 403
      ) {
        const userMessage =
          "Authentication failed with the AI model provider. Please check your API credentials.";
        console.error(`Authentication error for job ${jobId}: ${userMessage}`);
        throw new Error(userMessage);
      }

      // Check if this is a timeout error
      if (
        modelError.message?.includes("timeout") ||
        modelError.message?.includes("timed out") ||
        modelError.code === "ETIMEDOUT"
      ) {
        const userMessage = "The AI model request timed out. Please try again.";
        console.error(`Timeout error for job ${jobId}: ${userMessage}`);
        throw new Error(userMessage);
      }

      // Check if this is a content policy error
      if (
        modelError.message?.includes("content policy") ||
        modelError.message?.includes("safety") ||
        modelError.message?.includes("inappropriate")
      ) {
        const userMessage =
          "The request was blocked by content policy filters. Please review your input and try again.";
        console.error(`Content policy error for job ${jobId}: ${userMessage}`);
        throw new Error(userMessage);
      }

      // Generic model error
      const userMessage = `AI model error: ${modelError.message || "Unknown error occurred"}`;
      console.error(`Generic model error for job ${jobId}: ${userMessage}`);
      throw new Error(userMessage);
    }

    // Check again after async operation
    checkAbortSignal(config, "agentNode (after model invocation)");

    // Check if job was cancelled during model invocation
    if (isJobCancelled(jobId)) {
      console.log(`Job ${jobId} was cancelled during model invocation`);
      const error = new Error("AbortError");
      error.name = "AbortError";
      throw error;
    }

    // Update job status based on tool calls (specific messages per tool)
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolName = response.tool_calls[0].name;
      let statusDetail = "Processing";

      switch (toolName) {
        case "add_threats":
          statusDetail = "Adding threats";
          break;
        case "remove_threat":
          statusDetail = "Deleting threats";
          break;
        case "read_threat_catalog":
          statusDetail = "Reviewing catalog";
          break;
        case "gap_analysis":
          statusDetail = "Reviewing for gaps";
          break;
        default:
          statusDetail = "Processing";
      }

      stateManager.setJobStatus(jobId, JobState.THREAT, retry, statusDetail);
      console.log(`Agent called tool: ${toolName}`, {
        tool_use: state.tool_use || 0,
        gap_tool_use: state.gap_tool_use || 0,
      });
    }

    // Return Command with updated messages
    // If this was the first invocation, include the system and human messages
    const messagesToUpdate =
      (state.messages || []).length === 0
        ? [messages[0], messages[1], response] // SystemMessage, HumanMessage, AIMessage
        : [response]; // Just the AIMessage

    return new Command({
      update: {
        messages: messagesToUpdate,
        ...stateUpdate,
      },
    });
  } catch (error) {
    // Check if this is an abort/cancellation error
    const isAbortError = error.name === "AbortError" || error.message === "AbortError";

    if (isAbortError) {
      console.log(`agentNode aborted for job ${jobId}`);
    } else {
      console.error(`Error in agentNode for job ${jobId}:`, error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });

      // Only update status if job wasn't cancelled
      if (!isJobCancelled(jobId)) {
        try {
          stateManager.setJobStatus(jobId, JobState.FAILED, state.retry || 0);
        } catch (storageError) {
          console.error(`Failed to update job status for ${jobId}:`, storageError);
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
 * Determine if agent should continue to tools or move to validation
 * @param {Object} state - Threat subgraph state
 * @returns {string} Route name ('tools' or 'continue')
 */
export function shouldContinue(state) {
  console.log("Routing: shouldContinue (threat subgraph)");

  const messages = state.messages;
  if (!messages || messages.length === 0) {
    console.log("No messages, routing to continue");
    return "continue";
  }

  const lastMessage = messages[messages.length - 1];

  // Check if message has tool_calls
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    console.log(`Agent made ${lastMessage.tool_calls.length} tool call(s), routing to tools`);
    return "tools";
  }

  console.log("No tool calls, routing to continue");
  return "continue";
}

/**
 * Validate catalog and route to finalize or back to agent
 * @param {Object} state - Threat subgraph state
 * @param {Object} config - Runnable configuration
 * @returns {Command} Command to route to next node
 */
export async function continueOrFinish(state, config) {
  console.log("Node: continueOrFinish (threat subgraph)");

  const jobId = state.job_id || "unknown";
  const retry = state.retry || 0;
  const threatList = state.threat_list;
  const gapToolUse = state.gap_tool_use || 0;

  // Check 1: Empty catalog validation
  if (!threatList || !threatList.threats || threatList.threats.length === 0) {
    console.log("Empty catalog detected, routing back to agent with feedback");
    console.warn("Empty threat catalog validation failed", {
      job_id: jobId,
      retry: retry,
    });

    const feedbackMessage = new HumanMessage({
      content: "The threat catalog is empty. Please generate threats before finishing.",
    });

    return new Command({
      goto: "agent",
      update: { messages: [feedbackMessage] },
    });
  }

  // Check 2: STRIDE coverage validation
  const allStrideCategories = new Set([
    "Spoofing",
    "Tampering",
    "Repudiation",
    "Information Disclosure",
    "Denial of Service",
    "Elevation of Privilege",
  ]);

  // Extract STRIDE categories from threat catalog
  const catalogStrideCategories = new Set(threatList.threats.map((t) => t.stride_category));

  // Calculate missing STRIDE categories
  const missingStride = [...allStrideCategories].filter((cat) => !catalogStrideCategories.has(cat));

  // If categories missing, inject feedback and route back to agent
  if (missingStride.length > 0) {
    console.warn("Missing STRIDE categories - routing back to agent", {
      job_id: jobId,
      retry: retry,
      missing: missingStride,
    });

    const feedbackMessage = new HumanMessage({
      content: `Coverage gaps detected:\n- Missing STRIDE categories: ${missingStride.join(", ")}\n\nPlease add threats to address these gaps.`,
    });

    return new Command({
      goto: "agent",
      update: { messages: [feedbackMessage] },
    });
  }

  // Check 3: Gap analysis requirement validation
  if (gapToolUse === 0) {
    console.log("Gap analysis not performed - routing back to agent");
    console.info("Gap analysis requirement check failed", {
      job_id: jobId,
      retry: retry,
      gap_tool_use: gapToolUse,
    });

    const feedbackMessage = new HumanMessage({
      content:
        "You have not performed gap analysis yet. Please use the gap_analysis tool to validate the completeness of the threat catalog before finishing.",
    });

    return new Command({
      goto: "agent",
      update: { messages: [feedbackMessage] },
    });
  }

  // All checks passed - proceed to finalization
  console.log("All coverage checks passed - proceeding to finalize", {
    job_id: jobId,
    threat_count: threatList.threats.length,
    stride_coverage: catalogStrideCategories.size,
    gap_analysis_performed: gapToolUse,
  });

  // Reset job status detail to null
  stateManager.setJobStatus(jobId, JobState.THREAT, retry);

  // Route to parent finalize node with threat_list
  console.log(
    `Catalog complete with ${threatList.threats.length} threats, routing to parent finalize`
  );

  // Use Command.PARENT to route to parent graph's finalize node
  return new Command({
    goto: "finalize",
    update: {
      // Use a marker to indicate this should overwrite, not merge
      threat_list: { ...threatList, __overwrite: true },
    },
    graph: Command.PARENT,
  });
}
