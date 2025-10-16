variable "env" {
  type = string
  default= "dev"
}

variable "python_runtime" {
  type    = string
  default = "3.12"
}

variable "python_layer" {
  type = string
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
  type = bool
  default = false
}

variable "api_gw_stage" {
  default = "dev"
}
variable "lambda_concurrency" {
  type = number
  description = "Reserved concurrency setting for Lambda"
  default = 50
}

variable "provisioned_lambda_concurrency" {
  type = number
  description = "Provision concurrency setting for the lambda"
  default = 3
}

variable "reasoning_models" {
  type    = list(string)
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
      id = string
      max_tokens = number
      reasoning_budget = map(number)
    })
    flows = object({
      id = string
      max_tokens = number
      reasoning_budget = map(number)
    })
    gaps = object({
      id = string
      max_tokens = number
      reasoning_budget = map(number)
    })
    threats = object({
      id = string
      max_tokens = number
      reasoning_budget = map(number)
    })
  })
  default = {
    assets = {
      id = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 16000
        "2" = 32000
        "3" = 63999
      }
    }
    flows = {
      id = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 8000
        "2" = 16000
        "3" = 24000
      }
    }
    threats = {
      id = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 24000
        "2" = 48000
        "3" = 63999
      }
    }
    gaps = {
      id = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 4000
        "2" = 8000
        "3" = 12000
      }
    }
  }
}

variable "model_sentry" {
  type = string
  default = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "model_struct" {
  type = object({
    id          = string
    max_tokens  = number
  })
  default = {
    id          = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
    max_tokens  = 64000
  }
}

variable "model_summary" {
  type = object({
    id          = string
    max_tokens  = number
  })
  default = {
    id          = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    max_tokens  = 4000
  }
}

variable "username" {
  type = string
  description = "Cognito username"
}

variable "email" {
  type = string
  description = "Cognito user email"
}

variable "given_name" {
  type = string
  description = "Cognito user given name"
}

variable "family_name" {
  type = string
  description = "Cognito user family name"
}