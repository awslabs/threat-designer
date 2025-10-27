# Implementation Plan

- [x] 1. Create model configuration module
  - Create embedded-backend/src/config/modelConfig.js file
  - Define DEFAULT_MODEL_CONFIG constant with model_main structure for assets, flows, threats, and gaps nodes
  - Define model_summary configuration with id and max_tokens
  - Define model_struct configuration with id and max_tokens
  - Define reasoning_models array with Claude model IDs that support reasoning
  - Export DEFAULT_MODEL_CONFIG as the default export
  - _Requirements: 1.6, 1.7, 3.1, 3.2, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 2. Create configuration validator module
  - Create embedded-backend/src/config/configValidator.js file
  - Implement validateModelConfig function that validates model_main structure
  - Validate that each node (assets, flows, threats, gaps) has id, max_tokens, and reasoning_budget fields
  - Validate that reasoning_budget contains keys "1", "2", and "3" with positive integer values
  - Validate model_summary has id and max_tokens fields
  - Validate model_struct has id and max_tokens fields
  - Validate reasoning_models is an array
  - Throw descriptive errors indicating which field is invalid
  - Export validateModelConfig function
  - _Requirements: 3.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 3. Enhance model service with granular initialization
  - Update embedded-backend/src/services/modelService.js
  - Import DEFAULT_MODEL_CONFIG from config/modelConfig.js
  - Import validateModelConfig from config/configValidator.js
  - Define MODEL_TEMPERATURE_DEFAULT constant as 0.7
  - Define MODEL_TEMPERATURE_REASONING constant as 1.0
  - Implement initializeModels function that accepts reasoning level and optional custom config
  - Call validateModelConfig to validate configuration before initialization
  - _Requirements: 4.1, 4.2, 5.1, 5.2, 5.3_

- [x] 3.1 Implement createNodeModel helper function
  - Create createNodeModel function that accepts nodeConfig, reasoning, reasoningModels, credentials, and nodeName
  - Build base ChatBedrockConverse configuration with model ID, region, credentials, maxTokens, and temperature
  - Check if reasoning is enabled and model supports reasoning
  - If reasoning enabled, get reasoning budget from nodeConfig.reasoning_budget[reasoning.toString()]
  - Add modelKwargs with thinking.type='enabled' and thinking.budget=reasoningBudget
  - Set temperature to MODEL_TEMPERATURE_REASONING when reasoning is enabled
  - Log warning if reasoning requested but model doesn't support it
  - Return initialized ChatBedrockConverse instance
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3.2 Implement createStandardModel helper function
  - Create createStandardModel function that accepts modelConfig, credentials, and modelName
  - Build ChatBedrockConverse configuration with model ID, region, credentials, maxTokens, and temperature
  - Do not add reasoning configuration
  - Log model initialization
  - Return initialized ChatBedrockConverse instance
  - _Requirements: 4.4, 4.7_

- [x] 3.3 Complete initializeModels implementation
  - Call createNodeModel for assets with config.model_main.assets
  - Call createNodeModel for flows with config.model_main.flows
  - Call createNodeModel for threats with config.model_main.threats
  - Call createNodeModel for gaps with config.model_main.gaps
  - Call createStandardModel for summary with config.model_summary
  - Call createStandardModel for struct with config.model_struct
  - Return object with assets_model, flows_model, threats_model, gaps_model, summary_model, and struct_model
  - Add error handling with meaningful error messages
  - _Requirements: 4.1, 4.2, 4.3, 4.7_

- [x] 4. Update agent executor to use granular models
  - Update embedded-backend/src/adapter/agentExecutor.js
  - Import initializeModels from services/modelService.js
  - In executeAgent function, call initializeModels(reasoning) to get all model instances
  - Update config.configurable to include model_assets, model_flows, model_threats, model_gaps
  - Update config.configurable to include model_summary and model_struct
  - Remove old single model initialization code
  - _Requirements: 4.1, 4.2, 7.7_

- [x] 5. Update assets node to use model_assets
  - Update defineAssets function in embedded-backend/src/agents/nodes.js
  - Get model from config.configurable.model_assets instead of config.configurable.model_main
  - Throw error if model_assets not found in config
  - Use model.withStructuredOutput for structured output
  - Remove old model service invocation code
  - _Requirements: 7.1_

- [x] 6. Update flows node to use model_flows
  - Update defineFlows function in embedded-backend/src/agents/nodes.js
  - Get model from config.configurable.model_flows instead of config.configurable.model_main
  - Throw error if model_flows not found in config
  - Use model.withStructuredOutput for structured output
  - Remove old model service invocation code
  - _Requirements: 7.2_

- [x] 7. Update threats node to use model_threats
  - Update defineThreats function in embedded-backend/src/agents/nodes.js
  - Get model from config.configurable.model_threats instead of config.configurable.model_main
  - Throw error if model_threats not found in config
  - Use model.withStructuredOutput for structured output
  - Remove old model service invocation code
  - _Requirements: 7.3_

- [x] 8. Update gaps node to use model_gaps
  - Update gapAnalysis function in embedded-backend/src/agents/nodes.js
  - Get model from config.configurable.model_gaps instead of config.configurable.model_main
  - Throw error if model_gaps not found in config
  - Use model.withStructuredOutput for structured output
  - Remove old model service invocation code
  - _Requirements: 7.4_

- [x] 9. Update summary node to use model_summary
  - Update generateSummary function in embedded-backend/src/agents/nodes.js
  - Get model from config.configurable.model_summary
  - Throw error if model_summary not found in config
  - Use model.withStructuredOutput for structured output
  - _Requirements: 7.5_

- [x] 10. Remove deprecated ModelService class methods
  - Remove or deprecate invokeStructuredModel method from ModelService class
  - Remove or deprecate generateSummary method from ModelService class
  - Update any remaining references to use direct model invocation
  - Keep backward compatibility where needed
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 11. Test configuration validation
  - Test that valid configuration passes validation
  - Test that missing model_main.assets throws error
  - Test that missing id field throws error
  - Test that invalid max_tokens throws error
  - Test that missing reasoning_budget throws error
  - Test that invalid reasoning_budget values throw error
  - Test that missing model_summary throws error
  - Test that invalid reasoning_models type throws error
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] 12. Test model initialization with reasoning levels
  - Test initializeModels with reasoning=0 (no reasoning)
  - Test initializeModels with reasoning=1 (low reasoning budget)
  - Test initializeModels with reasoning=2 (medium reasoning budget)
  - Test initializeModels with reasoning=3 (high reasoning budget)
  - Verify correct reasoning budgets are applied for each node
  - Verify temperature is set correctly (0.7 for standard, 1.0 for reasoning)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.5, 4.6_

- [ ] 13. Test workflow execution with granular models
  - Build embedded backend with updated code
  - Test complete workflow with reasoning=0
  - Test complete workflow with reasoning=1
  - Test complete workflow with reasoning=2
  - Test complete workflow with reasoning=3
  - Verify each node uses its designated model
  - Verify results are consistent with Python backend
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 14. Test error handling and edge cases
  - Test with invalid AWS credentials
  - Test with missing configuration fields
  - Test with unsupported model IDs
  - Test with reasoning requested for non-reasoning model
  - Verify error messages are clear and actionable
  - _Requirements: 4.7, 6.3, 9.5_

- [ ] 15. Verify backward compatibility
  - Test that existing code using old model initialization still works
  - Verify no breaking changes to public API
  - Test fallback behavior when specific models not found
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
