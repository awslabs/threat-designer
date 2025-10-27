# Requirements Document

## Introduction

This document specifies the requirements for implementing granular model configuration in the embedded backend to match the Python backend's capability. The system shall support per-node model selection and reasoning budget configuration, allowing different models and reasoning token budgets for each workflow node (assets, flows, threats, gaps) based on the reasoning level selected by the user.

## Glossary

- **Granular Model Configuration**: Per-node model and reasoning budget settings that allow different models and token budgets for each workflow node
- **Reasoning Budget**: Token allocation for extended thinking/reasoning in Claude models with reasoning capabilities
- **Reasoning Level**: User-selected intensity level (0-3) that determines the reasoning token budget for each node
- **Node-Specific Model**: A dedicated model configuration for a specific workflow node (assets, flows, threats, or gaps)
- **Model Main Configuration**: The primary model configuration object containing per-node model settings
- **Model Summary Configuration**: Separate model configuration for summary generation
- **Embedded Backend**: JavaScript implementation of backend logic running in the browser
- **Model Service**: Service layer responsible for initializing and managing model instances
- **ChatBedrockConverse**: AWS Bedrock client class for invoking foundation models

## Requirements

### Requirement 1: Per-Node Model Configuration

**User Story:** As a system architect, I want the embedded backend to support different model configurations for each workflow node, so that I can optimize performance and cost by using appropriate models for different tasks.

#### Acceptance Criteria

1. THE Embedded Backend SHALL support separate model configurations for the assets node
2. THE Embedded Backend SHALL support separate model configurations for the flows node
3. THE Embedded Backend SHALL support separate model configurations for the threats node
4. THE Embedded Backend SHALL support separate model configurations for the gaps node
5. WHEN initializing models, THE Model Service SHALL create distinct ChatBedrockConverse instances for each node based on their configurations
6. THE Model Configuration SHALL include model ID, max tokens, and reasoning budget map for each node
7. THE Embedded Backend SHALL match the Python backend's model configuration structure exactly

### Requirement 2: Reasoning Budget Configuration

**User Story:** As a developer, I want each workflow node to have configurable reasoning budgets based on the reasoning level, so that different nodes can use appropriate amounts of extended thinking based on their complexity.

#### Acceptance Criteria

1. THE Model Configuration SHALL include a reasoning_budget map with keys "1", "2", and "3" for each node
2. WHEN the reasoning level is 1, THE Model Service SHALL use the reasoning_budget["1"] value for token allocation
3. WHEN the reasoning level is 2, THE Model Service SHALL use the reasoning_budget["2"] value for token allocation
4. WHEN the reasoning level is 3, THE Model Service SHALL use the reasoning_budget["3"] value for token allocation
5. WHEN the reasoning level is 0, THE Model Service SHALL disable reasoning regardless of budget configuration
6. THE Reasoning Budget SHALL be applied to the model's additional_model_request_fields with thinking.type and thinking.token_budget
7. THE Model Service SHALL validate that the selected model supports reasoning before applying reasoning configuration

### Requirement 3: Configuration Structure Compatibility

**User Story:** As a developer, I want the embedded backend's configuration structure to match the Terraform variables structure, so that configuration can be easily ported between deployment modes.

#### Acceptance Criteria

1. THE Configuration Structure SHALL match the Terraform variable "model_main" format with nested objects for assets, flows, threats, and gaps
2. THE Configuration Structure SHALL match the Terraform variable "model_summary" format with id and max_tokens fields
3. THE Configuration SHALL be loadable from environment variables or configuration files
4. THE Configuration SHALL support JSON serialization and deserialization
5. WHEN configuration is missing or invalid, THE System SHALL provide clear error messages indicating which fields are problematic

### Requirement 4: Model Service Initialization

**User Story:** As a developer, I want the model service to initialize all required models with their specific configurations, so that each workflow node uses the correct model and reasoning settings.

#### Acceptance Criteria

1. THE Model Service SHALL implement an initializeModels function that accepts reasoning level as a parameter
2. THE initializeModels Function SHALL return an object containing assets_model, flows_model, threats_model, gaps_model, struct_model, and summary_model instances
3. WHEN reasoning level is provided, THE Model Service SHALL apply the corresponding reasoning budget from each node's configuration
4. THE Model Service SHALL create ChatBedrockConverse instances with proper credentials, region, model ID, max tokens, and temperature settings
5. WHEN a model supports reasoning and reasoning level is greater than 0, THE Model Service SHALL add additional_model_request_fields with thinking configuration
6. THE Model Service SHALL use temperature 0.7 for standard models and 1.0 for models with reasoning enabled
7. THE Model Service SHALL handle initialization errors gracefully and provide meaningful error messages

### Requirement 5: Configuration Storage and Access

**User Story:** As a user in Lightning Mode, I want model configurations to be stored and accessible throughout my session, so that the system uses consistent model settings across all workflow executions.

#### Acceptance Criteria

1. THE System SHALL store model configuration in a configuration file or module accessible to the embedded backend
2. THE Configuration SHALL be loaded once during application initialization
3. THE Configuration SHALL remain constant throughout the browser session
4. WHERE configuration needs to be updated, THE System SHALL require application reload
5. THE Configuration Access SHALL be centralized through a configuration service or module

### Requirement 6: Reasoning Model Support Detection

**User Story:** As a developer, I want the system to detect which models support reasoning capabilities, so that reasoning configuration is only applied to compatible models.

#### Acceptance Criteria

1. THE Configuration SHALL include a list of model IDs that support reasoning capabilities
2. WHEN applying reasoning configuration, THE Model Service SHALL check if the model ID is in the reasoning-capable models list
3. WHERE a model does not support reasoning, THE Model Service SHALL log a warning and proceed without reasoning configuration
4. THE Reasoning-Capable Models List SHALL include all Claude models with extended thinking support
5. THE Model Service SHALL NOT fail initialization if reasoning is requested for a non-reasoning-capable model

### Requirement 7: Workflow Node Integration

**User Story:** As a developer, I want workflow nodes to use their designated models from the configuration, so that each node operates with the appropriate model for its task.

#### Acceptance Criteria

1. WHEN the assets node executes, THE System SHALL use the assets_model from the initialized models
2. WHEN the flows node executes, THE System SHALL use the flows_model from the initialized models
3. WHEN the threats node executes, THE System SHALL use the threats_model from the initialized models
4. WHEN the gaps node executes, THE System SHALL use the gaps_model from the initialized models
5. WHEN the summary node executes, THE System SHALL use the summary_model from the initialized models
6. WHEN structured output is required, THE System SHALL use the struct_model from the initialized models
7. THE Workflow Configuration SHALL pass all initialized models to nodes through the config.configurable object

### Requirement 8: Default Configuration Values

**User Story:** As a developer, I want sensible default model configurations that match the Python backend defaults, so that the system works out of the box without requiring extensive configuration.

#### Acceptance Criteria

1. THE Default Configuration SHALL use Claude 3.5 Haiku for assets node with max_tokens 64000
2. THE Default Configuration SHALL use Claude 3.5 Sonnet for flows node with max_tokens 64000
3. THE Default Configuration SHALL use Claude 3.5 Haiku for threats node with max_tokens 64000
4. THE Default Configuration SHALL use Claude 3.5 Sonnet for gaps node with max_tokens 64000
5. THE Default Configuration SHALL use Claude 3.5 Haiku for summary with max_tokens 4000
6. THE Default Configuration SHALL use Claude 3.5 Haiku for structured output with max_tokens 64000
7. THE Default Reasoning Budgets SHALL match the Terraform variable defaults for each node and reasoning level

### Requirement 9: Configuration Validation

**User Story:** As a developer, I want the system to validate model configurations on initialization, so that configuration errors are caught early and reported clearly.

#### Acceptance Criteria

1. THE System SHALL validate that all required model configuration fields are present (id, max_tokens, reasoning_budget)
2. THE System SHALL validate that reasoning_budget contains entries for keys "1", "2", and "3"
3. THE System SHALL validate that max_tokens values are positive integers
4. THE System SHALL validate that reasoning_budget values are positive integers
5. WHEN validation fails, THE System SHALL throw a descriptive error indicating which configuration field is invalid
6. THE Validation SHALL occur before any model instances are created

### Requirement 10: Backward Compatibility

**User Story:** As a developer, I want the new granular configuration to be backward compatible with existing embedded backend code, so that existing functionality continues to work without modification.

#### Acceptance Criteria

1. WHERE existing code references a single model, THE System SHALL continue to support that usage pattern
2. THE Model Service SHALL provide a default model instance for backward compatibility
3. THE Configuration Changes SHALL not break existing workflow node implementations
4. THE API Surface SHALL remain consistent with existing embedded backend interfaces
5. WHERE new configuration is not provided, THE System SHALL fall back to sensible defaults
