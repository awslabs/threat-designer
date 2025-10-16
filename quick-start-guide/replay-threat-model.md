# Quick Start Guide: Replaying Threat Models

This guide explains how to replay an existing threat model to incorporate changes, adjust analysis parameters, and generate updated threat analysis.

## What is Replay?

Replay allows you to re-run AI analysis on an existing threat model without starting from scratch. It preserves your manual edits and starred threats while generating fresh insights based on updated parameters or instructions.

## When to Use Replay

Replay is ideal when you want to:

- **Incorporate manual edits** into a fresh AI analysis (added assets, flows, or boundaries)
- **Adjust analysis parameters** like iteration count or reasoning boost level
- **Add specific instructions** to guide the AI toward particular threat categories
- **Expand your threat catalog** while preserving key threats you've already identified
- **Refine analysis focus** after initial review reveals areas needing deeper examination

## Starting a Replay

### Access the Replay Function

1. Open your existing threat model from the Threat Catalog
2. Click the **Actions** dropdown button in the top-right corner
3. Select **"Replay"** from the menu

### Important: Save First

⚠️ **Save all changes before initiating replay**

The AI agent uses your **persisted (saved) state** as input for the replay. Any unsaved modifications—new assets, edited flows, or updated boundaries—will not be included in the analysis.

## Configuring Your Replay

### Available Options

**Iterations**  
Control the depth and comprehensiveness of the analysis:

- **Auto**: Let the agent determine when the threat model is complete (recommended)
- **Manual (1-15)**: Set a specific number of analysis runs
- More iterations typically yield more comprehensive threat discovery
- Consider your architecture's complexity when choosing

**Reasoning Boost**  
Enhance the analytical depth of threat identification:

- **None**: Standard analysis without extended reasoning
- **Low/Medium/High**: Progressively deeper analysis with enhanced reasoning capabilities
- Higher levels provide more nuanced and detailed threat identification
- Increases processing time but improves threat quality
- **Note**: Only available with Anthropic Claude models (Sonnet 3.7 and above)

**Additional Instructions** _(Optional)_  
Extend the system prompt to guide the agent's focus and behavior. Use this to:

- Target specific threat categories or attack vectors
- Emphasize particular compliance frameworks
- Focus on specific components or flows

**Examples:**

- "Focus on API security vulnerabilities and authentication bypass scenarios"
- "Consider insider threat scenarios with privileged access"
- "Emphasize cloud-specific risks including misconfigurations and shared responsibility gaps"
- "Prioritize OWASP Top 10 vulnerabilities in web-facing components"

## How Replay Works

### What Gets Preserved

The agent reuses your existing **core sections** as the foundation:

- **Assets**: All system components and data stores you've defined
- **Flows**: Data movement patterns and communication pathways
- **Trust Boundaries**: Security perimeters and trust transitions
- **Threat Sources**: Potential attackers and threat actors
- **Starred Threats**: Any threats you've marked as important

### What Gets Updated

- **Threat Catalog**: New threats generated based on current parameters and instructions
- **Analysis depth**: Enhanced with new reasoning boost settings if changed
- **Focus areas**: Adjusted based on additional instructions you've provided
- **Threat relationships**: Updated connections between threats and affected components

### Execution Process

1. **Skips initial architecture analysis**: Uses your existing architecture understanding and manual edits
2. **Preserves starred threats**: Maintains threats you've marked as important
3. **Generates new threats**: Builds upon the starred list with fresh discoveries
4. **Applies new parameters**: Uses updated iteration count, reasoning boost, and instructions

This approach is **significantly faster** than creating a new threat model from scratch while maintaining continuity with your previous work.

## Managing Threats During Replay

### Starring Important Threats

Before replaying, **star the threats you want to keep**:

1. Review your current Threat Catalog
2. Click the **star icon (☆)** next to threats you want to preserve
3. Starred threats (★) will survive the replay process

**What to star:**

- High-priority threats requiring mitigation
- Threats you've customized with specific details
- Threats that have been validated by security reviews
- Any threat you've invested time refining

### Default Behavior

⚠️ **Unstarred threats will be replaced** during replay

The agent treats unstarred threats as candidates for replacement, building a fresh threat catalog that:

- Includes all starred threats as a foundation
- Adds newly discovered threats based on current parameters
- May rediscover some previous threats (but with potentially different descriptions)

## Executing the Replay

### Final Steps

1. **Review your configuration**: Verify iterations, reasoning boost, and additional instructions
2. **Confirm starred threats**: Ensure all important threats are marked with a star
3. **Double-check saved state**: Make sure all manual edits are saved
4. Click **"Replay"** to begin processing

### Monitoring Progress

- **Real-time status updates** display the current processing step
- **Faster than initial submission** because architecture analysis is skipped
- **Safe to navigate away**: Processing continues in the background
- Access updated results from the Threat Catalog when complete

**Typical processing time**: 15-40 minutes depending on complexity, parameters and the LLM configured.

## Best Practices

### Before Replay

**Star critical threats**: Review your threat catalog and star anything you want to preserve. When in doubt, star it—you can always remove threats later.

**Save all manual edits**: Ensure every change to assets, flows, boundaries, and threat sources is saved. Check for the save confirmation before proceeding.

**Plan your additional instructions**: Write clear, specific instructions that guide the AI toward your areas of concern. Vague instructions yield vague results.

**Consider parameter changes**: If your initial analysis felt shallow, increase iterations or reasoning boost. If it was too broad, use additional instructions to narrow focus.

### After Replay

**Review new threats systematically**: Go through the updated threat catalog section by section, comparing against your starred threats.

**Star new high-priority threats**: Mark newly discovered critical threats so they're preserved in future replays.

**Validate threat relevance**: Remove or edit threats that don't apply to your specific context.

**Export updated results**: Download the refreshed threat model in your preferred format for documentation and sharing.

**Iterate if needed**: Replay is designed for iterative refinement. Don't hesitate to replay again with adjusted parameters or instructions.

## Common Use Cases

**Scenario 1: Architecture Evolution**  
You've added new components or data flows to your architecture diagram. Replay with these updates to discover threats related to the new elements.

**Scenario 2: Deeper Analysis**  
Initial analysis was good but felt incomplete. Replay with higher iterations or reasoning boost to uncover more subtle threats.

**Scenario 3: Focused Review**  
Security review identified a specific concern area (e.g., authentication). Replay with additional instructions targeting that domain.

**Scenario 4: Parameter Optimization**  
You want to experiment with different reasoning boost levels or iteration counts to find the right balance of depth and processing time.

---

## Next Steps

After replaying and reviewing your updated threat model, you have several options for continued refinement:

**Manual refinement**: Edit threats directly, add custom mitigations, or adjust risk assessments based on your specific context.

**Iterative replay**: Run another replay with different parameters or instructions to explore alternative analysis approaches.

**AI-assisted analysis**: Ready to take your threat model further? **Sentry**, Threat Designer's built-in AI assistant, can help you explore your threats conversationally. Ask questions about security gaps, get mitigation recommendations, or have Sentry directly enhance your threat catalog through natural dialogue. See the [Using Sentry](./using-sentry.md) guide to learn how to leverage AI-powered threat analysis.

Threat modeling is an iterative process, Replay makes that iteration efficient and preserves your valuable work, while Sentry helps you discover insights you might have missed.
