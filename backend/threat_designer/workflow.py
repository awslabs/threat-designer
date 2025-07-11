"""
This module defines the state graph and orchestrates the threat modeling workflow.
"""

from typing import Any, Dict

from config import ThreatModelingConfig, config
from constants import (WORKFLOW_NODE_ASSET, WORKFLOW_NODE_FINALIZE,
                       WORKFLOW_NODE_FLOWS, WORKFLOW_NODE_GAP_ANALYSIS,
                       WORKFLOW_NODE_IMAGE_TO_BASE64, WORKFLOW_NODE_THREATS,
                       WORKFLOW_ROUTE_FULL, WORKFLOW_ROUTE_REPLAY)
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import StateGraph
from langgraph.types import Command
from model_service import ModelService
from nodes import (AssetDefinitionService, FlowDefinitionService,
                   GapAnalysisService, ReplayService, SummaryService,
                   ThreatDefinitionService, WorkflowFinalizationService)
from state import AgentState, ConfigSchema
from state_tracking_service import StateService


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
        self.gap_service = GapAnalysisService(self.model_service, self.state_service)
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

    def define_threats(self, state: AgentState, config: RunnableConfig) -> Command:
        """Define threats and mitigations."""
        return self.threat_service.define_threats(state, config)

    def gap_analysis(self, state: AgentState, config: RunnableConfig) -> Command:
        """Analyze gaps in threat model."""
        return self.gap_service.analyze_gaps(state, config)

    def finalize(self, state: AgentState) -> Command:
        """Finalize the workflow."""
        return self.finalization_service.finalize_workflow(state)

    def route_replay(self, state: AgentState) -> str:
        """Route based on replay flag."""
        return self.replay_service.route_replay(state)


# Initialize the orchestrator
orchestrator = ThreatModelingOrchestrator(config)

# Create workflow graph
workflow = StateGraph(AgentState, ConfigSchema)

# Add nodes
workflow.add_node(WORKFLOW_NODE_IMAGE_TO_BASE64, orchestrator.image_to_base64)
workflow.add_node(WORKFLOW_NODE_ASSET, orchestrator.define_assets)
workflow.add_node(WORKFLOW_NODE_FLOWS, orchestrator.define_flows)
workflow.add_node(WORKFLOW_NODE_THREATS, orchestrator.define_threats)
workflow.add_node(WORKFLOW_NODE_GAP_ANALYSIS, orchestrator.gap_analysis)
workflow.add_node(WORKFLOW_NODE_FINALIZE, orchestrator.finalize)

# Set entry point and edges
workflow.set_entry_point(WORKFLOW_NODE_IMAGE_TO_BASE64)
workflow.add_conditional_edges(
    WORKFLOW_NODE_IMAGE_TO_BASE64,
    orchestrator.route_replay,
    {
        WORKFLOW_ROUTE_REPLAY: WORKFLOW_NODE_THREATS,
        WORKFLOW_ROUTE_FULL: WORKFLOW_NODE_ASSET,
    },
)
workflow.add_edge(WORKFLOW_NODE_ASSET, WORKFLOW_NODE_FLOWS)
workflow.add_edge(WORKFLOW_NODE_FLOWS, WORKFLOW_NODE_THREATS)

# Compile the workflow
agent = workflow.compile()
