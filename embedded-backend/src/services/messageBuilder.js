/**
 * Message building utilities for model interactions.
 *
 * This module provides the MessageBuilder class for constructing standardized messages
 * for threat modeling agent interactions with LLM models.
 */

import { HumanMessage } from "@langchain/core/messages";
import { getCredentials } from "../config/credentials.js";

/**
 * Utility class for building standardized messages
 */
export class MessageBuilder {
  /**
   * Message builder constructor
   * @param {string} image_data - Base64 encoded image data
   * @param {string} description - System description
   * @param {string|Array} assumptions - System assumptions (string or array)
   */
  constructor(image_data, description, assumptions) {
    this.image_data = image_data;
    this.description = description;
    this.assumptions = assumptions;

    // Determine if caching is supported based on provider
    const credentials = getCredentials();
    this.supportsCaching = credentials?.provider === "bedrock";
  }

  /**
   * Format asset list for inclusion in prompts
   * @param {Object} assets - Assets object with assets array
   * @returns {string} Formatted asset list or fallback message
   */
  _formatAssetList(assets) {
    // Check if assets parameter exists and has assets array
    if (!assets || !assets.assets || !Array.isArray(assets.assets) || assets.assets.length === 0) {
      return "No assets identified yet.";
    }

    // Extract name from each asset and format as bulleted list
    const assetNames = assets.assets.map((asset) => `  - ${asset.name}`);

    // Join with newlines
    return assetNames.join("\n");
  }

  /**
   * Format threat sources for inclusion in prompts
   * @param {Object} systemArchitecture - System architecture object with threat_sources array
   * @returns {string} Formatted threat source list or fallback message
   */
  _formatThreatSources(systemArchitecture) {
    // Check if systemArchitecture parameter exists and has threat_sources array
    if (
      !systemArchitecture ||
      !systemArchitecture.threat_sources ||
      !Array.isArray(systemArchitecture.threat_sources) ||
      systemArchitecture.threat_sources.length === 0
    ) {
      return "No threat sources identified yet.";
    }

    // Extract category from each threat source and format as bulleted list
    const sourceCategories = systemArchitecture.threat_sources.map(
      (source) => `  - ${source.category}`
    );

    // Join with newlines
    return sourceCategories.join("\n");
  }

  /**
   * Base message for all messages
   * @param {boolean} caching - Whether to include cache point
   * @param {boolean} details - Whether to include description and assumptions (default: true)
   * @returns {Array} Base message array
   */
  base_msg(caching = false, details = true) {
    // Helper function to clean strings of invalid characters
    const cleanString = (str) => {
      if (!str) return "";
      return String(str)
        .replace(/\0/g, "") // Remove null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove other control characters
        .trim();
    };

    const base_message = [
      { type: "text", text: "<architecture_diagram>" },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${this.image_data}` },
      },
      { type: "text", text: "</architecture_diagram>" },
    ];

    // Include description and assumptions only if details is true
    if (details) {
      const cleanDescription = cleanString(this.description);
      const cleanAssumptions = cleanString(this.assumptions);

      base_message.push(
        { type: "text", text: `<description>${cleanDescription}</description>` },
        { type: "text", text: `<assumptions>${cleanAssumptions}</assumptions>` }
      );
    }

    // Only add cache point for providers that support it (Bedrock/Anthropic)
    if (caching && this.supportsCaching) {
      base_message.push({ cachePoint: { type: "default" } });
    }

    return base_message;
  }

  /**
   * Create summary message
   * @param {number} max_words - Maximum words for summary (default: 40)
   * @returns {HumanMessage} HumanMessage object
   */
  createSummaryMessage(max_words = 40) {
    const summary_msg = [
      {
        type: "text",
        text: `Generate a short headline summary of max ${max_words} words this architecture using the diagram and description if available`,
      },
    ];

    const base_message = this.base_msg();
    base_message.push(...summary_msg);
    return new HumanMessage({ content: base_message });
  }

  /**
   * Create asset message
   * @returns {HumanMessage} HumanMessage object
   */
  createAssetMessage() {
    const asset_msg = [{ type: "text", text: "Identify Assets" }];

    const base_message = this.base_msg();
    base_message.push(...asset_msg);
    return new HumanMessage({ content: base_message });
  }

  /**
   * Create system flows message
   * @param {string} assets - Assets JSON string or object
   * @returns {HumanMessage} HumanMessage object
   */
  createSystemFlowsMessage(assets) {
    const assetsStr = typeof assets === "string" ? assets : JSON.stringify(assets);

    const system_flows_msg = [
      {
        type: "text",
        text: `<identified_assets_and_entities>${assetsStr}</identified_assets_and_entities>`,
      },
      { type: "text", text: "Identify system flows" },
    ];

    const base_message = this.base_msg();
    base_message.push(...system_flows_msg);
    return new HumanMessage({ content: base_message });
  }

  /**
   * Create threat analysis message
   * @param {Object} assets - Assets object
   * @param {Object} flows - Flows/system architecture object
   * @returns {HumanMessage} HumanMessage object
   */
  createThreatMessage(assets, flows) {
    const assetsStr = typeof assets === "string" ? assets : JSON.stringify(assets);
    const flowsStr = typeof flows === "string" ? flows : JSON.stringify(flows);

    const threat_msg = [
      {
        type: "text",
        text: `<identified_assets_and_entities>${assetsStr}</identified_assets_and_entities>`,
      },
      { type: "text", text: `<data_flow>${flowsStr}</data_flow>` },
      {
        type: "text",
        text: `<valid_values_for_threats>
**IMPORTANT: When creating threats using the add_threats tool, you MUST use ONLY these values:**

**Valid Target Assets (for the 'target' field):**
${this._formatAssetList(assets)}

**Valid Threat Sources (for the 'source' field):**
${this._formatThreatSources(flows)}

Using any other values will result in validation errors.
</valid_values_for_threats>`,
      },
      { type: "text", text: "Define threats and mitigations for the solution" },
    ];

    const base_message = this.base_msg();
    base_message.push(...threat_msg);
    return new HumanMessage({ content: base_message });
  }

  /**
   * Create threat improvement analysis message
   * @param {Object} assets - Assets object
   * @param {Object} flows - Flows/system architecture object
   * @param {string} threat_list - Threat list JSON string or object
   * @param {string} gap - Gap analysis text
   * @returns {HumanMessage} HumanMessage object
   */
  createThreatImproveMessage(assets, flows, threat_list, gap) {
    const assetsStr = typeof assets === "string" ? assets : JSON.stringify(assets);
    const flowsStr = typeof flows === "string" ? flows : JSON.stringify(flows);
    const threatListStr =
      typeof threat_list === "string" ? threat_list : JSON.stringify(threat_list);

    const threat_msg = [
      {
        type: "text",
        text: `<identified_assets_and_entities>${assetsStr}</identified_assets_and_entities>`,
      },
      { type: "text", text: `<data_flow>${flowsStr}</data_flow>` },
      {
        type: "text",
        text: `<valid_values_for_threats>
**IMPORTANT: When creating threats using the add_threats tool, you MUST use ONLY these values:**

**Valid Target Assets (for the 'target' field):**
${this._formatAssetList(assets)}

**Valid Threat Sources (for the 'source' field):**
${this._formatThreatSources(flows)}

Using any other values will result in validation errors.
</valid_values_for_threats>`,
      },
    ];

    // Only add cache point for providers that support it (Bedrock/Anthropic)
    if (this.supportsCaching) {
      threat_msg.push({ cachePoint: { type: "default" } });
    }

    threat_msg.push(
      { type: "text", text: `<threats>${threatListStr}</threats>` },
      { type: "text", text: `<gap>${gap}</gap>` },
      {
        type: "text",
        text: "Identify missing threats and respective mitigations for the solution",
      }
    );

    const base_message = this.base_msg(true);
    base_message.push(...threat_msg);
    return new HumanMessage({ content: base_message });
  }

  /**
   * Create gap analysis message
   * @param {string} assets - Assets JSON string or object
   * @param {string} flows - Flows JSON string or object
   * @param {string} threat_list - Threat list JSON string or object
   * @param {string} gap - Previous gap analysis text
   * @param {string} threat_sources - Formatted threat sources string (optional)
   * @param {string} kpis - Formatted KPI string (optional)
   * @returns {HumanMessage} HumanMessage object
   */
  createGapAnalysisMessage(assets, flows, threat_list, gap, threat_sources = null, kpis = null) {
    // Helper function to clean strings of invalid characters
    const cleanString = (str) => {
      if (!str) return "";
      return String(str)
        .replace(/\0/g, "") // Remove null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove other control characters
        .trim();
    };

    // Safely stringify and clean JSON data
    const safeStringify = (data) => {
      if (!data) return "";
      try {
        const str = typeof data === "string" ? data : JSON.stringify(data);
        return cleanString(str);
      } catch (e) {
        console.error("Error stringifying data:", e);
        return "";
      }
    };

    const assetsStr = safeStringify(assets);
    const flowsStr = safeStringify(flows);
    const threatListStr = safeStringify(threat_list);

    // Convert gap to string, handling arrays and cleaning invalid characters
    let gapStr = "";
    if (Array.isArray(gap)) {
      gapStr = gap.map((g) => cleanString(String(g))).join("\n");
    } else if (typeof gap === "string") {
      gapStr = cleanString(gap);
    } else if (gap) {
      gapStr = cleanString(String(gap));
    }

    const gap_msg = [
      {
        type: "text",
        text: `<identified_assets_and_entities>${assetsStr}</identified_assets_and_entities>`,
      },
      { type: "text", text: `<data_flow>${flowsStr}</data_flow>` },
    ];

    // Only add cache point for providers that support it (Bedrock/Anthropic)
    if (this.supportsCaching) {
      gap_msg.push({ cachePoint: { type: "default" } });
    }

    gap_msg.push({ type: "text", text: `<threats>${threatListStr}</threats>` });

    // Add KPI section if provided
    if (kpis) {
      gap_msg.push({ type: "text", text: kpis });
    }

    // Add threat sources validation section if provided
    if (threat_sources) {
      gap_msg.push({
        type: "text",
        text: `<valid_threat_sources_for_validation>
**Valid Threat Source Categories:**
${threat_sources}

When evaluating threats, verify that each threat's 'source' field matches one of these categories.
Threats using invalid sources are compliance violations.
</valid_threat_sources_for_validation>`,
      });
    }

    gap_msg.push(
      { type: "text", text: `<previous_gap>${gapStr}</previous_gap>\n` },
      {
        type: "text",
        text: `Perform the gap analysis for the threat model given the information at hand. \n
                Beyond missing threats pay attention as well on: \n
                - Are all the grounding rules honored? \n
                - Are there duplicate threats that could be merged? \n
                - If applicable, have previous gaps been addressed? \n
                - Does the current threats respect the shared responsibility model? \n
                - Does all current threats honor assumptions?\n
                At the end rate the model (1-10). If not already, what would it take it to make it at least 9/10? \n
                `,
      }
    );

    const base_message = this.base_msg(true);
    base_message.push(...gap_msg);
    return new HumanMessage({ content: base_message });
  }

  /**
   * Create threat agent message for agentic workflow
   * @param {Object} assets - Assets object
   * @param {Object} system_architecture - System architecture object with flows and threat sources
   * @param {Array} starred_threats - Array of starred threats (optional)
   * @param {boolean} threats - Whether threats exist in catalog (default: true)
   * @returns {HumanMessage} HumanMessage object
   */
  createThreatAgentMessage(assets, system_architecture, starred_threats = [], threats = true) {
    const threatMsg = [];

    // Add architecture diagram
    const baseMessage = this.base_msg(true, false);

    // Add assets and entities
    const assetsStr = typeof assets === "string" ? assets : JSON.stringify(assets);
    threatMsg.push({
      type: "text",
      text: `<identified_assets_and_entities>${assetsStr}</identified_assets_and_entities>`,
    });

    // Add data flows
    const flowsStr =
      typeof system_architecture === "string"
        ? system_architecture
        : JSON.stringify(system_architecture);
    threatMsg.push({ type: "text", text: `<data_flow>${flowsStr}</data_flow>` });

    // Add valid values for threats
    threatMsg.push({
      type: "text",
      text: `<valid_values_for_threats>
**IMPORTANT: When creating threats using the add_threats tool, you MUST use ONLY these values:**

**Valid Target Assets (for the 'target' field):**
${this._formatAssetList(assets)}

**Valid Threat Sources (for the 'source' field):**
${this._formatThreatSources(system_architecture)}

Using any other values will result in validation errors.
</valid_values_for_threats>`,
    });

    // Add starred threats if present
    if (starred_threats && starred_threats.length > 0) {
      let starredContext =
        "<starred_threats>\nThe following threats have been marked as important by the user and must be preserved:\n";
      for (const threat of starred_threats) {
        starredContext += `- ${threat.name}: ${threat.description}\n`;
      }
      starredContext += "</starred_threats>\n";
      threatMsg.push({ type: "text", text: starredContext });
    }

    // Add cache point for Bedrock
    if (this.supportsCaching) {
      threatMsg.push({ cachePoint: { type: "default" } });
    }

    // Add status message
    if (!threats) {
      threatMsg.push({
        type: "text",
        text: "Currently the threat catalog is empty. No threats have been cataloged yet.",
      });
    }

    threatMsg.push({
      type: "text",
      text: "Create the comprehensive threat catalog while honoring the ground rules.",
    });

    baseMessage.push(...threatMsg);

    return new HumanMessage({ content: baseMessage });
  }
}

/**
 * Convert a list of strings to a single string
 * @param {Array<string>} str_list - List of strings
 * @returns {string} Joined string
 */
export function list_to_string(str_list) {
  if (!str_list || str_list.length === 0) {
    return " ";
  }
  return str_list.join("\n");
}
