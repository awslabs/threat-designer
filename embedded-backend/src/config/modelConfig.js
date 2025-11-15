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
        1: 24000,
        2: 48000,
        3: 63999,
      },
    },
    flows: {
      id: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      max_tokens: 64000,
      reasoning_budget: {
        1: 24000,
        2: 48000,
        3: 64000,
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
    threats_agent: {
      id: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
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
        1: 24000,
        2: 48000,
        3: 63999,
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
 *   - Each node (assets, flows, threats, threats_agent, gaps) has:
 *     - id: Model ID (e.g., "gpt-5-mini-2025-08-07")
 *     - max_tokens: Maximum tokens for the model
 *     - reasoning_effort: Map of reasoning levels (0-3) to effort values
 *       - Values: "minimal", "low", "medium", "high"
 *       - Each node has its own reasoning effort mapping based on complexity
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
      id: "gpt-5.1-2025-11-13",
      max_tokens: 64000,
      reasoning_effort: {
        0: "none",
        1: "low",
        2: "medium",
        3: "high",
      },
    },
    flows: {
      id: "gpt-5.1-2025-11-13",
      max_tokens: 64000,
      reasoning_effort: {
        0: "none",
        1: "low",
        2: "medium",
        3: "high",
      },
    },
    threats: {
      id: "gpt-5-mini-2025-08-07",
      max_tokens: 128000,
      reasoning_effort: {
        0: "minimal",
        1: "low",
        2: "medium",
        3: "high",
      },
    },
    threats_agent: {
      id: "gpt-5.1-2025-11-13",
      max_tokens: 128000,
      reasoning_effort: {
        0: "none",
        1: "low",
        2: "medium",
        3: "high",
      },
    },
    gaps: {
      id: "gpt-5.1-2025-11-13",
      max_tokens: 64000,
      reasoning_effort: {
        0: "none",
        1: "low",
        2: "medium",
        3: "high",
      },
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

  openai_reasoning_models: ["gpt-5-2025-08-07", "gpt-5-mini-2025-08-07", "gpt-5.1-2025-11-13"],
};

export default DEFAULT_MODEL_CONFIG;
