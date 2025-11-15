/**
 * Threat Designer LangGraph Workflow
 *
 * This module creates and compiles the LangGraph workflow for threat modeling,
 * converted from Python backend/threat_designer/workflow.py to JavaScript.
 */

import { StateGraph, START, END } from "@langchain/langgraph/web";
import { AgentState } from "./state.js";
import * as nodes from "./nodes.js";
import { createThreatsSubgraph } from "./threatSubgraph.js";

/**
 * Create and compile the threat modeling workflow graph
 * @returns {CompiledGraph} Compiled LangGraph workflow
 */
export function createThreatModelingWorkflow() {
  console.log("Creating threat modeling workflow...");

  // Create the state graph
  const workflow = new StateGraph(AgentState);

  // Add all nodes
  // Nodes that don't return Commands
  workflow.addNode("generate_summary", nodes.generateSummary);
  workflow.addNode("define_assets", nodes.defineAssets);
  workflow.addNode("define_flows", nodes.defineFlows);
  workflow.addNode("threats_router", nodes.threatsRouter);
  workflow.addNode("finalize", nodes.finalize);

  // Nodes that return Commands need to specify potential destinations
  workflow.addNode("define_threats", nodes.defineThreats, {
    ends: ["gap_analysis", "define_threats", "finalize"],
  });
  workflow.addNode("gap_analysis", nodes.gapAnalysis, {
    ends: ["define_threats", "finalize"],
  });

  // Add threats subgraph node (compiled subgraph)
  workflow.addNode("threats_subgraph", createThreatsSubgraph());

  // Set entry point
  workflow.addEdge(START, "generate_summary");

  // Conditional routing from summary based on replay flag
  workflow.addConditionalEdges("generate_summary", nodes.routeReplay, {
    replay: "threats_router",
    full: "define_assets",
  });

  // Linear flow for full analysis
  workflow.addEdge("define_assets", "define_flows");
  workflow.addEdge("define_flows", "threats_router");

  // Conditional routing from threats_router based on iteration
  workflow.addConditionalEdges("threats_router", nodes.routeThreatsByIteration, {
    threats_subgraph: "threats_subgraph",
    define_threats: "define_threats",
  });

  // The define_threats node returns a Command that routes to either:
  // - 'gap_analysis' (when iteration === 0)
  // - 'threats' (when iteration > 0, for continued iteration)
  // - 'finalize' (when max retries reached)
  // So we don't need conditional edges here - the Command handles routing

  // The gap_analysis node returns a Command that routes to either:
  // - 'finalize' (when stop === true)
  // - 'threats' (when stop === false, to continue with more threats)
  // So we don't need conditional edges here either

  // End node
  workflow.addEdge("finalize", END);

  // Compile and return the workflow
  console.log("Workflow compiled successfully");
  return workflow.compile();
}

/**
 * Default export of the compiled workflow
 */
export default createThreatModelingWorkflow;
