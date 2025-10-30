/**
 * Configuration validator for model configuration.
 *
 * Validates the structure and values of model configuration objects to ensure
 * they meet the requirements for granular per-node model configuration.
 *
 * Validation includes:
 * - Presence of all required fields
 * - Correct data types for all fields
 * - Positive integer values for max_tokens and reasoning_budget values
 * - Reasoning budget entries for levels "1", "2", and "3" (Bedrock only)
 * - Provider-specific model ID validation
 * - Provider-specific max_tokens range validation
 */

/**
 * Validate model configuration structure based on provider
 *
 * @param {Object} config - Configuration object to validate
 * @param {string} provider - Provider type ('bedrock' or 'openai')
 * @throws {Error} If configuration is invalid with descriptive error message
 * @returns {boolean} True if validation passes
 */
export function validateModelConfig(config, provider = "bedrock") {
  // Validate top-level config object
  if (!config || typeof config !== "object") {
    throw new Error("Configuration must be a valid object");
  }

  // Validate provider parameter
  if (provider !== "bedrock" && provider !== "openai") {
    throw new Error(`Invalid provider: ${provider}. Must be 'bedrock' or 'openai'`);
  }

  // Route to provider-specific validation
  if (provider === "bedrock") {
    return _validateBedrockConfig(config);
  } else {
    return _validateOpenAIConfig(config);
  }
}

/**
 * Validate Bedrock model configuration
 *
 * @param {Object} config - Configuration object to validate
 * @throws {Error} If configuration is invalid
 * @returns {boolean} True if validation passes
 * @private
 */
function _validateBedrockConfig(config) {
  // Validate model_main structure
  if (!config.model_main) {
    throw new Error("Configuration missing model_main");
  }

  if (typeof config.model_main !== "object") {
    throw new Error("Configuration model_main must be an object");
  }

  // Validate each node configuration
  const nodes = ["assets", "flows", "threats", "gaps"];
  for (const node of nodes) {
    _validateBedrockNodeConfig(config.model_main, node);
  }

  // Validate model_summary
  validateSimpleModelConfig(config, "model_summary");

  // Validate model_struct
  validateSimpleModelConfig(config, "model_struct");

  // Validate reasoning_models
  if (!Array.isArray(config.reasoning_models)) {
    throw new Error("Configuration reasoning_models must be an array");
  }

  return true;
}

/**
 * Validate OpenAI model configuration
 *
 * @param {Object} config - Configuration object to validate
 * @throws {Error} If configuration is invalid
 * @returns {boolean} True if validation passes
 * @private
 */
function _validateOpenAIConfig(config) {
  // Validate openai_model_main structure
  if (!config.openai_model_main) {
    throw new Error("Configuration missing openai_model_main");
  }

  if (typeof config.openai_model_main !== "object") {
    throw new Error("Configuration openai_model_main must be an object");
  }

  // Validate each node configuration
  const nodes = ["assets", "flows", "threats", "gaps"];
  for (const node of nodes) {
    _validateOpenAINodeConfig(config.openai_model_main, node, config.openai_reasoning_models);
  }

  // Validate openai_model_summary
  _validateOpenAISimpleModelConfig(config, "openai_model_summary", config.openai_reasoning_models);

  // Validate openai_model_struct
  _validateOpenAISimpleModelConfig(config, "openai_model_struct", config.openai_reasoning_models);

  // Validate openai_reasoning_models
  if (!Array.isArray(config.openai_reasoning_models)) {
    throw new Error("Configuration openai_reasoning_models must be an array");
  }

  return true;
}

/**
 * Validate a Bedrock node-specific model configuration
 *
 * @param {Object} modelMain - The model_main configuration object
 * @param {string} nodeName - Name of the node to validate (e.g., 'assets', 'flows')
 * @throws {Error} If node configuration is invalid
 * @private
 */
function _validateBedrockNodeConfig(modelMain, nodeName) {
  // Check if node exists
  if (!modelMain[nodeName]) {
    throw new Error(`Configuration missing model_main.${nodeName}`);
  }

  const nodeConfig = modelMain[nodeName];

  // Validate it's an object
  if (typeof nodeConfig !== "object") {
    throw new Error(`Configuration model_main.${nodeName} must be an object`);
  }

  // Validate id field
  if (!nodeConfig.id) {
    throw new Error(`Configuration missing model_main.${nodeName}.id`);
  }

  if (typeof nodeConfig.id !== "string" || nodeConfig.id.trim() === "") {
    throw new Error(`Configuration model_main.${nodeName}.id must be a non-empty string`);
  }

  // Validate max_tokens field
  if (typeof nodeConfig.max_tokens !== "number") {
    throw new Error(`Configuration model_main.${nodeName}.max_tokens must be a number`);
  }

  if (nodeConfig.max_tokens <= 0 || !Number.isInteger(nodeConfig.max_tokens)) {
    throw new Error(`Configuration model_main.${nodeName}.max_tokens must be a positive integer`);
  }

  // Validate reasoning_budget exists
  if (!nodeConfig.reasoning_budget) {
    throw new Error(`Configuration missing model_main.${nodeName}.reasoning_budget`);
  }

  if (typeof nodeConfig.reasoning_budget !== "object") {
    throw new Error(`Configuration model_main.${nodeName}.reasoning_budget must be an object`);
  }

  // Validate reasoning budget levels
  const requiredLevels = ["1", "2", "3"];
  for (const level of requiredLevels) {
    if (!(level in nodeConfig.reasoning_budget)) {
      throw new Error(`Configuration missing model_main.${nodeName}.reasoning_budget["${level}"]`);
    }

    const budgetValue = nodeConfig.reasoning_budget[level];

    if (typeof budgetValue !== "number") {
      throw new Error(
        `Configuration model_main.${nodeName}.reasoning_budget["${level}"] must be a number`
      );
    }

    if (budgetValue <= 0 || !Number.isInteger(budgetValue)) {
      throw new Error(
        `Configuration model_main.${nodeName}.reasoning_budget["${level}"] must be a positive integer`
      );
    }
  }
}

/**
 * Validate an OpenAI node-specific model configuration
 *
 * @param {Object} modelMain - The openai_model_main configuration object
 * @param {string} nodeName - Name of the node to validate (e.g., 'assets', 'flows')
 * @param {Array<string>} reasoningModels - Array of model IDs that support reasoning
 * @throws {Error} If node configuration is invalid
 * @private
 */
function _validateOpenAINodeConfig(modelMain, nodeName, reasoningModels = []) {
  // Check if node exists
  if (!modelMain[nodeName]) {
    throw new Error(`Configuration missing openai_model_main.${nodeName}`);
  }

  const nodeConfig = modelMain[nodeName];

  // Validate it's an object
  if (typeof nodeConfig !== "object") {
    throw new Error(`Configuration openai_model_main.${nodeName} must be an object`);
  }

  // Validate id field
  if (!nodeConfig.id) {
    throw new Error(`Configuration missing openai_model_main.${nodeName}.id`);
  }

  if (typeof nodeConfig.id !== "string" || nodeConfig.id.trim() === "") {
    throw new Error(`Configuration openai_model_main.${nodeName}.id must be a non-empty string`);
  }

  // Validate that model ID is from GPT-5 family
  if (!nodeConfig.id.startsWith("gpt-5")) {
    throw new Error(
      `Configuration openai_model_main.${nodeName}.id must be a GPT-5 family model (e.g., gpt-5-2025-08-07 or gpt-5-mini-2025-08-07)`
    );
  }

  // Validate max_tokens field
  if (typeof nodeConfig.max_tokens !== "number") {
    throw new Error(`Configuration openai_model_main.${nodeName}.max_tokens must be a number`);
  }

  if (nodeConfig.max_tokens <= 0 || !Number.isInteger(nodeConfig.max_tokens)) {
    throw new Error(
      `Configuration openai_model_main.${nodeName}.max_tokens must be a positive integer`
    );
  }

  // Validate max_tokens is within acceptable range for OpenAI (typically up to 128k for GPT-5)
  const MAX_OPENAI_TOKENS = 128000;
  if (nodeConfig.max_tokens > MAX_OPENAI_TOKENS) {
    throw new Error(
      `Configuration openai_model_main.${nodeName}.max_tokens exceeds maximum allowed (${MAX_OPENAI_TOKENS})`
    );
  }

  // Note: OpenAI uses reasoning_effort parameter instead of reasoning_budget
  // reasoning_budget should NOT be present in OpenAI configuration
  if (nodeConfig.reasoning_budget) {
    throw new Error(
      `Configuration openai_model_main.${nodeName} should not contain reasoning_budget (OpenAI uses reasoning_effort parameter)`
    );
  }
}

/**
 * Validate a simple model configuration (model_summary or model_struct) for Bedrock
 *
 * @param {Object} config - The full configuration object
 * @param {string} modelName - Name of the model config to validate (e.g., 'model_summary')
 * @throws {Error} If model configuration is invalid
 */
function validateSimpleModelConfig(config, modelName) {
  // Check if model config exists
  if (!config[modelName]) {
    throw new Error(`Configuration missing ${modelName}`);
  }

  const modelConfig = config[modelName];

  // Validate it's an object
  if (typeof modelConfig !== "object") {
    throw new Error(`Configuration ${modelName} must be an object`);
  }

  // Validate id field
  if (!modelConfig.id) {
    throw new Error(`Configuration missing ${modelName}.id`);
  }

  if (typeof modelConfig.id !== "string" || modelConfig.id.trim() === "") {
    throw new Error(`Configuration ${modelName}.id must be a non-empty string`);
  }

  // Validate max_tokens field
  if (typeof modelConfig.max_tokens !== "number") {
    throw new Error(`Configuration ${modelName}.max_tokens must be a number`);
  }

  if (modelConfig.max_tokens <= 0 || !Number.isInteger(modelConfig.max_tokens)) {
    throw new Error(`Configuration ${modelName}.max_tokens must be a positive integer`);
  }
}

/**
 * Validate a simple OpenAI model configuration (openai_model_summary or openai_model_struct)
 *
 * @param {Object} config - The full configuration object
 * @param {string} modelName - Name of the model config to validate (e.g., 'openai_model_summary')
 * @param {Array<string>} reasoningModels - Array of model IDs that support reasoning
 * @throws {Error} If model configuration is invalid
 * @private
 */
function _validateOpenAISimpleModelConfig(config, modelName, reasoningModels = []) {
  // Check if model config exists
  if (!config[modelName]) {
    throw new Error(`Configuration missing ${modelName}`);
  }

  const modelConfig = config[modelName];

  // Validate it's an object
  if (typeof modelConfig !== "object") {
    throw new Error(`Configuration ${modelName} must be an object`);
  }

  // Validate id field
  if (!modelConfig.id) {
    throw new Error(`Configuration missing ${modelName}.id`);
  }

  if (typeof modelConfig.id !== "string" || modelConfig.id.trim() === "") {
    throw new Error(`Configuration ${modelName}.id must be a non-empty string`);
  }

  // Validate that model ID is from GPT-5 family
  if (!modelConfig.id.startsWith("gpt-5")) {
    throw new Error(
      `Configuration ${modelName}.id must be a GPT-5 family model (e.g., gpt-5-2025-08-07 or gpt-5-mini-2025-08-07)`
    );
  }

  // Validate max_tokens field
  if (typeof modelConfig.max_tokens !== "number") {
    throw new Error(`Configuration ${modelName}.max_tokens must be a number`);
  }

  if (modelConfig.max_tokens <= 0 || !Number.isInteger(modelConfig.max_tokens)) {
    throw new Error(`Configuration ${modelName}.max_tokens must be a positive integer`);
  }

  // Validate max_tokens is within acceptable range for OpenAI
  const MAX_OPENAI_TOKENS = 128000;
  if (modelConfig.max_tokens > MAX_OPENAI_TOKENS) {
    throw new Error(
      `Configuration ${modelName}.max_tokens exceeds maximum allowed (${MAX_OPENAI_TOKENS})`
    );
  }

  // Ensure reasoning_budget is not present
  if (modelConfig.reasoning_budget) {
    throw new Error(
      `Configuration ${modelName} should not contain reasoning_budget (OpenAI uses reasoning_effort parameter)`
    );
  }
}

export default validateModelConfig;
