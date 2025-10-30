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
        1: 16000,
        2: 32000,
        3: 63999,
      },
    },
    flows: {
      id: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      max_tokens: 64000,
      reasoning_budget: {
        1: 8000,
        2: 16000,
        3: 24000,
      },
    },
    threats: {
      id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
      max_tokens: 64000,
      reasoning_budget: {
        1: 24000,
        2: 48000,
        3: 63999,
      },
    },
    gaps: {
      id: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      max_tokens: 64000,
      reasoning_budget: {
        1: 4000,
        2: 8000,
        3: 12000,
      },
    },
  },

  model_summary: {
    id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    max_tokens: 4000,
  },

  model_struct: {
    id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    max_tokens: 64000,
  },

  reasoning_models: [
    "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
    "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
  ],
};

/**
 * OpenAI model configuration for GPT-5 family models
 *
 * Structure:
 * - openai_model_main: Per-node model configurations for workflow nodes
 *   - Each node (assets, flows, threats, gaps) has:
 *     - id: Model ID (e.g., "gpt-5-mini-2025-08-07")
 *     - max_tokens: Maximum tokens for the model
 *   - Note: OpenAI uses reasoning_effort parameter instead of reasoning_budget
 *
 * - openai_model_summary: Configuration for summary generation
 *   - id: Model ID
 *   - max_tokens: Maximum tokens
 *
 * - openai_model_struct: Configuration for structured output
 *   - id: Model ID
 *   - max_tokens: Maximum tokens
 *
 * - openai_reasoning_models: Array of GPT-5 model IDs that support reasoning_effort
 */
export const OPENAI_MODEL_CONFIG = {
  openai_model_main: {
    assets: {
      id: "gpt-5-mini-2025-08-07",
      max_tokens: 64000,
    },
    flows: {
      id: "gpt-5-2025-08-07",
      max_tokens: 64000,
    },
    threats: {
      id: "gpt-5-mini-2025-08-07",
      max_tokens: 64000,
    },
    gaps: {
      id: "gpt-5-2025-08-07",
      max_tokens: 64000,
    },
  },

  openai_model_summary: {
    id: "gpt-5-mini-2025-08-07",
    max_tokens: 4000,
  },

  openai_model_struct: {
    id: "gpt-5-mini-2025-08-07",
    max_tokens: 64000,
  },

  openai_reasoning_models: ["gpt-5-2025-08-07", "gpt-5-mini-2025-08-07"],
};

/**
 * Reasoning effort mapping for OpenAI GPT-5 Mini models
 * Maps reasoning levels (0-3) to OpenAI reasoning_effort parameter values
 *
 * Mini models use the full range of reasoning efforts:
 * - 0: minimal - Fastest response, minimal reasoning
 * - 1: low - Quick response with basic reasoning
 * - 2: medium - Balanced reasoning and speed
 * - 3: high - Maximum reasoning depth
 */
export const OPENAI_REASONING_EFFORT_MAP_MINI = {
  0: "minimal",
  1: "low",
  2: "medium",
  3: "high",
};

/**
 * Reasoning effort mapping for OpenAI GPT-5 Standard models
 * Maps reasoning levels (0-3) to OpenAI reasoning_effort parameter values
 *
 * Standard models use conservative reasoning efforts to optimize cost/performance:
 * - 0: minimal - Fastest response, minimal reasoning
 * - 1: minimal - Still minimal reasoning (cost-effective)
 * - 2: low - Basic reasoning
 * - 3: low - Basic reasoning (cost-effective)
 */
export const OPENAI_REASONING_EFFORT_MAP_STANDARD = {
  0: "minimal",
  1: "minimal",
  2: "low",
  3: "low",
};

/**
 * Legacy export for backward compatibility
 * Defaults to mini model mapping
 * @deprecated Use OPENAI_REASONING_EFFORT_MAP_MINI or OPENAI_REASONING_EFFORT_MAP_STANDARD instead
 */
export const OPENAI_REASONING_EFFORT_MAP = OPENAI_REASONING_EFFORT_MAP_MINI;

export default DEFAULT_MODEL_CONFIG;
