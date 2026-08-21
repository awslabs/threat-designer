/**
 * Resolves the threat modeling methodology ("stride" | "maestro") for a threat
 * model item. Pre-#146 records have no `methodology` field at all, so fall back
 * to inferring it from which classification field the threats actually carry.
 */
export function resolveMethodology(item) {
  if (item?.methodology === "maestro" || item?.methodology === "stride") {
    return item.methodology;
  }
  const threats = item?.threat_list?.threats || [];
  if (threats.some((t) => t?.maestro_layer)) {
    return "maestro";
  }
  return "stride";
}

// Short descriptions for the methodology selector's info popover. Ported/summarized
// from backend/threat_designer/constants.py's MAESTRO_LAYER_DEFINITIONS.
export const MAESTRO_LAYER_DESCRIPTIONS = {
  "Foundation Models":
    "The pretrained or fine-tuned model performing inference, reasoning, or generation.",
  "Data Operations":
    "Pipelines that ingest, embed, store, or retrieve data — training corpora, vector stores, RAG sources, caches.",
  "Agent Frameworks":
    "Orchestration that lets a model plan or act — agent loops, tool/function calling, MCP servers, memory.",
  "Deployment and Infrastructure":
    "The compute, network, and supply chain the system runs on — containers, gateways, registries, CI/CD.",
  "Evaluation and Observability":
    "Monitoring, logging, tracing, evaluation harnesses, guardrails, and drift detection.",
  "Security and Compliance":
    "Cross-cutting controls — auth, access control, audit trails, regulatory requirements — applicable regardless of architecture.",
  "Agent Ecosystem":
    "Interaction between this system's agents and other agents or external parties — delegation, marketplaces, third-party plugins.",
  "Cross-Layer":
    "Threats that span multiple layers rather than living in one, such as supply-chain compromise or goal-misalignment cascades.",
};
