# Quick Start Guide: Interacting with Threat Model Results

This guide explains how to navigate, review, and modify your completed threat model results within Threat Designer.

## Accessing Your Threat Model

### From the Threat Catalog

1. Navigate to the **Threat Catalog** page
2. Click on the **title** of any completed threat model
3. The detailed threat model view opens, displaying all analysis results

## Understanding the Threat Model Structure

Threat Designer follows the **STRIDE methodology** and organizes results into five main sections:

### Core Sections

**Assets**  
Critical system components and data stores that require protection. This includes databases, services, APIs, and any business-critical resources identified in your architecture.

**Flows**  
Data movement between system components, including communication pathways, protocols, and the direction of information transfer across your architecture.

**Trust Boundaries**  
Security perimeters where trust levels change. These represent transitions between different security zones, such as moving from a public network to an internal system, or between user-controlled and system-controlled environments.

**Threat Sources**  
Potential attackers and threat actors who might target your system. This includes both external threats (hackers, competitors) and internal risks (malicious insiders, accidental misuse).

**Threat Catalog**  
A comprehensive list of identified threats mapped to the STRIDE categories (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege). Each threat includes detailed descriptions, affected components, and recommended mitigation strategies.

## Making Changes to Your Threat Model

### Editing Existing Entries

**For Assets, Flows, Trust Boundaries, and Threat Sources:**

1. Locate the section you want to modify
2. Click the **vertical ellipsis (⋮)** menu next to the section header
3. Select your desired action:
   - **Add**: Create new entries in this section
   - **Edit**: Modify existing entries
   - **Delete**: Remove entries you no longer need

**For Threat Catalog:**

- Click the **"Add Threat"** button to manually create new threats
- Use the **ellipsis (⋮)** menu on individual threats to edit or delete them
- Customize threat severity, descriptions, and mitigation recommendations

### Inline Editing

All changes happen **directly in the interface** with no separate forms or pop-ups required. You'll see immediate visual feedback as you modify entries, making it easy to refine your threat model iteratively.

## Saving Your Work

### Change Notifications

When you make modifications, a **banner notification appears at the top of the page** prompting you to save your changes.

**Important**: Changes are temporary until explicitly saved. They exist only in your current session.

### Persistence Warning

⚠️ **Unsaved changes will be lost if you:**

- Reload the page
- Navigate away from the threat model
- Close your browser

Always save your work before leaving the page to ensure your modifications are preserved.

## Available Actions

Access the **Actions** dropdown button in the top-right corner for additional capabilities:

### Primary Actions

**Save**  
Persist all current changes to the threat model, making your modifications permanent. This updates the threat model in your catalog with all edits.

**Delete**  
Remove the entire threat model from your catalog.  
⚠️ **Warning**: This action is permanent and cannot be undone. All associated data will be lost.

**Replay**  
Re-run the AI analysis incorporating your current modifications. This is useful when you've:

- Added new assets or flows manually
- Modified trust boundaries
- Want to generate fresh threats based on your changes

See the [Replay Threat Model](./replay-threat-model.md) guide for detailed instructions.

### Advanced Features

**Trail** _(Available only with Reasoning Boost)_  
View the AI agent's reasoning process and decision-making steps. This shows you:

- How the agent identified specific threats
- The logical progression of the analysis
- Why certain threats were prioritized

**Note**: This feature is only visible if reasoning boost was enabled during the initial submission.

**Download**  
Export your threat model in multiple formats for sharing and documentation:

- **PDF**: Professional report format ideal for stakeholder presentations
- **DOCX**: Editable document format for further customization in Word
- **JSON**: Raw structured data for integration with other tools or custom workflows

## Best Practices

**Review systematically**: Go through each section methodically rather than jumping around. This ensures you don't miss important threats or relationships.

**Save frequently**: Make it a habit to save after completing edits to each section. This prevents accidental data loss.

**Use Replay strategically**: After making significant structural changes (new assets, flows, or boundaries), use Replay to let the AI identify additional threats you might have missed.

---

## Next Steps

**Collaborate with your team**: Share your threat model with colleagues for review and collective input. See the [Collaboration Guide](./collaborate-on-threat-models.md) to learn how to manage access and work together effectively.

**Refine with AI assistance**: Check out the [Replay Threat Model](./replay-threat-model.md) guide to learn how to iteratively improve your analysis with updated parameters and instructions.
