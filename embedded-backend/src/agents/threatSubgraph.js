/**
 * Threat Subgraph for Auto Mode (iteration=0)
 *
 * This module defines and compiles the agentic threat generation subgraph
 * that operates within the main threat modeling workflow.
 *
 * The subgraph uses a ReAct pattern where an AI agent autonomously:
 * - Adds threats to the catalog using add_threats tool
 * - Removes threats using remove_threat tool
 * - Reads the catalog using read_threat_catalog tool
 * - Analyzes gaps using gap_analysis tool
 * - Decides when the catalog is comprehensive
 *
 * Graph Structure:
 * - Entry: agent node (initializes with system prompt and human message)
 * - Conditional: shouldContinue (routes to tools or continue based on tool calls)
 * - Tools: toolNode (executes tools called by agent)
 * - Continue: continueOrFinish (validates catalog and routes to parent finalize)
 */

import { StateGraph } from "@langchain/langgraph/web";
import { ThreatState } from "./state.js";
import { agentNode, shouldContinue, continueOrFinish } from "./threatSubgraphNodes.js";
import { toolNode } from "./tools.js";

/**
 * Create and compile the threat subgraph for Auto mode
 * @returns {CompiledStateGraph} Compiled threat subgraph
 */
export function createThreatsSubgraph() {
  console.log("Creating threats subgraph for Auto mode");

  // Create StateGraph with ThreatState
  const workflow = new StateGraph(ThreatState);

  // Add agent node
  workflow.addNode("agent", agentNode);

  // Add tools node (ToolNode)
  workflow.addNode("tools", toolNode);

  // Add continue node
  workflow.addNode("continue", continueOrFinish);

  // Set entry point to agent
  workflow.setEntryPoint("agent");

  // Add conditional edges from agent using shouldContinue
  workflow.addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    continue: "continue",
  });

  // Add edge from tools back to agent
  workflow.addEdge("tools", "agent");

  // Compile and return subgraph
  const compiled = workflow.compile();
  console.log("Threats subgraph compiled successfully");

  return compiled;
}

// Export as default for convenience
export default createThreatsSubgraph;
