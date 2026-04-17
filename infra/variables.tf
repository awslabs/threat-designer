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
  default     = 100
}

variable "provisioned_lambda_concurrency" {
  type        = number
  description = "Provision concurrency setting for the lambda"
  default     = 12
}

variable "adaptive_thinking_models" {
  type        = list(string)
  description = "List of model IDs that support adaptive thinking"
  default     = ["global.anthropic.claude-opus-4-7", "global.anthropic.claude-opus-4-6-v1", "global.anthropic.claude-sonnet-4-6"]
}


variable "model_main" {
  type = object({
    assets = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
      effort_map       = optional(map(string))
    })
    flows = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
      effort_map       = optional(map(string))
    })
    gaps = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
      effort_map       = optional(map(string))
    })
    threats = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
      effort_map       = optional(map(string))
    })
    threats_agent = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
      effort_map       = optional(map(string))
    })
    attack_tree = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
      effort_map       = optional(map(string))
    })
    version = object({
      id               = string
      max_tokens       = number
      reasoning_budget = map(number)
      effort_map       = optional(map(string))
    })
  })
  default = {
    assets = {
      id         = "global.anthropic.claude-opus-4-7"
      max_tokens = 128000
      reasoning_budget = {
        "1" = 16000
        "2" = 24000
        "3" = 38000
        "4" = 63999
      }
      effort_map = {
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    flows = {
      id         = "global.anthropic.claude-opus-4-7"
      max_tokens = 128000
      reasoning_budget = {
        "1" = 16000
        "2" = 24000
        "3" = 38000
        "4" = 63999
      }
      effort_map = {
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    threats = {
      id         = "global.anthropic.claude-opus-4-7"
      max_tokens = 128000
      reasoning_budget = {
        "1" = 16000
        "2" = 24000
        "3" = 38000
        "4" = 63999
      }
      effort_map = {
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    threats_agent = {
      id         = "global.anthropic.claude-opus-4-7"
      max_tokens = 128000
      reasoning_budget = {
        "1" = 16000
        "2" = 24000
        "3" = 38000
        "4" = 63999
      }
      effort_map = {
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    gaps = {
      id         = "global.anthropic.claude-opus-4-7"
      max_tokens = 128000
      reasoning_budget = {
        "1" = 16000
        "2" = 24000
        "3" = 38000
        "4" = 63999
      }
      effort_map = {
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    attack_tree = {
      id         = "global.anthropic.claude-opus-4-7"
      max_tokens = 128000
      reasoning_budget = {
        "1" = 16000
        "2" = 24000
        "3" = 38000
        "4" = 63999
      }
      effort_map = {
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    version = {
      id         = "global.anthropic.claude-opus-4-7"
      max_tokens = 128000
      reasoning_budget = {
        "1" = 16000
        "2" = 24000
        "3" = 38000
        "4" = 63999
      }
      effort_map = {
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
  }
}

variable "model_sentry" {
  type = object({
    id               = string
    max_tokens       = number
    reasoning_budget = map(number)
    effort_map       = optional(map(string))
  })
  default = {
      id         = "global.anthropic.claude-opus-4-7"
      max_tokens = 128000
      reasoning_budget = {
        "1" = 16000
        "2" = 24000
        "3" = 38000
        "4" = 63999
      }
      effort_map = {
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
}

variable "model_struct" {
  type = object({
    id         = string
    max_tokens = number
  })
  default = {
    id         =  "global.anthropic.claude-sonnet-4-6"
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
    attack_tree = object({
      id               = string
      max_tokens       = number
      reasoning_effort = map(string)
    })
    version = object({
      id               = string
      max_tokens       = number
      reasoning_effort = map(string)
    })
  })
  description = "OpenAI model configurations for main workflow stages"
  default = {
    assets = {
      id         = "gpt-5.4-2026-03-05"
      max_tokens = 128000
      reasoning_effort = {
        "0" = "none"
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    flows = {
      id         = "gpt-5.4-2026-03-05"
      max_tokens = 128000
      reasoning_effort = {
        "0" = "none"
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    threats = {
      id         = "gpt-5.4-2026-03-05"
      max_tokens = 128000
      reasoning_effort = {
        "0" = "none"
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    threats_agent = {
      id         = "gpt-5.4-2026-03-05"
      max_tokens = 128000
      reasoning_effort = {
        "0" = "none"
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    gaps = {
      id         = "gpt-5.4-2026-03-05"
      max_tokens = 128000
      reasoning_effort = {
        "0" = "none"
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    attack_tree = {
      id         = "gpt-5.4-2026-03-05"
      max_tokens = 128000
      reasoning_effort = {
        "0" = "none"
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
    version = {
      id         = "gpt-5.4-2026-03-05"
      max_tokens = 128000
      reasoning_effort = {
        "0" = "none"
        "1" = "low"
        "2" = "medium"
        "3" = "high"
        "4" = "xhigh"
      }
    }
  }
}

variable "openai_model_sentry" {
  type = object({
    id               = string
    max_tokens       = number
    reasoning_effort = map(string)
  })
  description = "OpenAI model configuration for Sentry assistant"
  default = {
    id         = "gpt-5.4-2026-03-05"
    max_tokens = 128000
    reasoning_effort = {
      "0" = "none"
      "1" = "low"
      "2" = "medium"
      "3" = "high"
      "4" = "xhigh"
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
    id         = "gpt-5.4-2026-03-05"
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
    id         = "gpt-5.4-2026-03-05"
    max_tokens = 4000
  }
}

variable "tavily_api_key" {
  type        = string
  description = "Tavily API key for web search and content extraction (optional)"
  default     = ""
  sensitive   = true
}

variable "kb_embedding_model_id" {
  type        = string
  description = "Bedrock foundation model ID to use for Spaces knowledge base embeddings"
  default     = "amazon.titan-embed-text-v2:0"
}

variable "external_agent_ecr_arn" {
  type        = string
  description = "ARN of an external ECR repository containing the threat designer agent image. When set, skips local ECR creation and docker build."
  default     = ""
}

variable "external_sentry_ecr_arn" {
  type        = string
  description = "ARN of an external ECR repository containing the sentry assistant image. When set, skips local ECR creation and docker build."
  default     = ""
}

variable "agent_image_tag" {
  type        = string
  description = "Image tag to use for the threat designer agent container."
  default     = "latest"
}

variable "sentry_image_tag" {
  type        = string
  description = "Image tag to use for the sentry assistant container."
  default     = "latest"
}

variable "custom_domain_name" {
  type        = string
  description = "Optional custom domain name to associate with the Amplify app (e.g. app.example.com). If not provided, the default Amplify-generated URL is used."
  default     = null
}

variable "prefix" {
  type        = string
  description = "Optional prefix to prepend to all resource names, enabling multiple independent deployments in the same AWS account. If not provided, resources are named with the default 'threat-designer' prefix."
  default     = null
}

variable "api_gateway_waf_arn" {
  type        = string
  description = "ARN of an existing WAF Web ACL (REGIONAL scope) to associate with the API Gateway stage. If not provided, no WAF is attached."
  default     = null
}

variable "amplify_waf_arn" {
  type        = string
  description = "ARN of an existing WAF Web ACL (CLOUDFRONT scope) to associate with the Amplify app. If not provided, no WAF is attached."
  default     = null
}
