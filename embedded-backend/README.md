# Embedded Backend

Browser-compatible JavaScript implementation of the threat modeling backend using LangGraph and Amazon Bedrock.

## Features

- **Auto Mode (Agentic)**: AI autonomously decides when threat catalog is complete using tool-based reasoning
- **Traditional Mode (Fixed Iterations)**: Predefined number of threat generation iterations
- **Replay Mode**: Refine existing threats while preserving user-starred threats
- **Provider Support**: Amazon Bedrock (Claude) and OpenAI (GPT-4, GPT-5)
- **Reasoning Support**: Extended thinking for complex threat analysis
- **Browser Compatible**: Runs entirely in the browser with no backend required

## Setup

Install dependencies:

```bash
npm install
```

## Browser Compatibility Testing

### Automated Verification

Run the setup verification script:

```bash
node verify-setup.js
```

This verifies that:

- ChatBedrockConverse can be imported
- All dependencies are installed correctly
- Module resolution is working

### Browser Testing

1. Start the development server:

```bash
npm run dev
```

2. Open http://localhost:5173/test.html in your browser

3. Run the tests:
   - **Initialization Test**: Verifies ChatBedrockConverse can be initialized with stub configurations
   - **Invocation Test**: Tests actual model invocation (requires valid AWS credentials)

## Project Structure

```
embedded-backend/
├── src/
│   ├── index.js              # Main entry point
│   ├── config/               # Configuration (credentials, etc.)
│   ├── stubs/                # Browser compatibility stubs
│   │   ├── empty.js          # AWS credential provider stubs
│   │   ├── fs.js             # Filesystem stubs
│   │   ├── child_process.js  # Process stubs
│   │   └── os.js             # OS stubs
│   └── test-bedrock.js       # Browser compatibility tests
├── package.json              # Dependencies
├── vite.config.js            # Build configuration
├── test.html                 # Browser test page
└── README.md                 # This file
```

## Browser Compatibility

The embedded backend uses stub implementations to make Node.js-specific modules work in the browser:

- **AWS Credential Providers**: Stubbed to force manual credential passing
- **File System (fs)**: Stubbed with no-op implementations
- **Child Process**: Stubbed with no-op implementations
- **OS Module**: Stubbed with browser-safe implementations

These stubs follow the patterns from the `working_example` folder and enable ChatBedrockConverse to work in browser environments.

## Build

Build the library:

```bash
npm run build
```

This creates a browser-compatible ES module bundle in the `dist/` directory.

## Threat Modeling Modes

### Auto Mode (iteration=0)

Auto mode uses an agentic approach where the AI autonomously builds a comprehensive threat catalog using tools. The agent decides when the catalog is complete through iterative reasoning and gap analysis.

**Key Features:**

- Agent uses 4 tools: `add_threats`, `remove_threat`, `read_threat_catalog`, `gap_analysis`
- AI decides when catalog is comprehensive (no fixed iteration count)
- Tool usage limits: `add_threats` (15 max), `gap_analysis` (3 max)
- Supports reasoning modes for extended thinking

**Configuration:**

```javascript
const initialState = {
  job_id: "job-001",
  description: "Your architecture description",
  assumptions: ["Assumption 1", "Assumption 2"],
  iteration: 0, // KEY: Set to 0 for Auto mode
  retry: 0,
  replay: false,
};

const config = {
  configurable: {
    model_threats_agent: threatsAgentModel, // Agent model for Auto mode
    model_gaps: gapsModel,
    reasoning: 0, // 0-3 (higher = more thinking)
  },
};
```

**How It Works:**

1. Agent starts with empty catalog
2. Agent adds initial threats using `add_threats` tool
3. Agent reviews catalog using `read_threat_catalog` tool
4. Agent analyzes gaps using `gap_analysis` tool
5. Agent adds more threats to fill gaps
6. Agent removes duplicates or low-quality threats using `remove_threat` tool
7. Agent performs final gap analysis
8. Agent decides catalog is complete and stops

### Traditional Mode (iteration>0)

Traditional mode uses a fixed number of iterations to generate and refine threats. Each iteration improves upon the previous catalog.

**Key Features:**

- Fixed number of iterations (e.g., iteration=3 means 3 passes)
- No tool usage - direct threat generation
- Predictable execution time
- Gap analysis between iterations (if enabled)

**Configuration:**

```javascript
const initialState = {
  job_id: "job-002",
  description: "Your architecture description",
  assumptions: ["Assumption 1", "Assumption 2"],
  iteration: 3, // KEY: Set to >0 for traditional mode (3 iterations)
  retry: 0,
  replay: false,
};

const config = {
  configurable: {
    model_threats: threatsModel, // Traditional model (not agent)
    model_gaps: gapsModel,
    reasoning: 0,
  },
};
```

### Replay Mode

Replay mode refines an existing threat catalog while preserving user-starred threats. Works with both Auto and Traditional modes.

**Key Features:**

- Preserves threats marked with `starred: true`
- Allows custom instructions for refinement
- Skips asset and flow generation (uses existing data)

**Configuration:**

```javascript
const initialState = {
  job_id: "job-003",
  description: "Your architecture description",
  assumptions: ["Assumption 1", "Assumption 2"],
  iteration: 0, // Can use Auto or Traditional mode
  retry: 0,
  replay: true, // KEY: Enable replay mode
  instructions: "Focus on API security threats",
  threat_list: {
    threats: [
      {
        name: "SQL Injection",
        // ... other fields
        starred: true, // This threat will be preserved
      },
      // ... more threats
    ],
  },
};
```

## Tool Capabilities and Limits

### add_threats Tool

**Purpose:** Add new threats to the catalog

**Limit:** Maximum 15 invocations per workflow

**Schema:**

```javascript
{
  threats: [
    {
      name: string,
      stride_category: enum,  // Spoofing, Tampering, etc.
      description: string,    // 35-50 words
      target: string,
      impact: string,
      likelihood: enum,       // Low, Medium, High
      source: string,
      vector: string,
      prerequisites: string[],
      mitigations: string[]   // 2-5 items
    }
  ]
}
```

**Status Update:** "{count} threats added to catalog"

### remove_threat Tool

**Purpose:** Remove threats from the catalog by name

**Limit:** No specific limit (counted toward tool_use)

**Schema:**

```javascript
{
  threats: string[]  // Array of threat names to remove
}
```

**Status Update:** "{count} threats deleted from catalog"

### read_threat_catalog Tool

**Purpose:** Read and inspect the current catalog

**Limit:** No specific limit (counted toward tool_use)

**Schema:**

```javascript
{
  verbose: boolean; // Optional: include full details or just names
}
```

**Status Update:** "Reviewing catalog"

**Output:**

- Summary mode: List of threat names
- Verbose mode: Full threat details including descriptions, mitigations, etc.

### gap_analysis Tool

**Purpose:** Analyze catalog for gaps and completeness

**Limit:** Maximum 3 invocations per workflow

**Schema:**

```javascript
{
} // Empty object - no parameters
```

**Status Update:** "Reviewing for gaps"

**Output:**

```javascript
{
  stop: boolean,  // Should stop or continue
  gap: string     // Description of identified gaps (if stop=false)
}
```

## Iteration Parameter Behavior

The `iteration` parameter controls which threat generation mode is used:

| iteration | Mode           | Behavior                                                   |
| --------- | -------------- | ---------------------------------------------------------- |
| 0         | Auto (Agentic) | AI uses tools to autonomously build catalog until complete |
| 1         | Traditional    | Single pass threat generation                              |
| 2         | Traditional    | Two passes with refinement                                 |
| 3+        | Traditional    | Multiple passes with iterative refinement                  |

**Note:** In Auto mode (iteration=0), the `max_retry` configuration is not used. The agent decides when to stop based on gap analysis results and tool usage limits.

## Provider Configuration

### Amazon Bedrock (Claude)

```javascript
import { ChatBedrockConverse } from "@langchain/aws";

// Example: Threats Agent model for Auto mode with reasoning
const reasoningLevel = 2; // 0-3

const threatsAgentModel = new ChatBedrockConverse({
  model: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  maxTokens: 64000,
  temperature: 0.7,
  // Optional: Enable extended thinking for reasoning levels > 0
  ...(reasoningLevel > 0 && {
    additionalModelRequestFields: {
      thinking: {
        type: "enabled",
        budget_tokens: { 1: 24000, 2: 48000, 3: 63999 }[reasoningLevel],
      },
    },
  }),
});
```

**Supported Models:**

- Claude Sonnet 4.5 (recommended for Auto mode threats_agent, flows, gaps)
- Claude Haiku 4.5 (recommended for assets, traditional mode threats)

**Model Configurations by Stage:**

- **Assets**: Haiku 4.5, 64K tokens, reasoning budget: 16K/32K/64K
- **Flows**: Sonnet 4.5, 64K tokens, reasoning budget: 8K/16K/24K
- **Threats (Traditional)**: Haiku 4.5, 64K tokens, reasoning budget: 24K/48K/64K
- **Threats Agent (Auto)**: Sonnet 4.5, 64K tokens, reasoning budget: 24K/48K/64K
- **Gaps**: Sonnet 4.5, 64K tokens, reasoning budget: 8K/12K/16K

### OpenAI (GPT-4, GPT-5)

```javascript
import { ChatOpenAI } from "@langchain/openai";

// Example: Threats Agent model for Auto mode with reasoning
const reasoningLevel = 2; // 0-3
const reasoningEffortMap = { 0: "minimal", 1: "low", 2: "medium", 3: "high" };

const threatsAgentModel = new ChatOpenAI({
  model: "gpt-5-2025-08-07",
  apiKey: process.env.OPENAI_API_KEY,
  maxTokens: 128000,
  temperature: 0.7,
  useResponsesApi: true, // Required for GPT-5
  reasoning: {
    effort: reasoningEffortMap[reasoningLevel],
    summary: "detailed",
  },
});
```

**Supported Models:**

- GPT-5 (recommended for flows, threats_agent, gaps)
- GPT-5 Mini (recommended for assets, traditional threats)
- GPT-4 Turbo
- GPT-4

**Model Configurations by Stage:**

- **Assets**: GPT-5 Mini, 64K tokens, effort: low/medium/high/high
- **Flows**: GPT-5, 64K tokens, effort: minimal/minimal/low/low
- **Threats (Traditional)**: GPT-5 Mini, 128K tokens, effort: minimal/low/medium/high
- **Threats Agent (Auto)**: GPT-5, 128K tokens, effort: minimal/low/medium/high
- **Gaps**: GPT-5, 64K tokens, effort: minimal/minimal/low/medium

**Reasoning Configuration:**

- `reasoning.effort`: Controls thinking depth (minimal, low, medium, high)
- `reasoning.summary`: Controls reasoning output detail (detailed)
- Only available for GPT-5 models

## Examples

See the `examples/` directory for complete usage examples:

- **auto-mode-config.js**: Configuration examples for Auto mode with Bedrock and OpenAI
- **tool-usage-example.js**: Detailed examples of how the agent uses tools during Auto mode

## Next Steps

After verifying browser compatibility:

1. ✅ Implement state management (sessionStorage)
2. ✅ Implement credentials management
3. ✅ Convert Python agent to JavaScript LangGraph
4. ✅ Implement API adapter functions
5. ✅ Integrate with frontend application
6. ✅ Add Auto mode support
