/**
 * Tool implementations for Auto mode threat modeling
 *
 * This module implements the four tools used by the agentic threat generation workflow:
 * - add_threats: Add new threats to the catalog
 * - remove_threat: Remove threats from the catalog
 * - read_threat_catalog: Read and inspect the current catalog
 * - gap_analysis: Analyze catalog for gaps and completeness
 */

import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { Command } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import {
  ThreatsListSchema,
  ContinueThreatModelingSchema,
  MAX_ADD_THREATS_USES,
  MAX_GAP_ANALYSIS_USES,
} from "./state.js";
import stateManager from "../storage/stateManager.js";
import { MessageBuilder, list_to_string } from "../services/messageBuilder.js";
import { gap_prompt } from "../services/prompts.js";

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

/**
 * Simulate processing delay
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if workflow was aborted
 * @param {Object} config - Runnable configuration
 * @param {string} toolName - Name of the tool checking for abort
 * @throws {Error} AbortError if workflow was aborted
 */
function checkAbortSignal(config, toolName) {
  if (config?.signal?.aborted) {
    console.log(`Workflow aborted, skipping ${toolName}`);
    const error = new Error("AbortError");
    error.name = "AbortError";
    throw error;
  }
}

/**
 * Check if job was cancelled
 * @param {string} jobId - Job ID
 * @returns {boolean} True if job was cancelled
 */
function isJobCancelled(jobId) {
  const status = stateManager.getJobStatus(jobId);
  return status?.state === JobState.CANCELLED;
}

/**
 * Calculate threat catalog KPIs
 * @param {Object} threatList - Current threat catalog with threats array
 * @returns {Object} KPI metrics including counts and distributions
 */
function calculateThreatKPIs(threatList) {
  // Handle empty or invalid threat list
  if (!threatList || !threatList.threats || threatList.threats.length === 0) {
    return {
      total_threats: 0,
      threats_by_likelihood: { Low: 0, Medium: 0, High: 0 },
      threats_by_stride: {
        Spoofing: { count: 0, percentage: 0.0 },
        Tampering: { count: 0, percentage: 0.0 },
        Repudiation: { count: 0, percentage: 0.0 },
        "Information Disclosure": { count: 0, percentage: 0.0 },
        "Denial of Service": { count: 0, percentage: 0.0 },
        "Elevation of Privilege": { count: 0, percentage: 0.0 },
      },
      threats_by_source: {},
      threats_by_asset: {},
    };
  }

  const threats = threatList.threats;
  const totalThreats = threats.length;

  // Count by likelihood
  const likelihoodCounts = { Low: 0, Medium: 0, High: 0 };
  threats.forEach((t) => {
    if (t.likelihood) {
      likelihoodCounts[t.likelihood] = (likelihoodCounts[t.likelihood] || 0) + 1;
    }
  });

  // Count by STRIDE category
  const strideCounts = {};
  const strideCategories = [
    "Spoofing",
    "Tampering",
    "Repudiation",
    "Information Disclosure",
    "Denial of Service",
    "Elevation of Privilege",
  ];

  threats.forEach((t) => {
    if (t.stride_category) {
      strideCounts[t.stride_category] = (strideCounts[t.stride_category] || 0) + 1;
    }
  });

  // Build STRIDE distribution with counts and percentages
  const threatsByStride = {};
  strideCategories.forEach((cat) => {
    const count = strideCounts[cat] || 0;
    const percentage = totalThreats > 0 ? Math.round((count / totalThreats) * 1000) / 10 : 0.0;
    threatsByStride[cat] = { count, percentage };
  });

  // Count by source
  const sourceCounts = {};
  threats.forEach((t) => {
    if (t.source) {
      sourceCounts[t.source] = (sourceCounts[t.source] || 0) + 1;
    }
  });

  // Count by asset (target)
  const assetCounts = {};
  threats.forEach((t) => {
    if (t.target) {
      assetCounts[t.target] = (assetCounts[t.target] || 0) + 1;
    }
  });

  return {
    total_threats: totalThreats,
    threats_by_likelihood: likelihoodCounts,
    threats_by_stride: threatsByStride,
    threats_by_source: sourceCounts,
    threats_by_asset: assetCounts,
  };
}

/**
 * Format KPIs for LLM prompt
 * @param {Object} kpis - KPI metrics from calculateThreatKPIs
 * @returns {string} Formatted KPI string with XML tags
 */
function formatKPIsForPrompt(kpis) {
  // Handle empty catalog case
  if (kpis.total_threats === 0) {
    return "<threat_catalog_kpis>\n**Total Threats**: 0\n\nNo threats in catalog yet.\n</threat_catalog_kpis>";
  }

  const lines = ["<threat_catalog_kpis>", `**Total Threats**: ${kpis.total_threats}`, ""];

  // Likelihood distribution with percentages
  lines.push("**Threats by Likelihood**:");
  ["High", "Medium", "Low"].forEach((level) => {
    const count = kpis.threats_by_likelihood[level];
    const pct = Math.round((count / kpis.total_threats) * 1000) / 10;
    lines.push(`- ${level}: ${count} (${pct}%)`);
  });
  lines.push("");

  // STRIDE distribution with counts and percentages
  lines.push("**Threats by STRIDE Category**:");
  Object.entries(kpis.threats_by_stride).forEach(([cat, data]) => {
    lines.push(`- ${cat}: ${data.count} (${data.percentage}%)`);
  });
  lines.push("");

  // Source distribution sorted by count descending
  if (Object.keys(kpis.threats_by_source).length > 0) {
    lines.push("**Threats by Source**:");
    Object.entries(kpis.threats_by_source)
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        lines.push(`- ${source}: ${count}`);
      });
    lines.push("");
  }

  // Asset distribution sorted by count descending
  if (Object.keys(kpis.threats_by_asset).length > 0) {
    lines.push("**Threats by Target Asset**:");
    Object.entries(kpis.threats_by_asset)
      .sort((a, b) => b[1] - a[1])
      .forEach(([asset, count]) => {
        lines.push(`- ${asset}: ${count}`);
      });
    lines.push("");
  }

  lines.push("</threat_catalog_kpis>");
  return lines.join("\n");
}

/**
 * Generate tools with access to current state via closure
 * @param {Object} state - Current threat state
 * @returns {Array} Array of tool instances
 */
export function generateTools(state) {
  /**
   * Tool: add_threats
   * Add new threats to the existing catalog
   */
  const addThreats = tool(
    async (input, config) => {
      console.log("Tool: add_threats invoked");

      // Check abort signal before processing
      checkAbortSignal(config, "add_threats");

      // Access state via closure
      const toolUse = state.tool_use || 0;
      const gapToolUse = state.gap_tool_use || 0;
      const jobId = state.job_id || "unknown";
      const retry = state.retry || 0;

      // Check if job was cancelled
      if (isJobCancelled(jobId)) {
        console.log(`Job ${jobId} was cancelled, aborting add_threats`);
        const error = new Error("AbortError");
        error.name = "AbortError";
        throw error;
      }

      // Check tool usage limit with validation cycle logic
      if (toolUse >= MAX_ADD_THREATS_USES) {
        // Check if gap_analysis has been called since last reset
        if (gapToolUse < MAX_GAP_ANALYSIS_USES) {
          // Gap analysis available and not yet called since reset
          const errorMsg =
            "You must call gap_analysis to verify the current threat model status before adding more threats.";
          console.warn("Tool usage limit exceeded - gap_analysis required", {
            tool: "add_threats",
            currentUsage: toolUse,
            gapToolUse: gapToolUse,
          });
          return errorMsg;
        } else if (gapToolUse >= MAX_GAP_ANALYSIS_USES) {
          // All tool calls consumed
          const errorMsg =
            "You have consumed all your tool calls. You can only delete threats or proceed to finish.";
          console.warn("All tool calls consumed", {
            tool: "add_threats",
            currentUsage: toolUse,
            gapToolUse: gapToolUse,
          });
          return errorMsg;
        }
      }

      // Extract valid asset names from state
      const assets = state.assets;
      const validAssetNames = new Set(assets?.assets?.map((asset) => asset.name) || []);

      // Extract valid threat source categories from state
      const systemArchitecture = state.system_architecture;
      const validThreatSources = new Set(
        systemArchitecture?.threat_sources?.map((source) => source.category) || []
      );

      // Validate each threat
      const validThreats = [];
      const invalidThreats = [];

      for (const threat of input.threats) {
        const violations = [];

        // Validate target field against valid asset names
        if (!validAssetNames.has(threat.target)) {
          violations.push(`Invalid target '${threat.target}' - not in asset list`);
        }

        // Validate source field against valid threat source categories
        if (!validThreatSources.has(threat.source)) {
          violations.push(`Invalid source '${threat.source}' - not in threat sources`);
        }

        // Separate into valid and invalid arrays
        if (violations.length > 0) {
          invalidThreats.push({ name: threat.name, violations });
        } else {
          // Ensure starred=false for valid threats
          validThreats.push({
            ...threat,
            starred: false,
          });
        }
      }

      // Build response message and determine tool_use increment
      let responseMsg;
      let newToolUse;

      if (invalidThreats.length === 0) {
        // All threats valid - increment counter
        newToolUse = toolUse + 1;
        responseMsg = `Successfully added: ${validThreats.length} threats.`;

        // Update job status with detail
        const detail = `${validThreats.length} threats added to catalog`;
        stateManager.setJobStatus(jobId, JobState.THREAT, retry, detail);

        // Add 5-second delay for processing simulation
        await delay(5000);

        // Check abort signal after async operation
        checkAbortSignal(config, "add_threats");

        const remainingInvocations = MAX_ADD_THREATS_USES - newToolUse;
        console.log(`Added ${validThreats.length} threats to catalog for job ${jobId}`, {
          remainingInvocations: remainingInvocations,
        });
      } else {
        // Some threats invalid - do NOT increment counter
        newToolUse = toolUse;

        // Format invalid threat details
        const invalidDetails = invalidThreats
          .map((inv) => `  - ${inv.name}: ${inv.violations.join("; ")}`)
          .join("\n");

        // Build detailed error message
        responseMsg =
          `Successfully added: ${validThreats.length} threats.\n\n` +
          `${invalidThreats.length} threats were NOT added due to validation failures:\n` +
          `${invalidDetails}\n\n` +
          `Please ensure:\n` +
          `- Threat 'target' matches an asset name from: ${Array.from(validAssetNames).join(", ")}\n` +
          `- Threat 'source' matches a threat source from: ${Array.from(validThreatSources).join(", ")}`;

        console.warn(`Validation failures for job ${jobId}`, {
          validCount: validThreats.length,
          invalidCount: invalidThreats.length,
          toolUseNotIncremented: true,
        });
      }

      // Return Command with updated threat_list (only valid threats), tool_use, gap_called_since_reset flag, and ToolMessage
      return new Command({
        update: {
          threat_list: { threats: validThreats },
          tool_use: newToolUse,
          gap_called_since_reset: true,
          messages: [
            new ToolMessage({
              content: responseMsg,
              tool_call_id: config.toolCall?.id,
            }),
          ],
        },
      });
    },
    {
      name: "add_threats",
      description: "Used to add new threats to the existing catalog",
      schema: ThreatsListSchema,
    }
  );

  /**
   * Tool: remove_threat
   * Remove threats from the catalog by name
   */
  const removeThreat = tool(
    async (input, config) => {
      console.log("Tool: remove_threat invoked");

      // Check abort signal before processing
      checkAbortSignal(config, "remove_threat");

      // Access state via closure
      const currentThreatList = state.threat_list || { threats: [] };
      const toolUse = state.tool_use || 0;
      const jobId = state.job_id || "unknown";
      const retry = state.retry || 0;

      // Check if job was cancelled
      if (isJobCancelled(jobId)) {
        console.log(`Job ${jobId} was cancelled, aborting remove_threat`);
        const error = new Error("AbortError");
        error.name = "AbortError";
        throw error;
      }

      // Filter out threats by name
      const threatsToRemove = new Set(input.threats);
      const remainingThreats = currentThreatList.threats.filter(
        (threat) => !threatsToRemove.has(threat.name)
      );

      const deletedCount = currentThreatList.threats.length - remainingThreats.length;

      // Update job status with detail
      const detail = `${deletedCount} threats deleted from catalog`;
      stateManager.setJobStatus(jobId, JobState.THREAT, retry, detail);

      // Add 5-second delay for processing simulation
      await delay(5000);

      // Check abort signal after async operation
      checkAbortSignal(config, "remove_threat");

      console.log(`Removed ${deletedCount} threats from catalog for job ${jobId}`);

      // Return Command with Overwrite for threat_list, incremented tool_use, and ToolMessage
      // Note: We use a special marker to indicate this should overwrite, not merge
      return new Command({
        update: {
          threat_list: { threats: remainingThreats, __overwrite: true },
          messages: [
            new ToolMessage({
              content: `Successfully removed ${deletedCount} threats from the catalog`,
              tool_call_id: config.toolCall?.id,
            }),
          ],
        },
      });
    },
    {
      name: "remove_threat",
      description: "Used to delete threats from the existing catalog",
      schema: z.object({
        threats: z.array(z.string()).describe("List of threat names to remove"),
      }),
    }
  );

  /**
   * Tool: read_threat_catalog
   * Read and retrieve the current list of threats from the catalog
   */
  const readThreatCatalog = tool(
    async (input, config) => {
      console.log("Tool: read_threat_catalog invoked");

      // Check abort signal before processing
      checkAbortSignal(config, "read_threat_catalog");

      // Access state via closure
      const currentThreatList = state.threat_list || { threats: [] };
      const jobId = state.job_id || "unknown";
      const retry = state.retry || 0;

      // Check if job was cancelled
      if (isJobCancelled(jobId)) {
        console.log(`Job ${jobId} was cancelled, aborting read_threat_catalog`);
        const error = new Error("AbortError");
        error.name = "AbortError";
        throw error;
      }

      // Update job status with detail
      const detail = "Reviewing catalog";
      stateManager.setJobStatus(jobId, JobState.THREAT, retry, detail);

      // Add 5-second delay for processing simulation
      await delay(5000);

      // Check abort signal after async operation
      checkAbortSignal(config, "read_threat_catalog");

      // Format output based on verbose flag
      const verbose = input.verbose || false;
      let output = "";

      if (currentThreatList.threats.length === 0) {
        output = "The threat catalog is currently empty. No threats have been added yet.";
      } else if (verbose) {
        // Verbose mode: include full threat details
        output = `Current Threat Catalog (${currentThreatList.threats.length} threats):\n\n`;
        currentThreatList.threats.forEach((threat, index) => {
          output += `${index + 1}. ${threat.name}\n`;
          output += `   STRIDE Category: ${threat.stride_category}\n`;
          output += `   Description: ${threat.description}\n`;
          output += `   Target: ${threat.target}\n`;
          output += `   Impact: ${threat.impact}\n`;
          output += `   Likelihood: ${threat.likelihood}\n`;
          output += `   Source: ${threat.source}\n`;
          output += `   Vector: ${threat.vector}\n`;
          output += `   Prerequisites: ${threat.prerequisites.join(", ")}\n`;
          output += `   Mitigations: ${threat.mitigations.join("; ")}\n\n`;
        });
      } else {
        // Summary mode: just threat names
        output = `Current Threat Catalog (${currentThreatList.threats.length} threats):\n`;
        currentThreatList.threats.forEach((threat, index) => {
          output += `${index + 1}. ${threat.name}\n`;
        });
      }

      console.log(`Read catalog for job ${jobId}: ${currentThreatList.threats.length} threats`);

      return output;
    },
    {
      name: "read_threat_catalog",
      description: "Read and retrieve the current list of threats from the catalog",
      schema: z.object({
        verbose: z.boolean().optional().describe("Whether to include detailed threat information"),
      }),
    }
  );

  /**
   * Tool: gap_analysis
   * Analyze the current threat catalog for gaps and completeness
   */
  const gapAnalysis = tool(
    async (input, config) => {
      console.log("Tool: gap_analysis invoked");

      // Check abort signal before processing
      checkAbortSignal(config, "gap_analysis");

      // Access state via closure
      const gapToolUse = state.gap_tool_use || 0;
      const jobId = state.job_id || "unknown";
      const retry = state.retry || 0;

      // Check if job was cancelled
      if (isJobCancelled(jobId)) {
        console.log(`Job ${jobId} was cancelled, aborting gap_analysis`);
        const error = new Error("AbortError");
        error.name = "AbortError";
        throw error;
      }

      // Check gap_tool_use limit
      if (gapToolUse >= MAX_GAP_ANALYSIS_USES) {
        const errorMsg =
          "You have consumed all your tool calls. You can only delete threats or proceed to finish.";
        console.warn("Gap analysis limit exceeded", {
          tool: "gap_analysis",
          currentUsage: gapToolUse,
        });
        return errorMsg;
      }

      // Update job status with detail
      const detail = "Reviewing for gaps";
      stateManager.setJobStatus(jobId, JobState.THREAT, retry, detail);

      try {
        // Calculate KPIs for gap analysis
        let kpisStr = null;
        try {
          const kpis = calculateThreatKPIs(state.threat_list);
          kpisStr = formatKPIsForPrompt(kpis);

          // Log KPI metrics on success
          console.log("KPI calculation completed", {
            total_threats: kpis.total_threats,
            high_likelihood: kpis.threats_by_likelihood.High,
            medium_likelihood: kpis.threats_by_likelihood.Medium,
            low_likelihood: kpis.threats_by_likelihood.Low,
            unique_sources: Object.keys(kpis.threats_by_source).length,
            unique_assets: Object.keys(kpis.threats_by_asset).length,
          });
        } catch (kpiError) {
          // Log error and continue without KPIs
          console.error("KPI calculation failed - continuing without KPIs", {
            error: kpiError.message,
            threatCount: state.threat_list?.threats?.length || 0,
            jobId: jobId,
          });
          kpisStr = null;
        }

        // Extract threat sources from state
        let threat_sources_str = null;
        const system_architecture = state.system_architecture;
        if (
          system_architecture &&
          system_architecture.threat_sources &&
          system_architecture.threat_sources.length > 0
        ) {
          const source_categories = system_architecture.threat_sources.map(
            (source) => source.category
          );
          threat_sources_str = source_categories.map((cat) => `  - ${cat}`).join("\n");
        }

        // Build gap analysis messages using MessageBuilder
        const msgBuilder = new MessageBuilder(
          state.image_data,
          state.description || "",
          list_to_string(state.assumptions || [])
        );

        const humanMessage = msgBuilder.createGapAnalysisMessage(
          state.assets,
          state.system_architecture,
          state.threat_list || "",
          state.gap || [],
          threat_sources_str,
          kpisStr
        );

        let systemPrompt;
        if (state.replay && state.instructions) {
          systemPrompt = new SystemMessage({
            content: gap_prompt(state.instructions, threat_sources_str),
          });
        } else {
          systemPrompt = new SystemMessage({ content: gap_prompt(null, threat_sources_str) });
        }

        const messages = [systemPrompt, humanMessage];
        // Get gaps model from config.configurable.model_gaps
        const model = config.configurable?.model_gaps;
        if (!model) {
          const errorMsg =
            "Gap analysis model not configured. Please proceed without gap analysis or configure the model.";
          console.error("Gap analysis model not found in config");
          return errorMsg;
        }

        // Bind ContinueThreatModelingSchema tool to model
        const gapTool = tool(async (toolInput) => toolInput, {
          name: "continue_threat_modeling",
          description: "Analyze gaps and decide whether to continue threat modeling",
          schema: ContinueThreatModelingSchema,
        });

        // Determine tool_choice based on model type and reasoning mode
        const modelId = model.model || "";
        const isOpenAI = modelId.startsWith("gpt-") || modelId.startsWith("o1-");
        const isSonnet = modelId.includes("sonnet");
        const reasoning = config.configurable?.reasoning || 0;

        let modelWithTools;
        if (isOpenAI) {
          // OpenAI supports forcing specific tool by name
          modelWithTools = model.bindTools([gapTool], { tool_choice: "continue_threat_modeling" });
        } else if (!isSonnet) {
          // Haiku doesn't support tool_choice
          modelWithTools = model.bindTools([gapTool]);
        } else {
          // Bedrock Sonnet: use 'any' for non-reasoning, None/undefined for reasoning
          // When reasoning is enabled, do NOT set tool_choice (conflicts with thinking mode)
          if (reasoning > 0) {
            modelWithTools = model.bindTools([gapTool]);
          } else {
            modelWithTools = model.bindTools([gapTool], { tool_choice: "any" });
          }
        }

        // Invoke model and extract structured response
        console.log(`Invoking gap analysis model for job ${jobId}`);
        let response;

        try {
          response = await modelWithTools.invoke(messages);
        } catch (modelError) {
          // Map provider-specific errors to standardized types
          console.error(`Model invocation error in gap_analysis for job ${jobId}:`, {
            name: modelError.name,
            message: modelError.message,
            provider: model.model || "unknown",
            counters_reset: false,
          });

          // Check if this is a rate limit error
          if (
            modelError.message?.includes("rate limit") ||
            modelError.message?.includes("throttl") ||
            modelError.status === 429
          ) {
            return "Gap analysis is temporarily unavailable due to rate limiting. Please proceed without gap analysis or try again later.";
          }

          // Check if this is an authentication error
          if (
            modelError.message?.includes("authentication") ||
            modelError.message?.includes("unauthorized") ||
            modelError.message?.includes("invalid api key") ||
            modelError.status === 401 ||
            modelError.status === 403
          ) {
            return "Gap analysis failed due to authentication error. Please check your API credentials and proceed without gap analysis.";
          }

          // Check if this is a timeout error
          if (
            modelError.message?.includes("timeout") ||
            modelError.message?.includes("timed out") ||
            modelError.code === "ETIMEDOUT"
          ) {
            return "Gap analysis request timed out. Please proceed without gap analysis or try again.";
          }

          // Check if this is a content policy error
          if (
            modelError.message?.includes("content policy") ||
            modelError.message?.includes("safety") ||
            modelError.message?.includes("inappropriate")
          ) {
            return "Gap analysis was blocked by content policy filters. Please proceed without gap analysis.";
          }

          // Generic model error with user-friendly message
          return `Gap analysis failed: ${modelError.message || "Unknown error"}. Please proceed without gap analysis or try again.`;
        }

        // Check abort signal after async operation
        checkAbortSignal(config, "gap_analysis");

        // Extract structured response from tool calls
        if (!response.tool_calls || response.tool_calls.length === 0) {
          console.error(`No tool calls in gap analysis response for job ${jobId}`, {
            counters_reset: false,
          });
          return "Gap analysis did not return expected results. Please proceed without gap analysis.";
        }

        const structuredResponse = response.tool_calls[0].args;

        // Add 5-second delay for processing simulation
        await delay(5000);

        // Check abort signal after delay
        checkAbortSignal(config, "gap_analysis");

        console.log(`Gap analysis completed for job ${jobId}:`, structuredResponse, {
          tool_use_reset: true,
        });

        // Return Command with gap_tool_use increment, counter reset, and gap/messages updates
        const updates = {
          gap_tool_use: gapToolUse + 1,
          tool_use: 0, // Reset add_threats counter
          gap_called_since_reset: false, // Reset gap_called_since_reset flag
        };

        // Add gap to updates if provided
        if (structuredResponse.gap) {
          updates.gap = [structuredResponse.gap];
        }

        // If stop is true, we should signal completion
        // The agent will see this in the tool result and can decide to stop
        const resultMessage = structuredResponse.stop
          ? `Gap analysis complete. The threat catalog is comprehensive and no significant gaps were identified.`
          : `Gap analysis identified areas for improvement: ${structuredResponse.gap}`;

        // Add ToolMessage to updates
        updates.messages = [
          new ToolMessage({
            content: resultMessage,
            tool_call_id: config.toolCall?.id,
          }),
        ];

        // Return Command with updates including ToolMessage
        if (structuredResponse.stop) {
          return new Command({
            update: updates,
            goto: "continue",
          });
        }

        return new Command({
          update: updates,
        });
      } catch (error) {
        // Catch any other errors (abort, unexpected errors)
        console.error(`Unexpected error in gap_analysis for job ${jobId}:`, {
          name: error.name,
          message: error.message,
          stack: error.stack,
          counters_reset: false,
        });

        // Re-throw abort errors
        if (error.name === "AbortError") {
          throw error;
        }

        // Return user-friendly error message for other errors
        const errorMsg = `Gap analysis encountered an unexpected error. Please proceed without gap analysis. Error: ${error.message}`;
        return errorMsg;
      }
    },
    {
      name: "gap_analysis",
      description:
        "Analyze the current threat catalog for gaps and completeness. Maximum 3 invocations allowed.",
      schema: z.object({}),
    }
  );

  // Return array of tools
  return [addThreats, removeThreat, readThreatCatalog, gapAnalysis];
}

/**
 * Create a custom tool node that generates tools with current state
 * @param {Object} state - Current threat state
 * @returns {Promise} Tool node invocation result
 */
export async function toolNode(state) {
  // Generate tools with access to current state via closure
  const tools = generateTools(state);
  const toolNodeWithConfig = new ToolNode(tools);
  return toolNodeWithConfig.invoke(state);
}

// Export tools array for backward compatibility (will be generated dynamically)
export const tools = generateTools({});
