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
 * - Reasoning budget entries for levels "1", "2", and "3"
 */

/**
 * Validate model configuration structure
 * 
 * @param {Object} config - Configuration object to validate
 * @throws {Error} If configuration is invalid with descriptive error message
 * @returns {boolean} True if validation passes
 */
export function validateModelConfig(config) {
  // Validate top-level config object
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be a valid object');
  }

  // Validate model_main structure
  if (!config.model_main) {
    throw new Error('Configuration missing model_main');
  }

  if (typeof config.model_main !== 'object') {
    throw new Error('Configuration model_main must be an object');
  }

  // Validate each node configuration
  const nodes = ['assets', 'flows', 'threats', 'gaps'];
  for (const node of nodes) {
    validateNodeConfig(config.model_main, node);
  }

  // Validate model_summary
  validateSimpleModelConfig(config, 'model_summary');

  // Validate model_struct
  validateSimpleModelConfig(config, 'model_struct');

  // Validate reasoning_models
  if (!Array.isArray(config.reasoning_models)) {
    throw new Error('Configuration reasoning_models must be an array');
  }

  return true;
}

/**
 * Validate a node-specific model configuration
 * 
 * @param {Object} modelMain - The model_main configuration object
 * @param {string} nodeName - Name of the node to validate (e.g., 'assets', 'flows')
 * @throws {Error} If node configuration is invalid
 */
function validateNodeConfig(modelMain, nodeName) {
  // Check if node exists
  if (!modelMain[nodeName]) {
    throw new Error(`Configuration missing model_main.${nodeName}`);
  }

  const nodeConfig = modelMain[nodeName];

  // Validate it's an object
  if (typeof nodeConfig !== 'object') {
    throw new Error(`Configuration model_main.${nodeName} must be an object`);
  }

  // Validate id field
  if (!nodeConfig.id) {
    throw new Error(`Configuration missing model_main.${nodeName}.id`);
  }

  if (typeof nodeConfig.id !== 'string' || nodeConfig.id.trim() === '') {
    throw new Error(`Configuration model_main.${nodeName}.id must be a non-empty string`);
  }

  // Validate max_tokens field
  if (typeof nodeConfig.max_tokens !== 'number') {
    throw new Error(`Configuration model_main.${nodeName}.max_tokens must be a number`);
  }

  if (nodeConfig.max_tokens <= 0 || !Number.isInteger(nodeConfig.max_tokens)) {
    throw new Error(`Configuration model_main.${nodeName}.max_tokens must be a positive integer`);
  }

  // Validate reasoning_budget exists
  if (!nodeConfig.reasoning_budget) {
    throw new Error(`Configuration missing model_main.${nodeName}.reasoning_budget`);
  }

  if (typeof nodeConfig.reasoning_budget !== 'object') {
    throw new Error(`Configuration model_main.${nodeName}.reasoning_budget must be an object`);
  }

  // Validate reasoning budget levels
  const requiredLevels = ['1', '2', '3'];
  for (const level of requiredLevels) {
    if (!(level in nodeConfig.reasoning_budget)) {
      throw new Error(
        `Configuration missing model_main.${nodeName}.reasoning_budget["${level}"]`
      );
    }

    const budgetValue = nodeConfig.reasoning_budget[level];

    if (typeof budgetValue !== 'number') {
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
 * Validate a simple model configuration (model_summary or model_struct)
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
  if (typeof modelConfig !== 'object') {
    throw new Error(`Configuration ${modelName} must be an object`);
  }

  // Validate id field
  if (!modelConfig.id) {
    throw new Error(`Configuration missing ${modelName}.id`);
  }

  if (typeof modelConfig.id !== 'string' || modelConfig.id.trim() === '') {
    throw new Error(`Configuration ${modelName}.id must be a non-empty string`);
  }

  // Validate max_tokens field
  if (typeof modelConfig.max_tokens !== 'number') {
    throw new Error(`Configuration ${modelName}.max_tokens must be a number`);
  }

  if (modelConfig.max_tokens <= 0 || !Number.isInteger(modelConfig.max_tokens)) {
    throw new Error(`Configuration ${modelName}.max_tokens must be a positive integer`);
  }
}

export default validateModelConfig;
