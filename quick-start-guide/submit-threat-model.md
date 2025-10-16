# Quick Start Guide: Submitting a Threat Model

This guide walks you through submitting your first threat model using Threat Designer's AI-powered analysis system.

## Getting Started

### Step 1: Navigate to Submission Form

Access the submission form through either:

- The **"Submit Threat Model"** button on the Home page
- The **New button** in the top navigation bar

### Step 2: Complete the Submission Form

#### Required Fields

**Title**  
Provide a descriptive name for your threat model. This helps you identify and organize models in your threat catalog later.

**Architecture Diagram**  
Upload your system architecture diagram with the following specifications:

- Maximum image size: 8,000px × 8,000px
- Supported formats: PNG, JPEG, and other common image types

#### Optional Fields

**Description**  
Add context about your system or highlight specific areas of concern:

- Supports markdown formatting for rich text presentation
- Include relevant business context or compliance requirements
- Note any particular security concerns you want the analysis to focus on

**Assumptions**  
Document the context and constraints of your system:

- Environment assumptions (cloud provider, network topology, etc.)
- Existing security controls already in place
- Deployment context (cloud, on-premises, hybrid)
- Trust boundaries and authentication mechanisms

**Iterations**  
Control how thoroughly the agent analyzes your architecture:

- **Auto** (recommended for first-time users): The agent determines when the threat model is comprehensive
- **Manual**: Set a specific number of analysis runs (1-15)
  - More iterations = more comprehensive threat catalog
  - Be aware: higher iteration counts may increase the risk of hallucinations
  - Processing time increases with iteration count

**Reasoning Boost**  
Enhance the depth of threat analysis:

- **None**: Standard analysis without enhanced reasoning
- **Low/Medium/High**: Progressively deeper analysis using extended reasoning
- Higher levels provide more detailed and nuanced threat identification
- **Note**: Only available with Anthropic Claude models (Sonnet 3.7 and above)

### Step 3: Review and Submit

1. Check the **"Review and launch"** section showing all your selections
2. Verify all information is correct
3. Click **"Start threat modeling"** to begin analysis

## What to Expect

### Processing Time

Typical processing times:

- **Minimum**:  20 minutes for simple architectures
- **Typical**: 30 minutes for most systems
- **Factors affecting duration**:
  - Architecture complexity and size
  - Selected iteration count (Auto or Manual)
  - Reasoning boost level
  - Configured Large Language Model

### During Processing

- Monitor real-time progress directly in the UI
- Track which analysis step is currently executing
- **Safe to navigate away**: Processing continues in the background—you can leave the page and return anytime
- Access completed results from the Threat Catalog

## Tips for Success

**Clear diagrams**: Ensure your architecture diagram clearly shows system boundaries, components, and data flows. Label key elements for better AI comprehension.

**Start simple**: Use Auto iterations for your first submission to get familiar with the system's capabilities.

**Add context**: The more relevant information you provide in the description and assumptions, the more targeted and accurate the analysis will be.

---

## Next Steps

Ready to explore your results? Check the [Interact with the results](./interact-with-threat-model-results.md) guide to learn how to read, filter, and act on your threat model findings.
