/**
 * Model configuration for granular per-node model selection and reasoning budgets.
 * 
 * This configuration matches the Python backend's model configuration structure,
 * supporting different models and reasoning token budgets for each workflow node
 * (assets, flows, threats, gaps) based on the reasoning level selected by the user.
 */

/**
 * Default model configuration with per-node settings
 * 
 * Structure:
 * - model_main: Per-node model configurations for workflow nodes
 *   - Each node (assets, flows, threats, gaps) has:
 *     - id: Model ID (e.g., "anthropic.claude-3-5-haiku-20241022-v1:0")
 *     - max_tokens: Maximum tokens for the model
 *     - reasoning_budget: Token budgets for reasoning levels 1, 2, and 3
 * 
 * - model_summary: Configuration for summary generation
 *   - id: Model ID
 *   - max_tokens: Maximum tokens
 * 
 * - model_struct: Configuration for structured output
 *   - id: Model ID
 *   - max_tokens: Maximum tokens
 * 
 * - reasoning_models: Array of model IDs that support extended thinking/reasoning
 */
export const DEFAULT_MODEL_CONFIG = {
  model_main: {
    assets: {
      id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
      max_tokens: 64000,
      reasoning_budget: {
        "1": 16000,
        "2": 32000,
        "3": 63999
      }
    },
    flows: {
      id: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      max_tokens: 64000,
      reasoning_budget: {
        "1": 8000,
        "2": 16000,
        "3": 24000
      }
    },
    threats: {
      id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
      max_tokens: 64000,
      reasoning_budget: {
        "1": 24000,
        "2": 48000,
        "3": 63999
      }
    },
    gaps: {
      id: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      max_tokens: 64000,
      reasoning_budget: {
        "1": 4000,
        "2": 8000,
        "3": 12000
      }
    }
  },

  model_summary: {
    id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    max_tokens: 4000
  },

  model_struct: {
    id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    max_tokens: 64000
  },

  reasoning_models: [
    "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0"
  ]
};

export default DEFAULT_MODEL_CONFIG;
