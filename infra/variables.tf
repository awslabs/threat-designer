variable "env" {
  type    = string
  default = "dev"
}

variable "python_runtime" {
  type    = string
  default = "3.12"
}

variable "python_layer" {
  type    = string
  default = "python312"
}

variable "deletion_protection_enabled" {
  type    = bool
  default = false
}
variable "region" {
  default = "us-east-1"
}

variable "log_level" {
  default = "INFO"
}

variable "traceback_enabled" {
  type    = bool
  default = false
}

variable "api_gw_stage" {
  default = "dev"
}
variable "lambda_concurrency" {
  type        = number
  description = "Reserved concurrency setting for Lambda"
  default     = 50
}

variable "provisioned_lambda_concurrency" {
  type        = number
  description = "Provision concurrency setting for the lambda"
  default     = 3
}

variable "reasoning_models" {
  type = list(string)
  default = [
    "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    "eu.anthropic.claude-sonnet-4-20250514-v1:0",
    "us.anthropic.claude-opus-4-1-20250805-v1:0",
    "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "global.anthropic.claude-sonnet-4-20250514-v1:0",
    "global.anthropic.claude-haiku-4-5-20251001-v1:0"
  ]
}


variable "model_main" {
  type = object({
    assets = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
    })
    flows = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
    })
    gaps = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
    })
    threats = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
    })
    threats_agent = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
    })
  })
  default = {
    assets = {
      id         = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 16000
        "2" = 32000
        "3" = 63999
      }
    }
    flows = {
      id         = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 8000
        "2" = 16000
        "3" = 24000
      }
    }
    threats = {
      id         = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 24000
        "2" = 48000
        "3" = 63999
      }
    }
    threats_agent = {
      id         = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 24000
        "2" = 48000
        "3" = 63999
      }
    }
    gaps = {
      id         = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 8000
        "2" = 12000
        "3" = 16000
      }
    }
  }
}

variable "model_sentry" {
  type    = string
  default = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "model_struct" {
  type = object({
    id         = string
    max_tokens = number
  })
  default = {
    id         = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
    max_tokens = 64000
  }
}

variable "model_summary" {
  type = object({
    id         = string
    max_tokens = number
  })
  default = {
    id         = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    max_tokens = 4000
  }
}

variable "username" {
  type        = string
  description = "Cognito username"
}

variable "email" {
  type        = string
  description = "Cognito user email"
}

variable "given_name" {
  type        = string
  description = "Cognito user given name"
}

variable "family_name" {
  type        = string
  description = "Cognito user family name"
}

variable "enable_sentry" {
  type        = bool
  default     = true
  description = "Enable or disable Sentry assistant feature"
}

variable "model_provider" {
  type        = string
  description = "Model provider to use: bedrock or openai"
  default     = "openai"

  validation {
    condition     = contains(["bedrock", "openai"], var.model_provider)
    error_message = "model_provider must be either 'bedrock' or 'openai'"
  }
}

variable "openai_api_key" {
  type        = string
  description = "OpenAI API key for authentication (provided at deployment time, not stored locally)"
  default     = ""
  sensitive   = true
}

variable "openai_model_main" {
  type = object({
    assets = object({
      id               = string
      max_tokens       = number
      reasoning_effort = map(string)
    })
    flows = object({
      id               = string
      max_tokens       = number
      reasoning_effort = map(string)
    })
    gaps = object({
      id               = string
      max_tokens       = number
      reasoning_effort = map(string)
    })
    threats = object({
      id               = string
      max_tokens       = number
      reasoning_effort = map(string)
    })
    threats_agent = object({
      id               = string
      max_tokens       = number
      reasoning_effort = map(string)
    })
  })
  description = "OpenAI model configurations for main workflow stages"
  default = {
    assets = {
      id         = "gpt-5-mini-2025-08-07"
      max_tokens = 64000
      reasoning_effort = {
        "0" = "low"
        "1" = "medium"
        "2" = "high"
        "3" = "high"
      }
    }
    flows = {
      id         = "gpt-5-2025-08-07"
      max_tokens = 64000
      reasoning_effort = {
        "0" = "minimal"
        "1" = "minimal"
        "2" = "low"
        "3" = "low"
      }
    }
    threats = {
      id         = "gpt-5-mini-2025-08-07"
      max_tokens = 128000
      reasoning_effort = {
        "0" = "minimal"
        "1" = "low"
        "2" = "medium"
        "3" = "high"
      }
    }
    threats_agent = {
      id         = "gpt-5-2025-08-07"
      max_tokens = 128000
      reasoning_effort = {
        "0" = "minimal"
        "1" = "low"
        "2" = "medium"
        "3" = "high"
      }
    }
    gaps = {
      id         = "gpt-5-2025-08-07"
      max_tokens = 64000
      reasoning_effort = {
        "0" = "minimal"
        "1" = "minimal"
        "2" = "low"
        "3" = "medium"
      }
    }
  }
}

variable "openai_model_struct" {
  type = object({
    id         = string
    max_tokens = number
  })
  description = "OpenAI model configuration for structured output"
  default = {
    id         = "gpt-5-mini-2025-08-07"
    max_tokens = 64000
  }
}

variable "openai_model_summary" {
  type = object({
    id         = string
    max_tokens = number
  })
  description = "OpenAI model configuration for summary generation"
  default = {
    id         = "gpt-5-mini-2025-08-07"
    max_tokens = 4000
  }
}

variable "openai_reasoning_models" {
  type        = list(string)
  description = "List of OpenAI GPT-5 models that support reasoning"
  default     = ["gpt-5-2025-08-07", "gpt-5-mini-2025-08-07"]
}

variable "openai_sentry_model_id" {
  type        = string
  description = "OpenAI model ID for Sentry assistant"
  default     = "gpt-5-2025-08-07"
}
