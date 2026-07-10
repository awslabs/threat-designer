# Quick Start Guide: Exporting Threat Models

This guide explains how to export your threat models in different formats for various audiences and use cases.

## When to Export

Export your threat model when you need to:

- **Share with stakeholders** who don't have system access
- **Document security assessments** for compliance or audit purposes
- **Present findings** to executive leadership or technical teams
- **Archive threat models** for future reference
- **Integrate with other tools** via JSON format
- **Feed into AI/LLM tools** for deeper analysis via Markdown format

---

## Export Formats Comparison

| Format | Best For | Pros | Cons |
|--------|----------|------|------|
| **PDF** | Stakeholder presentations, executive reports, compliance documentation | Professional appearance, universally readable, preserves formatting | Not editable, larger file size |
| **DOCX** | Technical documentation, collaborative editing, customization | Editable in Word, flexible formatting, easy to modify | Requires Microsoft Word or compatible editor |
| **Excel (.xlsx)** | Data analysis, filtering, pivot tables, spreadsheet workflows | Sortable/filterable, multi-sheet structure, familiar to analysts | Requires Excel or compatible editor |
| **Markdown (.md)** | AI/LLM integration, developer documentation, version control | AI-readable, lightweight, Git-friendly, human-readable | No rich formatting, no embedded images |
| **JSON** | Automation, integration, data analysis, custom tooling | Machine-readable, complete data structure, scriptable | Not human-friendly, requires technical knowledge |

---

## How to Export

### Step 1: Access Export Options

1. Open your completed threat model from the Threat Catalog
2. Click the **Actions** dropdown in the top-right corner
3. Hover over **Download** to see format options:
   - PDF
   - DOCX
   - Excel (XLSX)
   - Markdown (.md)
   - JSON

### Step 2: Select Format

Click your desired format. The file will be generated client-side and downloaded immediately.

---

## Format Details

### PDF Export

Generates a professional report with:
- Title, description, and metadata
- Architecture diagram (embedded image)
- Assumptions list
- Assets, data flows, trust boundaries, and threat sources
- Complete threat catalog with all details

**Best for:** Stakeholder presentations, compliance audits, formal documentation.

### DOCX Export

Generates an editable Word document with the same structure as PDF:
- All sections from your threat model
- Formatted tables for threats
- Editable content for further customization

**Best for:** Collaborative editing, adding annotations, creating templates.

### Excel (.xlsx) Export

Generates a multi-sheet workbook:

| Sheet | Contents |
|-------|----------|
| **Summary** | Title, description, creation date, reasoning level |
| **Threats** | Full threat catalog with ID, name, STRIDE category, description, risk score, likelihood, impact, mitigations, ISO controls, affected assets, status, comments |
| **Assets** | Name, type, description, sensitivity |
| **Data Flows** | Source, target, description |
| **Trust Boundaries** | Source, target, purpose |
| **Assumptions** | Listed assumptions |

**Best for:** Data analysis, sorting/filtering threats, pivot tables, tracking remediation status.

### Markdown (.md) Export

Generates a structured text document:
- Title, description, and metadata
- Assumptions as numbered list
- Assets, data flows, trust boundaries as Markdown tables
- Threat sources with details
- Complete threat catalog **sorted by risk score** (High to Low) with:
  - Attribute tables per threat (STRIDE category, risk score, likelihood, impact, etc.)
  - Description, affected assets, prerequisites, mitigations, ISO controls
  - Comments (if any)

**Best for:** AI/LLM analysis, Git-friendly documentation, developer wikis.

### JSON Export

Exports the complete threat model data structure including:
- All metadata and settings
- Architecture diagram (base64 encoded)
- Assets, flows, boundaries, threat sources
- Full threat catalog with all fields

**Best for:** Tool integration, automation, programmatic access, data migration.

---

## Export Strategies by Audience

### Executive Summary
- **Format:** PDF
- **Focus:** High-level risk overview
- **Tip:** Share only critical and high-risk threats

### Technical Deep-Dive
- **Format:** DOCX or PDF
- **Focus:** Complete analysis with all details
- **Tip:** Include all sections for security engineers

### Compliance Audit
- **Format:** PDF
- **Focus:** Risk assessment with ISO27001 control mapping
- **Tip:** Highlight risk scores and mitigation strategies

### Data Analysis
- **Format:** Excel (.xlsx)
- **Focus:** Sorting, filtering, pivot tables
- **Tip:** Use the Threats sheet to create risk distribution charts

### AI/LLM Analysis
- **Format:** Markdown (.md)
- **Focus:** Feed into ChatGPT, Claude, or other AI tools
- **Tip:** The structured format fits well in AI context windows

### Integration/Automation
- **Format:** JSON
- **Focus:** Programmatic access for custom tools
- **Tip:** Parse the `threat_list.threats` array for threat data

---

## Best Practices

- **Save before exporting** to ensure the latest changes are included
- **Use descriptive filenames** like `PaymentAPI-2025-01-15-ThreatModel.pdf`
- **Export after major changes** to maintain version history
- **Store JSON exports in Git** for version-controlled threat model history
- **Use Markdown for AI workflows** when you want to analyze threats with LLM tools

---

## Next Steps

- [Interact with Threat Model Results](./interact-with-threat-model-results.md) - Customize your threat model before export
- [Collaborate on Threat Models](./collaborate-on-threat-models.md) - Share with team members directly in the app
- [Replay Threat Model](./replay-threat-model.md) - Re-run analysis before exporting updated results
