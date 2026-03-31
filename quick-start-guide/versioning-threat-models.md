# Quick Start Guide: Versioning Threat Models

This guide explains how to create a new version of an existing threat model when your architecture changes, allowing the AI agent to incrementally update your threat analysis without starting from scratch.

## What is Versioning?

Versioning creates a new copy of your threat model and uses an AI agent to incrementally update it based on a new architecture diagram. Unlike [Replay](./replay-threat-model.md), which re-runs the full threat analysis pipeline, versioning compares the old and new architectures and surgically updates only the affected assets, data flows, trust boundaries, and threats.

## When to Use Versioning

Versioning is ideal when:

- **Your architecture has changed** — new services added, components removed, or communication patterns updated
- **You want to preserve your existing analysis** — manual edits, risk assessments, and mitigations carry over
- **Changes are incremental** — the core system is the same but has evolved over time
- **You need an audit trail** — the original threat model remains untouched as a historical record

### Versioning vs. Replay

| Feature                       | Versioning                      | Replay                            |
| ----------------------------- | ------------------------------- | --------------------------------- |
| Requires new diagram          | Yes                             | No                                |
| Updates architecture sections | Yes (assets, flows, boundaries) | No (preserves as-is)              |
| Creates a new threat model    | Yes (linked to parent)          | No (updates in place)             |
| Preserves starred threats     | N/A (all content carried over)  | Yes (unstarred are replaced)      |
| Best for                      | Architecture changes            | Parameter tuning, deeper analysis |

## Starting a New Version

### Access the Version Function

1. Open your existing threat model from the Threat Catalog
2. Click the **Actions** dropdown button in the top-right corner
3. Select **"Create new version"** from the menu

### Important: Save First

**Save all changes before creating a new version.**

The version is created from your **persisted (saved) state**. Any unsaved modifications will not be included in the new version.

## Configuring Your Version

### Architecture Diagram (Required)

Upload the new architecture diagram that reflects the updated system design. The agent will compare this against the original diagram to identify what has changed.

**Supported formats**: PNG, JPG, JPEG, WEBP

**Tips for effective diagrams**:

- Use the same diagramming style and conventions as the original for best comparison results
- Clearly label new, modified, and existing components
- Include all relevant trust boundaries and data flows

### Description (Optional)

Edit the system description if the scope or purpose of the system has changed. The description from the parent threat model is pre-filled for convenience.

### Assumptions (Optional)

Update the assumptions about the system. Existing assumptions from the parent threat model are pre-filled. You can:

- Add new assumptions relevant to the architecture changes
- Remove assumptions that are no longer applicable

### Reasoning Boost

Controls the amount of thinking time for the version analysis:

- **None**: Standard analysis without extended reasoning
- **Low/Medium/High/Max**: Progressively deeper analysis with enhanced reasoning capabilities
- Higher levels provide more thorough change detection and threat updates
- Increases processing time but improves quality

### Mirror Options

**Mirror attack trees**: When enabled, any attack trees associated with threats that survive the versioning process are copied to the new version. This saves you from regenerating attack trees for unchanged threats.

**Mirror sharing settings**: When enabled, the new version inherits the same collaborator access as the parent threat model. Useful when your team should have immediate access to the updated version.

## How Versioning Works

### Step 1: Architecture Diff

The agent compares the old and new architecture diagrams to produce a detailed change summary. This diff identifies:

- New components and services
- Removed components
- Modified communication patterns
- Changed trust boundaries

If the architectures are **fundamentally different systems** with little structural overlap, the agent will abort and recommend creating a new threat model from scratch instead.

### Step 2: Incremental Updates

The agent works through four task phases in order, updating only what the architecture changes require:

1. **Assets** — Adds new assets, removes obsolete ones, updates modified components
2. **Data Flows** — Updates data flow paths to reflect new communication patterns
3. **Trust Boundaries** — Adjusts security perimeters based on architecture changes
4. **Threats** — Adds threats for new attack surfaces, removes threats for removed components, updates existing threats affected by changes

### Step 3: Validation and Finalization

The agent validates the updated threat model for consistency (e.g., threats reference valid assets, data flows connect existing components) before finalizing.

## Monitoring Progress

During processing, a stepper shows the current phase:

1. **Processing** — Analyzing architecture changes (diff phase)
2. **Assets** — Updating assets (shows action details like "Adding 3 assets")
3. **Data Flows** — Updating data flows and trust boundaries
4. **Threats** — Updating the threat catalog
5. **Completing** — Finalizing the threat model

**Safe to navigate away**: Processing continues in the background. Return to the threat model from the Threat Catalog when complete.

**Typical processing time**: 5-15 minutes, significantly faster than a full threat model generation since only changed sections are updated.

## After Versioning

### Review Changes

Once complete, the new version opens automatically. Review the updated sections:

- Check new assets and verify they match your updated architecture
- Review updated data flows for accuracy
- Examine new threats and assess their relevance
- Verify that existing threats were preserved where appropriate

### Parent Relationship

The new version is linked to its parent threat model. The original threat model remains unchanged, providing a historical baseline for comparison.

### Further Refinement

After reviewing the versioned threat model, you can:

- **Edit manually** — Adjust any section directly
- **Use Sentry** — Ask the AI assistant to explore gaps or enhance descriptions ([Sentry Guide](./using-sentry.md))
- **Replay** — Run a deeper analysis with different parameters ([Replay Guide](./replay-threat-model.md))
- **Version again** — Create another version when the architecture changes further

## Best Practices

### Before Versioning

**Save all edits**: Ensure your current threat model is saved before starting.

**Use consistent diagram conventions**: The diff analysis works best when the old and new diagrams use similar notation, layout, and labeling.

**Update description and assumptions**: If the system scope has changed, update these fields to give the agent better context.

### After Versioning

**Review systematically**: Go through each section (assets, flows, boundaries, threats) to verify the changes are accurate.

**Star important threats**: Mark critical threats with a star so they are easily identifiable for future iterations.

**Export the updated model**: Download in your preferred format (PDF, DOCX, JSON) for documentation and compliance records.

## Common Use Cases

**Scenario 1: Sprint-over-Sprint Evolution**
Your team adds a new microservice each sprint. Version the threat model with each architecture update to keep your security analysis current.

**Scenario 2: Cloud Migration**
Migrating from on-premises to cloud. Version the threat model as each component moves to capture new cloud-specific threats while preserving analysis of unchanged components.

**Scenario 3: Pre-Release Security Review**
Before a major release, version the threat model with the final architecture diagram to ensure all recent changes have been analyzed for security implications.

**Scenario 4: Compliance Audit Trail**
Regulations require documenting security changes over time. Each version creates a point-in-time record linked to its predecessor, forming an audit trail.

---

## Next Steps

After creating and reviewing your versioned threat model:

- **Explore threats interactively** with [Sentry](./using-sentry.md) to uncover gaps the agent may have missed
- **Generate attack trees** for new threats using the [Attack Trees](./using-attack-trees.md) feature
- **Share with your team** using the [Collaboration](./collaborate-on-threat-models.md) features, or enable mirror sharing to carry over access automatically
