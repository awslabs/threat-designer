"""
This module defines the state graph and orchestrates the threat modeling workflow.
"""

from typing import Any, Dict

from config import ThreatModelingConfig, config
from constants import (
    WORKFLOW_NODE_ASSET,
    WORKFLOW_NODE_FINALIZE,
    WORKFLOW_NODE_FLOWS,
    WORKFLOW_NODE_IMAGE_TO_BASE64,
    WORKFLOW_NODE_THREATS,
    WORKFLOW_NODE_THREATS_AGENTIC,
    WORKFLOW_NODE_THREATS_TRADITIONAL,
    WORKFLOW_ROUTE_FULL,
    WORKFLOW_ROUTE_REPLAY,
)
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import StateGraph
from langgraph.types import Command
from model_service import ModelService
from nodes import (
    AssetDefinitionService,
    FlowDefinitionService,
    ReplayService,
    SummaryService,
    ThreatDefinitionService,
    WorkflowFinalizationService,
)
from state import AgentState, ConfigSchema
from state_tracking_service import StateService
from workflow_threats import threats_subgraph


class ThreatModelingOrchestrator:
    """Main orchestrator for the threat modeling workflow."""

    def __init__(self, config: ThreatModelingConfig):
        self.model_service = ModelService()
        self.state_service = StateService(config.agent_state_table)

        # Initialize business logic services
        self.summary_service = SummaryService(self.model_service, config)
        self.asset_service = AssetDefinitionService(
            self.model_service, self.state_service
        )
        self.flow_service = FlowDefinitionService(
            self.model_service, self.state_service
        )
        self.threat_service = ThreatDefinitionService(
            self.model_service, self.state_service, config
        )
        self.finalization_service = WorkflowFinalizationService(self.state_service)
        self.replay_service = ReplayService(self.state_service)

    def image_to_base64(
        self, state: AgentState, config: RunnableConfig
    ) -> Dict[str, Any]:
        """Convert image data and generate summary if needed."""
        return self.summary_service.generate_summary(state, config)

    def define_assets(
        self, state: AgentState, config: RunnableConfig
    ) -> Dict[str, Any]:
        """Define assets from architecture analysis."""
        return self.asset_service.define_assets(state, config)

    def define_flows(self, state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
        """Define data flows between assets."""
        return self.flow_service.define_flows(state, config)

    def finalize(self, state: AgentState) -> Command:
        """Finalize the workflow."""
        return self.finalization_service.finalize_workflow(state)

    def route_replay(self, state: AgentState) -> str:
        """Route based on replay flag."""
        return self.replay_service.route_replay(state)

    def define_threats_traditional(
        self, state: AgentState, config: RunnableConfig
    ) -> Command:
        """Define threats using traditional approach."""
        return self.threat_service.define_threats(state, config)

    def threats_router(self, state: AgentState) -> Dict[str, Any]:
        """Passthrough node that returns state unchanged for routing."""
        return {}

    def route_threats_by_iteration(self, state: AgentState) -> str:
        """Route to agentic subgraph or traditional node based on iteration parameter.

        Args:
            state: Current AgentState containing iteration parameter

        Returns:
            str: WORKFLOW_NODE_THREATS_AGENTIC if iteration == 0, WORKFLOW_NODE_THREATS_TRADITIONAL otherwise
        """
        iteration = state.get("iteration", 0)
        if iteration == 0:
            return WORKFLOW_NODE_THREATS_AGENTIC
        return WORKFLOW_NODE_THREATS_TRADITIONAL


# Initialize the orchestrator
orchestrator = ThreatModelingOrchestrator(config)

# Create workflow graph
workflow = StateGraph(AgentState, ConfigSchema)

# Add nodes
workflow.add_node(WORKFLOW_NODE_IMAGE_TO_BASE64, orchestrator.image_to_base64)
workflow.add_node(WORKFLOW_NODE_ASSET, orchestrator.define_assets)
workflow.add_node(WORKFLOW_NODE_FLOWS, orchestrator.define_flows)
workflow.add_node(WORKFLOW_NODE_THREATS, orchestrator.threats_router)  # Routing node
workflow.add_node(
    WORKFLOW_NODE_THREATS_TRADITIONAL, orchestrator.define_threats_traditional
)
workflow.add_node(WORKFLOW_NODE_THREATS_AGENTIC, threats_subgraph)
workflow.add_node(WORKFLOW_NODE_FINALIZE, orchestrator.finalize)

# Set entry point and edges
workflow.set_entry_point(WORKFLOW_NODE_IMAGE_TO_BASE64)

# Route from image_to_base64 based on replay flag
workflow.add_conditional_edges(
    WORKFLOW_NODE_IMAGE_TO_BASE64,
    orchestrator.route_replay,
    {
        WORKFLOW_ROUTE_REPLAY: WORKFLOW_NODE_THREATS,  # Skip to threats routing node
        WORKFLOW_ROUTE_FULL: WORKFLOW_NODE_ASSET,
    },
)

workflow.add_edge(WORKFLOW_NODE_ASSET, WORKFLOW_NODE_FLOWS)

# Add conditional routing from flows based on iteration parameter
# This routes to either agentic subgraph or traditional node
workflow.add_conditional_edges(
    WORKFLOW_NODE_FLOWS,
    orchestrator.route_threats_by_iteration,
    {
        WORKFLOW_NODE_THREATS_AGENTIC: WORKFLOW_NODE_THREATS_AGENTIC,
        WORKFLOW_NODE_THREATS_TRADITIONAL: WORKFLOW_NODE_THREATS_TRADITIONAL,
    },
)

# Add a routing node for threats that checks iteration
# This is used when coming from replay mode
workflow.add_conditional_edges(
    WORKFLOW_NODE_THREATS,
    orchestrator.route_threats_by_iteration,
    {
        WORKFLOW_NODE_THREATS_AGENTIC: WORKFLOW_NODE_THREATS_AGENTIC,
        WORKFLOW_NODE_THREATS_TRADITIONAL: WORKFLOW_NODE_THREATS_TRADITIONAL,
    },
)

# Compile the workflow
agent = workflow.compile()
