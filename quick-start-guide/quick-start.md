# Threat Designer Quick Start Guides

Welcome to Threat Designer, an AI-powered agentic application for automated threat modeling. These guides will help you get started and make the most of Threat Designer's capabilities.

## Getting Started

New to Threat Designer? Start here to understand the complete workflow from submission to analysis.

### [How to Submit a Threat Model](./submit-threat-model.md)

Learn how to create your first threat model by uploading an architecture diagram and configuring AI analysis parameters. This guide covers:

- Completing the submission form with required and optional fields
- Choosing the right iteration count and reasoning boost settings
- Understanding processing times and what to expect
- Tips for creating effective architecture diagrams

**Start here if**: You're submitting your first threat model or want to understand the submission options better.

---

## Working with Results

Once your threat model is complete, these guides help you understand, refine, and enhance your analysis.

### [How to Interact with Threat Model Results](./interact-with-threat-model-results.md)

Navigate and modify your completed threat model results. This guide covers:

- Understanding the STRIDE-based structure (Assets, Flows, Trust Boundaries, Threat Sources, Threat Catalog)
- Editing, adding, and deleting entries across all sections
- Saving your changes and avoiding data loss
- Downloading threat models in multiple formats (PDF, DOCX, JSON)

**Start here if**: Your threat model has finished processing and you want to review or customize the results.

### [How to Replay a Threat Model](./replay-threat-model.md)

Re-run AI analysis on existing threat models to incorporate changes and generate updated insights. This guide covers:

- When and why to use replay instead of creating a new threat model
- Preserving important threats with the starring system
- Adjusting analysis parameters and adding focused instructions
- Understanding what gets preserved vs. updated during replay

**Start here if**: You've made manual edits to your threat model or want to refine the analysis with different parameters.

### [How to Use Sentry](./using-sentry.md)

Interact with Sentry, Threat Designer's built-in AI assistant, for conversational threat analysis. This guide covers:

- Asking Sentry to identify gaps and missing threats
- Getting mitigation recommendations and security guidance
- Having Sentry directly modify your threat catalog through conversation
- Leveraging AWS-specific knowledge for cloud architectures

**Start here if**: You want to explore your threat model interactively, ask security questions, or get AI-assisted recommendations.

### [How to Collaborate on Threat Models](./collaborate-on-threat-models.md)

Share threat models with team members and work together while maintaining data integrity. This guide covers:

- Sharing threat models and managing collaborator access levels
- Understanding edit locks and how they prevent conflicts
- Resolving conflicts when multiple users make changes

**Start here if**: You want to work on threat models with your team or need to share results with stakeholders.

---

## Recommended Workflow

For the best experience with Threat Designer, we recommend this workflow:

1. **Submit** → Create your initial threat model with an architecture diagram ([Submission Guide](./submit-threat-model.md))
2. **Review** → Examine the AI-generated results and make manual refinements ([Interaction Guide](./interact-with-threat-model-results.md))
3. **Collaborate** → Share with team members for review and collective input ([Collaboration Guide](./collaborate-on-threat-models.md))
4. **Enhance** → Use Sentry to explore gaps, improve descriptions, and add missing threats ([Sentry Guide](./using-sentry.md))
5. **Refine** → Replay with updated parameters or instructions to expand your analysis ([Replay Guide](./replay-threat-model.md))
6. **Iterate** → Repeat steps 2-5 as your architecture evolves or your understanding deepens

---

## Quick Reference

| Task                           | Guide                                               | Time Required                      |
| ------------------------------ | --------------------------------------------------- | ---------------------------------- |
| Create first threat model      | [Submit](./submit-threat-model.md)                  | 5 min setup + 15-30 min processing |
| Review and edit results        | [Interact](./interact-with-threat-model-results.md) | 10-30 min                          |
| Share with team members        | [Collaborate](./collaborate-on-threat-models.md)    | 2-5 min                            |
| Ask AI questions about threats | [Sentry](./using-sentry.md)                         | Ongoing                            |
| Update with new parameters     | [Replay](./replay-threat-model.md)                  | 5 min setup + 5-20 min processing  |

---

## Need Help?

Each guide includes:

- Step-by-step instructions with screenshots where helpful
- Best practices and tips for success
- Common use cases and examples

**Remember**: Threat modeling is an iterative process. Don't expect perfection on your first submission—use Threat Designer's tools (manual editing, Sentry, and Replay) to continuously refine and improve your security analysis.
