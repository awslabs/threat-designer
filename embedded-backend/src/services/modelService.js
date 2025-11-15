/**
 * Model service layer for centralized model interactions.
 *
 * This module provides the ModelService class for managing interactions with
 * Amazon models using ChatBedrockConverse.
 */

import { ChatBedrockConverse } from "@langchain/aws";
import { ChatOpenAI } from "@langchain/openai";
import { getCredentials } from "../config/credentials.js";
import { DEFAULT_MODEL_CONFIG, OPENAI_MODEL_CONFIG } from "../config/modelConfig.js";
import { validateModelConfig } from "../config/configValidator.js";
import {
  OpenAIAuthenticationError,
  OpenAIRateLimitError,
  ModelProviderError,
  mapProviderError,
} from "../adapter/errors.js";

// Temperature constants
const MODEL_TEMPERATURE_DEFAULT = 0.0;

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
    throw new Error("AWS credentials not configured");
  }

  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error("Invalid AWS credentials: missing accessKeyId or secretAccessKey");
  }

  // Build credentials object, only include sessionToken if it exists
  const credentialsConfig = {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
  };

  // Only add sessionToken if it's provided and not null/empty
  if (credentials.sessionToken && credentials.sessionToken.trim()) {
    credentialsConfig.sessionToken = credentials.sessionToken.trim();
  }

  return new ChatBedrockConverse({
    model: modelId,
    region: credentials.region,
    credentials: credentialsConfig,
    max_tokens: 64000,
    temperature,
    ...additionalConfig,
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
      secretAccessKey: credentials.secretAccessKey,
    },
    maxTokens: maxTokens,
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
      // When reasoning is enabled, do NOT set temperature as it conflicts with reasoning
      config.additionalModelRequestFields = {
        thinking: {
          type: "enabled",
          budget_tokens: reasoningBudget,
        },
        anthropic_beta: ["interleaved-thinking-2025-05-14"],
      };

      console.log(`Reasoning enabled for ${nodeName}: budget=${reasoningBudget}, model=${modelId}`);
    }
  } else {
    // Only set temperature when reasoning is NOT enabled
    config.temperature = MODEL_TEMPERATURE_DEFAULT;

    if (reasoning > 0) {
      // Log warning if reasoning requested but model doesn't support it
      console.warn(`Reasoning requested for ${nodeName} but model ${modelId} does not support it`);
    }
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
      secretAccessKey: credentials.secretAccessKey,
    },
    maxTokens: modelConfig.max_tokens,
    temperature: MODEL_TEMPERATURE_DEFAULT,
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
 * Create an OpenAI model instance with optional reasoning
 * @param {Object} modelConfig - Model configuration (id, max_tokens, reasoning_effort)
 * @param {number} reasoning - Reasoning level (0-3)
 * @param {Array} reasoningModels - List of model IDs that support reasoning_effort
 * @param {string} apiKey - OpenAI API key
 * @param {string} modelName - Name of the model (for logging)
 * @returns {ChatOpenAI} Initialized ChatOpenAI instance
 */
function _createOpenAIModel(modelConfig, reasoning, reasoningModels, apiKey, modelName) {
  try {
    const config = {
      model: modelConfig.id,
      maxTokens: modelConfig.max_tokens,
      apiKey: apiKey,
      useResponsesApi: true, // Required for GPT-5 models
      temperature: 1, // Required for GPT-5 reasoning models
      model_kwargs: {
        store: true,
      },
    };

    // Add reasoning configuration if model supports it
    if (reasoningModels.includes(modelConfig.id)) {
      // Get reasoning effort from the per-node configuration
      let reasoningEffort = modelConfig.reasoning_effort?.[reasoning];

      // Special handling for GPT-5.1: use "none" when reasoning=0
      if (reasoning === 0 && modelConfig.id.includes("gpt-5.1")) {
        reasoningEffort = "none";
      }

      if (reasoningEffort) {
        config.reasoning = {
          effort: reasoningEffort,
          summary: "detailed",
        };
        console.log(
          `Reasoning configured for ${modelName}: effort=${reasoningEffort}, level=${reasoning}, model=${modelConfig.id}`
        );
      } else {
        console.warn(
          `No reasoning effort defined for ${modelName} at level ${reasoning}, using default minimal`
        );
        config.reasoning = {
          effort: "minimal",
          summary: "detailed",
        };
      }
    } else if (reasoning > 0) {
      console.warn(
        `Reasoning requested for ${modelName} but model ${modelConfig.id} does not support it`
      );
    }

    console.log(`Initialized ${modelName} model: ${modelConfig.id}`);

    return new ChatOpenAI(config);
  } catch (error) {
    // Map OpenAI-specific errors
    const mappedError = mapProviderError(error, "openai");
    console.error(`Failed to initialize OpenAI model ${modelName}:`, mappedError.message);
    throw mappedError;
  }
}

/**
 * Initialize all OpenAI models
 * @param {number} reasoning - Reasoning level (0-3)
 * @param {Object} config - OpenAI model configuration
 * @param {Object} credentials - Credentials object with openaiApiKey
 * @returns {Object} Object containing all initialized OpenAI model instances
 */
function _initializeOpenAIModels(reasoning, config, credentials) {
  try {
    console.log("Initializing OpenAI models with reasoning level:", reasoning);

    const apiKey = credentials.openaiApiKey;

    // Validate API key before attempting initialization
    if (!apiKey || apiKey.trim() === "") {
      throw new OpenAIAuthenticationError(
        "OpenAI API key is missing. Please provide a valid API key."
      );
    }

    // Initialize node models (assets, flows, threats, gaps)
    const assets_model = _createOpenAIModel(
      config.openai_model_main.assets,
      reasoning,
      config.openai_reasoning_models,
      apiKey,
      "assets"
    );

    const flows_model = _createOpenAIModel(
      config.openai_model_main.flows,
      reasoning,
      config.openai_reasoning_models,
      apiKey,
      "flows"
    );

    const threats_model = _createOpenAIModel(
      config.openai_model_main.threats,
      reasoning,
      config.openai_reasoning_models,
      apiKey,
      "threats"
    );

    const threats_agent_model = _createOpenAIModel(
      config.openai_model_main.threats_agent,
      reasoning,
      config.openai_reasoning_models,
      apiKey,
      "threats_agent"
    );

    const gaps_model = _createOpenAIModel(
      config.openai_model_main.gaps,
      reasoning,
      config.openai_reasoning_models,
      apiKey,
      "gaps"
    );

    // Initialize standard models (summary, struct)
    const summary_model = _createOpenAIModel(
      config.openai_model_summary,
      0, // No reasoning for summary
      config.openai_reasoning_models,
      apiKey,
      "summary"
    );

    const struct_model = _createOpenAIModel(
      config.openai_model_struct,
      0, // No reasoning for struct
      config.openai_reasoning_models,
      apiKey,
      "struct"
    );

    console.log("All OpenAI models initialized successfully");

    return {
      assets_model,
      flows_model,
      threats_model,
      threats_agent_model,
      gaps_model,
      summary_model,
      struct_model,
    };
  } catch (error) {
    // If it's already one of our custom errors, re-throw it
    if (
      error instanceof OpenAIAuthenticationError ||
      error instanceof OpenAIRateLimitError ||
      error instanceof ModelProviderError
    ) {
      throw error;
    }

    // Otherwise, map it to a provider error
    const mappedError = mapProviderError(error, "openai");
    console.error("Failed to initialize OpenAI models:", mappedError.message);
    throw mappedError;
  }
}

/**
 * Initialize all Bedrock models (existing functionality)
 * @param {number} reasoning - Reasoning level (0-3)
 * @param {Object} config - Bedrock model configuration
 * @param {Object} credentials - AWS credentials
 * @returns {Object} Object containing all initialized Bedrock model instances
 */
function _initializeBedrockModels(reasoning, config, credentials) {
  console.log("Initializing Bedrock models with reasoning level:", reasoning);

  // Call createNodeModel for assets with config.model_main.assets
  const assets_model = createNodeModel(
    config.model_main.assets,
    reasoning,
    config.reasoning_models,
    credentials,
    "assets"
  );

  // Call createNodeModel for flows with config.model_main.flows
  const flows_model = createNodeModel(
    config.model_main.flows,
    reasoning,
    config.reasoning_models,
    credentials,
    "flows"
  );

  // Call createNodeModel for threats with config.model_main.threats
  const threats_model = createNodeModel(
    config.model_main.threats,
    reasoning,
    config.reasoning_models,
    credentials,
    "threats"
  );

  // Call createNodeModel for threats_agent with config.model_main.threats_agent
  const threats_agent_model = createNodeModel(
    config.model_main.threats_agent,
    reasoning,
    config.reasoning_models,
    credentials,
    "threats_agent"
  );

  // Call createNodeModel for gaps with config.model_main.gaps
  const gaps_model = createNodeModel(
    config.model_main.gaps,
    reasoning,
    config.reasoning_models,
    credentials,
    "gaps"
  );

  // Call createStandardModel for summary with config.model_summary
  const summary_model = createStandardModel(config.model_summary, credentials, "summary");

  // Call createStandardModel for struct with config.model_struct
  const struct_model = createStandardModel(config.model_struct, credentials, "struct");

  console.log("All Bedrock models initialized successfully");

  return {
    assets_model,
    flows_model,
    threats_model,
    threats_agent_model,
    gaps_model,
    summary_model,
    struct_model,
  };
}

/**
 * Initialize all models with granular configuration
 * @param {number} reasoning - Reasoning level (0-3)
 * @param {Object} customConfig - Optional custom configuration (defaults to DEFAULT_MODEL_CONFIG)
 * @returns {Object} Object containing all initialized model instances
 */
export function initializeModels(reasoning = 0, customConfig = null) {
  try {
    // Get credentials to determine provider
    const credentials = getCredentials();
    if (!credentials) {
      throw new ModelProviderError("Provider credentials not configured", "unknown");
    }

    if (!credentials.provider) {
      throw new ModelProviderError("No provider configuration found", "unknown");
    }

    const provider = credentials.provider;

    // Route to appropriate initialization based on provider
    if (provider === "bedrock") {
      const config = customConfig || DEFAULT_MODEL_CONFIG;

      // Validate Bedrock configuration
      validateModelConfig(config, "bedrock");

      // Validate AWS credentials
      if (!credentials.accessKeyId || !credentials.secretAccessKey) {
        throw new ModelProviderError(
          "Invalid AWS credentials: missing accessKeyId or secretAccessKey",
          "bedrock"
        );
      }

      return _initializeBedrockModels(reasoning, config, credentials);
    } else if (provider === "openai") {
      const config = customConfig || OPENAI_MODEL_CONFIG;

      // Validate OpenAI configuration
      validateModelConfig(config, "openai");

      // Validate OpenAI API key
      if (!credentials.openaiApiKey) {
        throw new OpenAIAuthenticationError("Invalid OpenAI credentials: missing API key");
      }

      return _initializeOpenAIModels(reasoning, config, credentials);
    } else {
      throw new ModelProviderError(`Unsupported provider: ${provider}`, provider);
    }
  } catch (error) {
    // If it's already one of our custom errors, re-throw it
    if (
      error instanceof OpenAIAuthenticationError ||
      error instanceof OpenAIRateLimitError ||
      error instanceof ModelProviderError
    ) {
      console.error("Model initialization failed:", error.message);
      throw error;
    }

    // Map generic errors based on content
    console.error("Failed to initialize models:", error);

    if (error.message.includes("credentials") || error.message.includes("API key")) {
      throw new ModelProviderError(
        "Provider credentials are invalid or missing: " + error.message,
        "unknown"
      );
    } else if (error.message.includes("Configuration")) {
      throw new ModelProviderError("Model configuration is invalid: " + error.message, "unknown");
    } else if (error.message.includes("provider")) {
      throw new ModelProviderError("Provider configuration error: " + error.message, "unknown");
    } else {
      throw new ModelProviderError("Failed to initialize models: " + error.message, "unknown");
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
