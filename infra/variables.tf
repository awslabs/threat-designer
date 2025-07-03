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
    "us.anthropic.claude-sonnet-4-20250514-v1:0"
  ]
}

variable "model_main" {
  type = object({
    id          = string
    max_tokens  = number
  })
  default = {
    id          = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    max_tokens  = 64000
  }
}

variable "model_struct" {
  type = object({
    id          = string
    max_tokens  = number
  })
  default = {
    id          = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    max_tokens  = 64000
  }
}

variable "model_summary" {
  type = object({
    id          = string
    max_tokens  = number
  })
  default = {
    id          = "us.anthropic.claude-sonnet-4-20250514-v1:0"
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