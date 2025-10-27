/**
 * Message building utilities for model interactions.
 * 
 * This module provides the MessageBuilder class for constructing standardized messages
 * for threat modeling agent interactions with LLM models.
 */

import { HumanMessage } from '@langchain/core/messages';

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
  }

  /**
   * Base message for all messages
   * @param {boolean} caching - Whether to include cache point
   * @returns {Array} Base message array
   */
  base_msg(caching = false) {
    const cache_config = { cachePoint: { type: 'default' } };

    const base_message = [
      { type: 'text', text: '<architecture_diagram>' },
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${this.image_data}` }
      },
      { type: 'text', text: '</architecture_diagram>' },
      { type: 'text', text: `<description>${this.description}</description>` },
      { type: 'text', text: `<assumptions>${this.assumptions}</assumptions>` }
    ];

    if (caching) {
      base_message.push(cache_config);
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
        type: 'text',
        text: `Generate a short headline summary of max ${max_words} words this architecture using the diagram and description if available`
      }
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
    const asset_msg = [
      { type: 'text', text: 'Identify Assets' }
    ];

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
    const assetsStr = typeof assets === 'string' ? assets : JSON.stringify(assets);
    
    const system_flows_msg = [
      {
        type: 'text',
        text: `<identified_assets_and_entities>${assetsStr}</identified_assets_and_entities>`
      },
      { type: 'text', text: 'Identify system flows' }
    ];

    const base_message = this.base_msg();
    base_message.push(...system_flows_msg);
    return new HumanMessage({ content: base_message });
  }

  /**
   * Create threat analysis message
   * @param {string} assets - Assets JSON string or object
   * @param {string} flows - Flows JSON string or object
   * @returns {HumanMessage} HumanMessage object
   */
  createThreatMessage(assets, flows) {
    const assetsStr = typeof assets === 'string' ? assets : JSON.stringify(assets);
    const flowsStr = typeof flows === 'string' ? flows : JSON.stringify(flows);
    
    const threat_msg = [
      {
        type: 'text',
        text: `<identified_assets_and_entities>${assetsStr}</identified_assets_and_entities>`
      },
      { type: 'text', text: `<data_flow>${flowsStr}</data_flow>` },
      { type: 'text', text: 'Define threats and mitigations for the solution' }
    ];

    const base_message = this.base_msg();
    base_message.push(...threat_msg);
    return new HumanMessage({ content: base_message });
  }

  /**
   * Create threat improvement analysis message
   * @param {string} assets - Assets JSON string or object
   * @param {string} flows - Flows JSON string or object
   * @param {string} threat_list - Threat list JSON string or object
   * @param {string} gap - Gap analysis text
   * @returns {HumanMessage} HumanMessage object
   */
  createThreatImproveMessage(assets, flows, threat_list, gap) {
    const assetsStr = typeof assets === 'string' ? assets : JSON.stringify(assets);
    const flowsStr = typeof flows === 'string' ? flows : JSON.stringify(flows);
    const threatListStr = typeof threat_list === 'string' ? threat_list : JSON.stringify(threat_list);
    
    const threat_msg = [
      {
        type: 'text',
        text: `<identified_assets_and_entities>${assetsStr}</identified_assets_and_entities>`
      },
      { type: 'text', text: `<data_flow>${flowsStr}</data_flow>` },
      { cachePoint: { type: 'default' } },
      { type: 'text', text: `<threats>${threatListStr}</threats>` },
      { type: 'text', text: `<gap>${gap}</gap>` },
      {
        type: 'text',
        text: 'Identify missing threats and respective mitigations for the solution'
      }
    ];

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
   * @returns {HumanMessage} HumanMessage object
   */
  createGapAnalysisMessage(assets, flows, threat_list, gap) {
    const assetsStr = typeof assets === 'string' ? assets : JSON.stringify(assets);
    const flowsStr = typeof flows === 'string' ? flows : JSON.stringify(flows);
    const threatListStr = typeof threat_list === 'string' ? threat_list : JSON.stringify(threat_list);
    
    const gap_msg = [
      {
        type: 'text',
        text: `<identified_assets_and_entities>${assetsStr}</identified_assets_and_entities>`
      },
      { type: 'text', text: `<data_flow>${flowsStr}</data_flow>` },
      { cachePoint: { type: 'default' } },
      { type: 'text', text: `<threats>${threatListStr}</threats>` },
      { type: 'text', text: `<previous_gap>${gap}</previous_gap>\n` },
      {
        type: 'text',
        text: 'Identify missing threats and respective mitigations for the solution'
      }
    ];

    const base_message = this.base_msg(true);
    base_message.push(...gap_msg);
    return new HumanMessage({ content: base_message });
  }
}

/**
 * Convert a list of strings to a single string
 * @param {Array<string>} str_list - List of strings
 * @returns {string} Joined string
 */
export function list_to_string(str_list) {
  if (!str_list || str_list.length === 0) {
    return ' ';
  }
  return str_list.join('\n');
}
