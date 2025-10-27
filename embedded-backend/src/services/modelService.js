/**
 * Model service layer for centralized model interactions.
 * 
 * This module provides the ModelService class for managing interactions with
 * AWS Bedrock models using ChatBedrockConverse.
 */

import { ChatBedrockConverse } from '@langchain/aws';
import { getCredentials } from '../config/credentials.js';
import { DEFAULT_MODEL_CONFIG } from '../config/modelConfig.js';
import { validateModelConfig } from '../config/configValidator.js';

// Temperature constants
const MODEL_TEMPERATURE_DEFAULT = 0.7;
const MODEL_TEMPERATURE_REASONING = 1.0;

/**
 * Initialize a ChatBedrockConverse model instance
 * @param {string} modelId - The Bedrock model ID
 * @param {number} temperature - Model temperature (default: 0.7)
 * @param {Object} additionalConfig - Additional configuration options
 * @returns {ChatBedrockConverse} Initialized model instance
 */
export function initializeModel(modelId, temperature, additionalConfig = {}) {
  const credentials = getCredentials();
  
  if (!credentials) {
    throw new Error('AWS credentials not configured');
  }

  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error('Invalid AWS credentials: missing accessKeyId or secretAccessKey');
  }

  // Build credentials object, only include sessionToken if it exists
  const credentialsConfig = {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey
  };
  
  // Only add sessionToken if it's provided and not null/empty
  if (credentials.sessionToken && credentials.sessionToken.trim()) {
    credentialsConfig.sessionToken = credentials.sessionToken.trim();
  }

  console.log('Initializing ChatBedrockConverse with:', {
    model: modelId,
    region: credentials.region,
    accessKeyIdLength: credentialsConfig.accessKeyId,
    secretAccessKeyLength: credentialsConfig.secretAccessKey,
    hasSessionToken: !!credentialsConfig.sessionToken
  });

  return new ChatBedrockConverse({
    model: modelId,
    region: credentials.region,
    credentials: credentialsConfig,
    max_tokens: 64000,
    temperature,
    ...additionalConfig
  });
}

/**
 * Create a node-specific model with optional reasoning
 * @param {Object} nodeConfig - Node configuration (id, max_tokens, reasoning_budget)
 * @param {number} reasoning - Reasoning level (0-3)
 * @param {Array} reasoningModels - List of model IDs that support reasoning
 * @param {Object} credentials - AWS credentials
 * @param {string} nodeName - Name of the node (for logging)
 * @returns {ChatBedrockConverse} Initialized model instance
 */
function createNodeModel(nodeConfig, reasoning, reasoningModels, credentials, nodeName) {
  const modelId = nodeConfig.id;
  const maxTokens = nodeConfig.max_tokens;
  
  // Build base configuration
  const config = {
    model: modelId,
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    },
    maxTokens: maxTokens,
    temperature: MODEL_TEMPERATURE_DEFAULT
  };
  
  // Add session token if present
  if (credentials.sessionToken && credentials.sessionToken.trim()) {
    config.credentials.sessionToken = credentials.sessionToken.trim();
  }
  
  // Check if reasoning is enabled and model supports reasoning
  const reasoningEnabled = reasoning > 0 && reasoningModels.includes(modelId);
  
  if (reasoningEnabled) {
    // Get reasoning budget from nodeConfig
    const reasoningBudget = nodeConfig.reasoning_budget[reasoning.toString()];
    
    if (!reasoningBudget) {
      console.warn(
        `No reasoning budget defined for ${nodeName} at level ${reasoning}, using default`
      );
    } else {
      // Add modelKwargs with thinking configuration
      config.modelKwargs = {
        thinking: {
          type: 'enabled',
          budget: reasoningBudget
        }
      };
      // Set temperature to MODEL_TEMPERATURE_REASONING when reasoning is enabled
      config.temperature = MODEL_TEMPERATURE_REASONING;
      
      console.log(
        `Reasoning enabled for ${nodeName}: budget=${reasoningBudget}, model=${modelId}`
      );
    }
  } else if (reasoning > 0) {
    // Log warning if reasoning requested but model doesn't support it
    console.warn(
      `Reasoning requested for ${nodeName} but model ${modelId} does not support it`
    );
  }
  
  // Return initialized ChatBedrockConverse instance
  return new ChatBedrockConverse(config);
}

/**
 * Create a standard model without reasoning
 * @param {Object} modelConfig - Model configuration (id, max_tokens)
 * @param {Object} credentials - AWS credentials
 * @param {string} modelName - Name of the model (for logging)
 * @returns {ChatBedrockConverse} Initialized model instance
 */
function createStandardModel(modelConfig, credentials, modelName) {
  // Build ChatBedrockConverse configuration
  const config = {
    model: modelConfig.id,
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    },
    maxTokens: modelConfig.max_tokens,
    temperature: MODEL_TEMPERATURE_DEFAULT
  };
  
  // Add session token if present
  if (credentials.sessionToken && credentials.sessionToken.trim()) {
    config.credentials.sessionToken = credentials.sessionToken.trim();
  }
  
  // Log model initialization
  console.log(`Initialized ${modelName} model: ${modelConfig.id}`);
  
  // Return initialized ChatBedrockConverse instance
  return new ChatBedrockConverse(config);
}

/**
 * Initialize all models with granular configuration
 * @param {number} reasoning - Reasoning level (0-3)
 * @param {Object} customConfig - Optional custom configuration (defaults to DEFAULT_MODEL_CONFIG)
 * @returns {Object} Object containing all initialized model instances
 */
export function initializeModels(reasoning = 0, customConfig = null) {
  try {
    const config = customConfig || DEFAULT_MODEL_CONFIG;
    
    // Call validateModelConfig to validate configuration before initialization
    validateModelConfig(config);
    
    // Get AWS credentials
    const credentials = getCredentials();
    if (!credentials) {
      throw new Error('AWS credentials not configured');
    }
    
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error('Invalid AWS credentials: missing accessKeyId or secretAccessKey');
    }
    
    console.log('Initializing models with reasoning level:', reasoning);
    
    // Call createNodeModel for assets with config.model_main.assets
    const assets_model = createNodeModel(
      config.model_main.assets,
      reasoning,
      config.reasoning_models,
      credentials,
      'assets'
    );
    
    // Call createNodeModel for flows with config.model_main.flows
    const flows_model = createNodeModel(
      config.model_main.flows,
      reasoning,
      config.reasoning_models,
      credentials,
      'flows'
    );
    
    // Call createNodeModel for threats with config.model_main.threats
    const threats_model = createNodeModel(
      config.model_main.threats,
      reasoning,
      config.reasoning_models,
      credentials,
      'threats'
    );
    
    // Call createNodeModel for gaps with config.model_main.gaps
    const gaps_model = createNodeModel(
      config.model_main.gaps,
      reasoning,
      config.reasoning_models,
      credentials,
      'gaps'
    );
    
    // Call createStandardModel for summary with config.model_summary
    const summary_model = createStandardModel(
      config.model_summary,
      credentials,
      'summary'
    );
    
    // Call createStandardModel for struct with config.model_struct
    const struct_model = createStandardModel(
      config.model_struct,
      credentials,
      'struct'
    );
    
    console.log('All models initialized successfully');
    
    // Return object with assets_model, flows_model, threats_model, gaps_model, summary_model, and struct_model
    return {
      assets_model,
      flows_model,
      threats_model,
      gaps_model,
      summary_model,
      struct_model
    };
  } catch (error) {
    // Add error handling with meaningful error messages
    console.error('Failed to initialize models:', error);
    
    if (error.message.includes('credentials')) {
      throw new Error('AWS credentials are invalid or missing: ' + error.message);
    } else if (error.message.includes('Configuration')) {
      throw new Error('Model configuration is invalid: ' + error.message);
    } else {
      throw new Error('Failed to initialize models: ' + error.message);
    }
  }
}

/**
 * @deprecated ModelService class is deprecated. Use direct model invocation with model.withStructuredOutput() instead.
 * This class is kept for backward compatibility only.
 * 
 * Service for managing model interactions
 */
export class ModelService {
  // Class kept for backward compatibility but all methods have been removed.
  // Use direct model invocation instead:
  // const model = config.configurable.model_assets; // or model_flows, model_threats, etc.
  // const model_with_structure = model.withStructuredOutput(schema);
  // const response = await model_with_structure.invoke(messages);
}

/**
 * @deprecated modelService instance is deprecated. Use direct model invocation instead.
 * Default model service instance kept for backward compatibility
 */
export const modelService = new ModelService();
