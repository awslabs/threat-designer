# Quick Start Guide: Using Sentry - The Built-in AI Assistant

This guide explains how to interact with Sentry, Threat Designer's intelligent assistant that helps you explore, analyze, and enhance your threat models through conversational AI.

## What is Sentry?

Sentry is your AI-powered security analyst that understands your entire threat model and can help you:

- Discover missing threats and security gaps
- Improve threat descriptions and mitigation strategies
- Answer questions about your architecture's security posture
- Make direct modifications to your threat catalog through conversation

Think of Sentry as a security expert who has thoroughly studied your architecture and is ready to discuss it with you.

## Accessing Sentry

### Opening the Assistant

1. Navigate to any **completed threat model** from your Threat Catalog
2. Click the **"AI" button** in the top-right corner of the page
3. Sentry opens in a **side drawer** interface alongside your threat model

### Prerequisites

- Sentry is **only available within completed threat model pages**
- You cannot access Sentry from the main catalog view or during submission
- The threat model must have finished processing

## What Sentry Knows

### Automatic Context Loading

When you open Sentry, it immediately has complete access to your current threat model:

**Original Submission Data**

- Your architecture diagram and all visual components
- System description, assumptions, and context you provided
- Submission parameters (iterations, reasoning boost, instructions)

**Generated Analysis Results**

- All identified assets, flows, and trust boundaries
- Complete threat catalog with descriptions and mitigations
- Threat sources and potential attack vectors
- STRIDE category mappings

**Your Modifications**

- Any manual edits you've made to the threat model
- Custom threats you've added
- Changes to descriptions or mitigations

### Dynamic Understanding

Sentry maintains **real-time awareness** of your threat model:

- Sees changes as you make them (once saved)
- Understands relationships between components
- Applies STRIDE methodology context automatically
- Recognizes your architecture's specific characteristics

## What Sentry Can Do

### Threat Analysis Services

**Gap Analysis**  
Ask Sentry to identify missing threats or underexplored areas:

- "What threats might be missing from my current catalog?"
- "Are there any STRIDE categories that seem underrepresented?"
- "What attack vectors haven't been considered for my API layer?"

**Threat Enhancement**  
Improve the quality of existing threats:

- "Can you improve the description for threat XYZ?"
- "Suggest better mitigation strategies for my authentication threats"
- "Help me assess the likelihood and impact of this SQL injection threat"

**Discovery and Exploration**  
Uncover new threats based on your architecture:

- "What threats should I consider for the payment processing flow?"
- "Identify potential attack chains between the web app and database"
- "What are the risks of my third-party API integration?"

**Strategic Security Guidance**  
Get expert advice on security architecture:

- "What are the security implications of this trust boundary?"
- "How should I prioritize mitigation efforts across these threats?"
- "What AWS security best practices apply to my Lambda functions?"

### Interactive Threat Management

Sentry can **directly modify your threat catalog** through conversation using specialized tools:

**Add Threats**  
Sentry can create new threat entries based on your discussion:

- Automatically formatted with proper STRIDE categories
- Includes detailed descriptions and mitigation recommendations
- Integrates seamlessly with your existing catalog

**Edit Threats**  
Sentry can update existing threats:

- Refine descriptions for clarity and completeness
- Enhance mitigation strategies with specific implementation guidance
- Adjust risk assessments based on your context

**Delete Threats**  
Sentry can remove threats that are:

- Redundant or duplicative
- Not applicable to your specific architecture
- False positives from the initial analysis

### AWS Knowledge Integration

Sentry includes **extensive AWS-specific capabilities** through Model Context Protocol (MCP):

**Real-time Documentation Access**  
Sentry can look up current AWS information:

- Service-specific security features and configurations
- Best practices for AWS services in your architecture
- Known threat patterns for AWS components

**Regional and Compliance Awareness**  
Get context-specific guidance:

- AWS region availability and service limitations
- Multi-region security considerations
- Compliance frameworks (HIPAA, PCI-DSS, SOC 2) and data residency

**Example queries:**

- "What security features does AWS API Gateway provide for my use case?"
- "What are the encryption options for RDS in my region?"
- "How should I configure S3 bucket policies for this data flow?"

### Web Search Integration (Optional)

If configured with a Tavily API key during deployment, Sentry can perform **real-time web searches** for security research:

**Security-Focused Search**  
Sentry can search for:

- CVEs and vulnerability details (e.g., "Search for CVE-2024-XXXX")
- Threat intelligence and attack techniques
- Security advisories and patches
- Technical security research and documentation

**Content Extraction**  
Sentry can read and extract information from:

- Security advisories and bulletins
- Vulnerability databases
- Technical blog posts and research papers
- Official security documentation

**Example queries:**

- "Search for recent vulnerabilities affecting Apache Log4j"
- "Find information about OWASP Top 10 2024 changes"
- "Look up best practices for JWT token security"
- "Research attack techniques for API authentication bypass"

**How it works:**

1. Sentry searches using Tavily's security-focused search
2. Results appear in an expandable "Searched X sources" panel
3. Sentry cites sources using numbered references like `[1:1]`, `[1:2]`
4. Click citations to open the original source

**Note:** Web search is intentionally conservative and focused on security topics. Sentry will not search for general information, people, or organizations.

### Change Management

When Sentry makes modifications:

- **Inline updates**: Changes appear immediately in your threat model interface
- **Visual notifications**: Same save banner appears as with manual edits
- **User control**: You review and decide whether to save Sentry's changes
- **Reversible**: You can undo or modify Sentry's suggestions before saving

## Conversation Management

### Chat Persistence

**Threat model-specific history**: Each threat model maintains its own separate chat history with Sentry. Conversations are preserved between sessions, so you can:

- Return to previous discussions
- Build on earlier analysis
- Reference past recommendations

**Context retention**: Sentry remembers:

- Your areas of focus and concern
- Previous questions and answers
- Priorities you've expressed

### Starting Fresh

Click **"New Chat"** in the top-right of the chat interface when you want to:

- Clear conversation history for the current threat model
- Reset Sentry's conversational context
- Start a new line of inquiry without prior context

**Note**: Starting a new chat doesn't affect your threat model data—only the conversation history.

## How to Use Sentry Effectively

### Asking Good Questions

**Be specific about your concerns:**

- ❌ "Tell me about threats"
- ✅ "What are the authentication bypass risks for my OAuth2 implementation?"

**Provide context when needed:**

- ❌ "Is this secure?"
- ✅ "Given that this API is public-facing and handles PII, what additional threats should I consider?"

**Ask for actionable guidance:**

- ❌ "What about security?"
- ✅ "What specific AWS security controls should I implement for this S3 bucket storing customer data?"

**Use iterative refinement:**

- Start broad: "What are the main risks in my authentication flow?"
- Then narrow: "Can you elaborate on the session management threats?"
- Get specific: "What's the best way to mitigate session fixation in this context?"

### Effective Conversation Patterns

**Gap Analysis Workflow:**

1. "Analyze my threat catalog for gaps in coverage"
2. "Focus on the [specific component] - what am I missing?"
3. "Add threats for [specific scenario] you identified"
4. Review and save the additions

**Threat Enhancement Workflow:**

1. "Review my high-severity threats for completeness"
2. "Improve the mitigation strategy for threat XYZ"
3. "Make that change to the threat catalog"
4. Review and save the enhancement

**Component Deep-Dive Workflow:**

1. "What are all the security considerations for my API Gateway?"
2. "Which of those are most critical given my architecture?"
3. "Add threats for the top 3 risks you identified"
4. Review and save

### Managing Sentry's Changes

**Review before saving:**  
Always examine Sentry's modifications before persisting them. The AI is knowledgeable but may occasionally:

- Misinterpret architectural nuances
- Suggest overly generic mitigations
- Miss context-specific constraints

**Test incremental changes:**  
Rather than asking Sentry to overhaul your entire threat catalog, work section by section or threat by threat.

**Combine AI insights with human expertise:**  
Use Sentry as a knowledgeable assistant, not a replacement for security judgment. Your understanding of business context, risk tolerance, and implementation constraints is essential.

**Save frequently:**  
After Sentry makes valuable changes you've reviewed and approved, save them before continuing the conversation.

## Advanced Configuration

### Extending Sentry's Capabilities

Sentry's functionality can be extended through **Model Context Protocol (MCP)** integration:

**Default Configuration:**  
Threat Designer includes the [AWS Knowledge MCP Server](https://awslabs.github.io/mcp/servers/aws-knowledge-mcp-server/), giving Sentry access to AWS documentation and best practices.

**Custom MCP Servers:**  
You can add additional capabilities by modifying the configuration:

1. Edit `backend/sentry/mcp_config.json`
2. Add your MCP server configuration
3. Redeploy Threat Designer infrastructure
4. New tools become available in Sentry's interface

**Supported MCP server types:**

- ✅ Python-based MCP servers
- ✅ Remote MCP servers (HTTP/HTTPS)
- ❌ Docker-based MCP servers (not currently supported)

**Example use cases for custom MCP:**

- Integration with internal security knowledge bases
- Access to organization-specific threat intelligence
- Connection to compliance framework databases
- Custom security tool integrations

## Common Use Cases

### Scenario 1: Initial Threat Model Review

**Goal**: Validate completeness of AI-generated threats

"Review my threat catalog and identify any significant gaps or missing threat categories."

Then drill into specific areas Sentry identifies as needing attention.

### Scenario 2: Component-Specific Analysis

**Goal**: Deep dive into a critical component

"I'm most concerned about the authentication service. Walk me through all the threats that could affect it, including attack chains from other components."

### Scenario 3: Mitigation Planning

**Goal**: Develop actionable security controls

"For each high-severity threat, suggest specific, implementable mitigation strategies appropriate for an AWS environment."

### Scenario 4: Compliance Mapping

**Goal**: Align threats with compliance requirements

"Which threats in my catalog relate to PCI-DSS requirements? What additional threats should I consider for payment card data handling?"

### Scenario 5: Architecture Evolution

**Goal**: Assess security impact of changes

"I'm planning to add a caching layer using ElastiCache. What new threats does this introduce, and how do they interact with existing threats?"

### Scenario 6: Threat Prioritization

**Goal**: Focus remediation efforts

"Help me prioritize my threat catalog. Which threats pose the highest risk given that this is a public-facing application handling sensitive health data?"

### Scenario 7: Security Research (Requires Tavily API Key)

**Goal**: Research specific vulnerabilities or attack techniques

"Search for recent CVEs affecting the version of OpenSSL we're using"

Then follow up with:

"Based on those vulnerabilities, add any relevant threats to my catalog"

## Tips for Success

**Start conversations with context**: Even though Sentry knows your threat model, explicitly stating your current focus helps guide the conversation.

**Ask for explanations**: If Sentry suggests something you don't understand, ask "Why?" or "Can you explain the reasoning?"

**Request examples**: When discussing mitigations, ask for concrete implementation examples relevant to your tech stack.

**Use Sentry for brainstorming**: Don't just ask about known threats—explore "what if" scenarios and edge cases.

**Iterate on responses**: If Sentry's first answer isn't quite right, refine your question or provide additional context.

**Leverage AWS knowledge**: If you're using AWS services, ask Sentry about service-specific security features and configurations.

**Save your work**: Remember that chat history persists, but threat model changes need to be explicitly saved.

---

## Next Steps

Sentry transforms your threat model from a static document into an interactive security analysis tool. Experiment with different types of questions, explore various aspects of your architecture, and use Sentry's insights to continuously improve your security posture.
