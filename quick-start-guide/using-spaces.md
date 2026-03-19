# Quick Start Guide: Using Spaces

A **Space** is a personal knowledge base you manage inside Threat Designer. Upload your own documents—architecture runbooks, data classification policies, compliance requirements, or existing security controls—and the agent will query them before analyzing your architecture. Relevant insights are injected into every stage of the threat modeling process, producing a more accurate and context-aware result.

---

## Creating a Space

1. Navigate to **Spaces** in the left sidebar.
2. Click **Create Space** and provide a name and optional description.
3. Once the Space is created, open it and upload documents using the **Upload** button.
   - Accepted formats: PDF, TXT, DOCX, and other common document types.
   - Each uploaded document is ingested into the knowledge base. Ingestion typically completes within a few minutes.
4. You can upload multiple documents and manage them from the Space detail page.

### What to Upload

The agent performs targeted security-relevant queries, so the most valuable documents to include are:

- **Network and architecture diagrams** with annotations
- **Data classification policies** (what data is stored, processed, or transmitted)
- **Compliance requirements** (GDPR, HIPAA, PCI-DSS, SOC 2, etc.)
- **Existing security controls** and hardening guides
- **Runbooks** and operational procedures that reveal trust relationships or access patterns
- **Incident history** or known vulnerability notes relevant to the environment

---

## Attaching a Space to a Threat Model

1. When submitting a new threat model, navigate to the **Details** step of the wizard.
2. Under the **Space** field, select the Space you want to attach.
3. Complete the remaining steps and click **Start threat modeling**.

The Space selection is shown in the **Review and launch** summary before you submit, so you can verify it before starting the job.

> **Note**: A Space can only be attached at submission time. You cannot change the Space on an existing threat model. The space assignment is locked after the job is created to ensure result consistency.

---

## How It Works

When a threat model job has a Space attached, the workflow runs an additional **space_context** stage before asset identification:

1. The agent analyzes the submitted architecture diagram.
2. It issues focused queries against the Space knowledge base (filtered strictly to your Space's documents).
3. Relevant excerpts are evaluated and key insights are captured.
4. These insights are prepended to the prompts for **asset identification**, **data flow mapping**, and **threat cataloging**, so all downstream analysis is informed by your organization's context.

A query budget limits the number of knowledge base calls per job to control cost and latency.

---

## Viewing Space Context Results

After the threat model completes:

1. Open the threat model from the **Threat Catalog**.
2. Open the **Trail** panel (reasoning traces).
3. Select the **Context** tab.

The Context tab shows:

- How many insights were extracted from the Space
- The content of each insight
- The agent's reasoning during the knowledge base query phase

If no documents in the Space were relevant to the submitted architecture, the tab will display **"No relevant insights found"**—this is expected and means the standard analysis ran without Space-specific context.

---

## Sharing a Space

Spaces support the same sharing model as threat models. From the Space detail page you can invite collaborators with **Read** or **Edit** access, allowing teams to maintain a shared knowledge base across multiple threat modeling sessions.

---

## Tips

- **Keep documents focused**: The agent issues targeted queries. Broad, unstructured documents yield fewer relevant results than concise, well-organized ones.
- **Update regularly**: Re-upload documents when your architecture or compliance posture changes to keep insights current.
- **Use alongside Description**: The Space provides persistent, reusable context; the Description field in the submission form is best for per-model context that doesn't belong in a shared knowledge base.

---

## Next Steps

- [Submit a Threat Model](./submit-threat-model.md) — attach a Space during submission
- [Interact with Results](./interact-with-threat-model-results.md) — review the Context tab alongside threats and flows
