# Requirements Document

## Introduction

This document specifies the requirements for implementing a "lightning version" of the threat modeling application that runs entirely in the browser. The system shall support dual-mode operation, allowing seamless switching between the existing Python backend and a new embedded JavaScript backend via feature flags. The lightning version provides a stateless, zero-installation experience where users can perform threat modeling using their own AWS credentials without any server dependencies.

## Glossary

- **Lightning Mode**: Browser-only operation mode where the backend logic runs as embedded JavaScript in the user's browser
- **Remote Backend Mode**: Traditional operation mode using the existing Python backend services
- **Embedded Backend**: JavaScript implementation of backend logic that runs in the browser
- **Build-Time Configuration**: Configuration mechanism set at deployment time to determine Remote Backend Mode or Lightning Mode
- **Threat Designer Agent**: LangGraph-based agent that performs threat modeling analysis
- **SessionStorage**: Browser storage mechanism for ephemeral state management
- **ChatBedrockConverse**: AWS Bedrock client class for invoking foundation models
- **API Adapter**: Interface layer that provides consistent API contracts regardless of backend mode

## Requirements

### Requirement 1: Dual-Mode Backend Architecture

**User Story:** As a system architect, I want the application to support both remote and embedded backend modes determined at deployment time, so that the appropriate build can be deployed for server-based or browser-based operation.

#### Acceptance Criteria

1. WHEN the application is built, THE Build System SHALL determine the active backend mode based on build-time configuration
2. WHERE Lightning Mode is configured at build time, THE Application SHALL include the Embedded Backend and route all API calls to it
3. WHERE Remote Backend Mode is configured at build time, THE Application SHALL route all API calls to the existing Python backend services
4. THE Application SHALL provide identical response formats from both backend modes
5. THE Build Configuration SHALL require no changes to frontend component code beyond the build-time mode selection

### Requirement 2: API Contract Compatibility

**User Story:** As a frontend developer, I want the Embedded Backend to honor the exact same API contracts as the Remote Backend, so that I don't need to modify existing frontend code.

#### Acceptance Criteria

1. THE Embedded Backend SHALL implement the startThreatModeling function with identical input parameters and response format as the Remote Backend
2. THE Embedded Backend SHALL implement the updateTm function with identical input parameters and response format as the Remote Backend
3. THE Embedded Backend SHALL implement the restoreTm function with identical input parameters and response format as the Remote Backend
4. THE Embedded Backend SHALL implement the generateUrl and getDownloadUrl functions with mocked upload behavior that maintains the same interface contract
5. THE Embedded Backend SHALL implement the getThreatModelingStatus function with identical response format as the Remote Backend
6. THE Embedded Backend SHALL implement the getThreatModelingTrail function with identical response format as the Remote Backend
7. THE Embedded Backend SHALL implement the getThreatModelingResults function with identical response format as the Remote Backend
8. WHEN an API function encounters an error, THE Embedded Backend SHALL return error responses with the same structure as the Remote Backend

### Requirement 3: Browser-Compatible Agent Implementation

**User Story:** As a developer, I want the Threat Designer Agent converted to JavaScript LangGraph with browser compatibility, so that threat modeling can execute entirely in the browser.

#### Acceptance Criteria

1. THE System SHALL convert the Python-based Threat Designer Agent from backend/threat_designer to JavaScript using @langchain/langgraph/web
2. THE Embedded Backend SHALL use ChatBedrockConverse class from @langchain/aws for model invocation
3. THE Embedded Backend SHALL implement stub/mock patterns from the working_example folder to enable ChatBedrockConverse browser compatibility
4. THE Embedded Backend SHALL replicate all agent nodes, state management, and workflow logic from the Python implementation
5. WHEN the agent executes in the browser, THE System SHALL produce threat modeling results equivalent to the Python backend implementation

### Requirement 4: Stateless Session Management

**User Story:** As a user in Lightning Mode, I understand that my threat modeling session is temporary, so that I can work without server dependencies while accepting that state is lost when I close the page.

#### Acceptance Criteria

1. WHERE Lightning Mode is active, THE System SHALL store threat model status in browser sessionStorage
2. WHERE Lightning Mode is active, THE System SHALL store threat model results in browser sessionStorage
3. WHERE Lightning Mode is active, THE System SHALL store threat model trail in browser sessionStorage
4. WHEN the user closes or refreshes the browser page in Lightning Mode, THE System SHALL lose all stored state
5. WHERE Remote Backend Mode is active, THE System SHALL maintain existing persistence behavior using backend services

### Requirement 5: AWS Credentials Management

**User Story:** As a user in Lightning Mode, I want to provide my own AWS credentials through the UI, so that I can use AWS Bedrock services directly from my browser.

#### Acceptance Criteria

1. WHERE Lightning Mode is active, THE System SHALL display a credentials input form instead of the standard login form
2. THE Credentials Form SHALL accept AWS Access Key ID as input
3. THE Credentials Form SHALL accept AWS Secret Access Key as input
4. THE Credentials Form SHALL accept AWS Session Token as optional input
5. THE Credentials Form SHALL accept AWS Region selection as input
6. WHEN credentials are provided, THE System SHALL store them in sessionStorage for the duration of the browser session
7. THE System SHALL use the provided credentials exclusively for ChatBedrockConverse API calls
8. WHEN the browser session ends, THE System SHALL discard all stored credentials

### Requirement 6: Separate Build Architecture

**User Story:** As a build engineer, I want the frontend and embedded backend to have separate package.json and build configurations, so that dependencies and build processes remain isolated.

#### Acceptance Criteria

1. THE Project SHALL maintain a separate package.json file for the Embedded Backend with its own dependencies
2. THE Project SHALL maintain a separate vite.config.js file for the Embedded Backend
3. THE Embedded Backend build configuration SHALL follow the patterns established in the working_example folder
4. THE Embedded Backend build configuration SHALL include necessary polyfills for Node.js modules required by ChatBedrockConverse
5. THE Frontend build process SHALL conditionally import the Embedded Backend bundle based on build-time configuration
6. WHEN building the project, THE System SHALL produce separate bundles for frontend and embedded backend

### Requirement 7: Feature Scope Limitations

**User Story:** As a product manager, I want Lightning Mode to exclude Sentry agent and Threat Catalog features, so that the embedded backend remains focused on core threat modeling functionality.

#### Acceptance Criteria

1. WHERE Lightning Mode is active, THE System SHALL disable the Sentry agent interface
2. WHERE Lightning Mode is active, THE System SHALL disable the Threat Catalog page
3. THE Embedded Backend SHALL NOT include any code conversion from backend/sentry directory
4. WHERE Remote Backend Mode is active, THE System SHALL maintain full access to Sentry and Threat Catalog features
5. WHEN a user attempts to access disabled features in Lightning Mode, THE System SHALL display an appropriate message indicating the feature is unavailable

### Requirement 8: API Adapter Layer

**User Story:** As a frontend developer, I want a unified API adapter layer that abstracts backend implementation details, so that my code works seamlessly with both backend modes.

#### Acceptance Criteria

1. THE System SHALL provide an API adapter layer that exposes identical function signatures for both backend modes
2. WHERE the build is configured for Lightning Mode, THE API Adapter SHALL route calls to Embedded Backend functions
3. WHERE the build is configured for Remote Backend Mode, THE API Adapter SHALL route calls to HTTP endpoint functions
4. THE API Adapter SHALL return promises with response formats identical to fetch() responses
5. WHERE authentication is required in Remote Backend Mode, THE API Adapter SHALL include Bearer token from getAuthToken()
6. WHERE the build is configured for Lightning Mode, THE API Adapter SHALL skip token validation and use AWS credentials instead

### Requirement 9: Working Example Compliance

**User Story:** As a developer implementing browser compatibility, I want to follow the proven patterns from the working_example folder, so that ChatBedrockConverse and LangGraph function correctly in the browser.

#### Acceptance Criteria

1. THE Embedded Backend SHALL replicate the stub/mock implementation for ChatBedrockConverse exactly as demonstrated in working_example folder
2. THE Embedded Backend SHALL use @langchain/langgraph/web imports as shown in working_example folder
3. THE Embedded Backend build configuration SHALL include the same polyfills and module resolution patterns as working_example
4. THE Embedded Backend SHALL handle AWS SDK browser limitations using the patterns from working_example
5. WHEN implementing stream handling, THE Embedded Backend SHALL follow the adaptation patterns from working_example

### Requirement 10: Error Handling Consistency

**User Story:** As a frontend developer, I want error responses from both backend modes to have identical structures, so that my error handling code works uniformly.

#### Acceptance Criteria

1. WHEN an error occurs in the Embedded Backend, THE System SHALL format the error response to match the structure of Remote Backend errors
2. THE Embedded Backend SHALL include appropriate HTTP-equivalent status codes in error responses
3. WHEN a network-equivalent error occurs in Lightning Mode, THE System SHALL throw errors with the same structure as fetch failures
4. THE Error Response SHALL include a message field describing the error
5. WHERE applicable, THE Error Response SHALL include additional context fields matching Remote Backend error responses
