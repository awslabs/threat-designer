# Implementation Plan

- [x] 1. Set up embedded backend foundation
  - Create embedded-backend directory structure with src/, stubs/, and config/ folders
  - Create package.json with dependencies: @langchain/langgraph, @langchain/aws, @langchain/core, buffer
  - Create vite.config.js following working_example patterns with node polyfills and alias configurations
  - _Requirements: 6.1, 6.2, 6.3, 9.2, 9.3_

- [x] 1.1 Implement browser compatibility stubs
  - Copy stub files from working_example/stubs/ to embedded-backend/src/stubs/
  - Create empty.js stub for AWS credential providers
  - Create fs.js, child_process.js, and os.js stubs for Node.js modules
  - _Requirements: 9.1, 9.4_

- [x] 1.2 Verify ChatBedrockConverse browser compatibility
  - Create test file to initialize ChatBedrockConverse with manual credentials
  - Test model invocation in browser environment
  - Verify stub configurations work correctly
  - _Requirements: 3.2, 3.3, 9.1_

- [x] 2. Implement state management system
  - Create embedded-backend/src/storage/stateManager.js with sessionStorage operations
  - Implement methods: setJobStatus, getJobStatus, setJobResults, getJobResults, updateJobResults
  - Implement methods: setJobTrail, getJobTrail, updateJobTrail
  - Implement methods: addJobToIndex, getAllJobs, removeJobFromIndex
  - Implement methods: storeUploadedFile, getUploadedFile, deleteUploadedFile
  - Implement cleanup methods: clearJobData, clearAllData
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 2.1 Implement credentials management
  - Create embedded-backend/src/config/credentials.js for AWS credentials handling
  - Implement CredentialsManager class with setCredentials, getCredentials, clearCredentials methods
  - Implement hasValidCredentials validation method
  - Store credentials in sessionStorage with timestamp
  - _Requirements: 5.6, 5.7, 5.8_

- [x] 2.2 Create credentials form component
  - Create src/components/Auth/CredentialsForm.jsx component
  - Add form fields for AWS Access Key ID, Secret Access Key, Session Token (optional), and Region
  - Implement form validation and submission logic
  - Style to match existing login form design
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 2.3 Integrate credentials form into login page
  - Modify src/components/Auth/LoginForm.jsx to conditionally render CredentialsForm in Lightning Mode
  - Add build-time check for VITE_BACKEND_MODE
  - Implement credential submission and storage
  - Add navigation to main app after successful credential setup
  - _Requirements: 5.1_

- [x] 3. Convert Python state definitions to JavaScript
  - Create embedded-backend/src/agents/state.js
  - Define AgentState using @langchain/langgraph/web Annotation.Root
  - Implement all state fields with appropriate reducers: job_id, summary, assets, image_data, system_architecture, description, assumptions, threat_list, iteration, retry, s3_location, title, owner, stop, gap, replay, instructions
  - Define data models: Assets, AssetsList, DataFlow, TrustBoundary, ThreatSource, FlowsList, Threat, ThreatsList
  - _Requirements: 3.1, 3.4_

- [x] 3.1 Implement model service with ChatBedrockConverse
  - Create embedded-backend/src/services/modelService.js
  - Implement initializeModel function that creates ChatBedrockConverse instances with user credentials
  - Implement model invocation methods for structured output
  - Implement methods: generateSummary, invokeStructuredModel
  - Handle model errors and credential validation
  - _Requirements: 3.2, 3.3_

- [x] 3.2 Implement message builder service
  - Create embedded-backend/src/services/messageBuilder.js
  - Implement MessageBuilder class for constructing prompts
  - Implement methods: createSummaryMessage, createAssetMessage, createSystemFlowsMessage, createThreatMessage, createThreatImproveMessage, createGapAnalysisMessage
  - Convert Python message formatting to JavaScript
  - _Requirements: 3.4_

- [x] 3.3 Implement system prompts
  - Create embedded-backend/src/services/prompts.js
  - Convert Python prompts to JavaScript: summary_prompt, asset_prompt, flow_prompt, threats_prompt, threats_improve_prompt, gap_prompt
  - Ensure prompts match Python backend exactly
  - _Requirements: 3.4_

- [x] 4. Implement LangGraph agent nodes
  - Create embedded-backend/src/agents/nodes.js
  - Implement generateSummary node function
  - Implement defineAssets node function
  - Implement defineFlows node function
  - Implement defineThreats node function with iteration logic
  - Implement gapAnalysis node function
  - Implement finalize node function
  - Implement routing functions: routeReplay, shouldContinue, shouldRetry
  - _Requirements: 3.1, 3.4_

- [x] 4.1 Implement LangGraph workflow
  - Create embedded-backend/src/agents/threatDesigner.js
  - Import StateGraph, START, END from @langchain/langgraph/web
  - Create workflow graph with all nodes
  - Add conditional edges for replay routing, threat continuation, and gap analysis
  - Implement createThreatModelingWorkflow function that returns compiled graph
  - _Requirements: 3.1, 3.4, 9.2_

- [x] 5. Implement embedded backend adapter functions
  - Create embedded-backend/src/adapter/threatDesignerAdapter.js
  - Implement startThreatModeling function matching Python backend interface
  - Implement updateTm function for updating threat model results
  - Implement restoreTm function for restoring previous version
  - Implement generateUrl function with mocked upload behavior
  - Implement getDownloadUrl function for retrieving stored files
  - Implement getThreatModelingStatus function
  - Implement getThreatModelingTrail function
  - Implement getThreatModelingResults function
  - Implement getThreatModelingAllResults function
  - Implement deleteTm function
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 5.1 Implement agent execution logic
  - Create embedded-backend/src/adapter/agentExecutor.js
  - Implement executeAgent function that runs the LangGraph workflow
  - Handle state initialization for new and replay jobs
  - Implement background execution simulation (Promise-based)
  - Update job status throughout execution
  - Store results and trail data in sessionStorage
  - _Requirements: 3.4, 4.1, 4.2, 4.3_

- [x] 5.2 Implement error handling for embedded backend
  - Create embedded-backend/src/adapter/errors.js
  - Define ThreatModelingError class with type and statusCode
  - Implement error response formatting to match Python backend
  - Add error types: VALIDATION_ERROR, UNAUTHORIZED, NOT_FOUND, CREDENTIALS_ERROR, MODEL_ERROR, INTERNAL_ERROR
  - Implement toResponse method for consistent error format
  - _Requirements: 2.8, 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 6. Create API adapter layer with mode selection
  - Create src/services/ThreatDesigner/apiAdapter.js
  - Import BACKEND_MODE from config
  - Conditionally import remoteBackend or embeddedBackend based on mode
  - Export unified interface with all API functions
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 6.1 Update frontend imports to use adapter
  - Modify src/services/ThreatDesigner/stats.jsx to export from apiAdapter
  - Ensure all existing API function signatures remain unchanged
  - Verify no frontend component code needs modification
  - _Requirements: 2.4, 8.5, 8.6_

- [x] 7. Implement build-time configuration system
  - Create .env.lightning file with Lightning Mode configuration
  - Create .env.remote file with Remote Mode configuration
  - Update vite.config.js to support mode-specific builds
  - Add VITE_BACKEND_MODE, VITE_SENTRY_ENABLED, VITE_THREAT_CATALOG_ENABLED variables
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 7.1 Create build scripts for both modes
  - Add build:lightning script to package.json
  - Add build:remote script to package.json
  - Add dev:lightning script for development
  - Add dev:remote script for development
  - _Requirements: 6.5, 1.4_

- [x] 7.2 Implement conditional embedded backend import
  - Update frontend vite.config.js to conditionally bundle embedded backend
  - Configure build to include embedded-backend bundle only in Lightning Mode
  - Implement dynamic import for embedded backend in Lightning Mode
  - _Requirements: 6.5, 1.5_

- [x] 8. Implement feature disabling for Lightning Mode
  - Update src/config.js to export SENTRY_ENABLED and THREAT_CATALOG_ENABLED flags
  - Modify Sentry agent interface to check SENTRY_ENABLED flag
  - Modify Threat Catalog page to check THREAT_CATALOG_ENABLED flag
  - Add UI message for disabled features in Lightning Mode
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 9. Build and test Lightning Mode
  - Run build:lightning command
  - Verify embedded backend is included in bundle
  - Test credentials form displays correctly
  - Test threat modeling workflow executes successfully
  - Verify results are stored in sessionStorage
  - Test state persistence during session
  - Test state clears on browser close
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.4, 5.8_

- [ ] 10. Build and test Remote Mode
  - Run build:remote command
  - Verify embedded backend is NOT included in bundle
  - Test login form displays correctly
  - Test threat modeling workflow executes successfully
  - Verify results are fetched from Python backend
  - Test Sentry agent is accessible
  - Test Threat Catalog is accessible
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.4_

- [ ] 11. Cross-browser compatibility testing
  - Test Lightning Mode in Chrome
  - Test Lightning Mode in Firefox
  - Test Lightning Mode in Safari
  - Verify ChatBedrockConverse works in all browsers
  - Test credential management in all browsers
  - _Requirements: 9.1, 9.4_

- [ ] 12. End-to-end integration testing
  - Test complete threat modeling workflow in Lightning Mode
  - Test replay functionality in Lightning Mode
  - Test restore functionality in Lightning Mode
  - Test update functionality in Lightning Mode
  - Test delete functionality in Lightning Mode
  - Verify error handling works correctly
  - Test with various AWS regions
  - Test with invalid credentials
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 10.1, 10.2, 10.3_
