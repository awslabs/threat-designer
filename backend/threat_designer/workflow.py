"""
This module defines the state graph and orchestrates the threat modeling workflow.
"""

from typing import Any, Dict

from config import ThreatModelingConfig, config
from constants import (
    WORKFLOW_NODE_ASSET,
    WORKFLOW_NODE_VERSION_DIFF,
    WORKFLOW_NODE_FINALIZE,
    WORKFLOW_NODE_FLOWS,
    WORKFLOW_NODE_IMAGE_TO_BASE64,
    WORKFLOW_NODE_SPACE_CONTEXT,
    WORKFLOW_NODE_THREATS_AGENTIC,
    WORKFLOW_NODE_THREATS_TRADITIONAL,
)
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import StateGraph
from langgraph.types import Command
from model_service import ModelService
from nodes import (
    AssetDefinitionService,
    ReplayService,
    SummaryService,
    ThreatDefinitionService,
    WorkflowFinalizationService,
)
from state import AgentState, ConfigSchema
from state_tracking_service import StateService
from workflow_version import version_subgraph
from workflow_flows import flows_subgraph
from workflow_threats import threats_subgraph
from workflow_space_context import space_context_subgraph


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

    def finalize(self, state: AgentState, config: RunnableConfig) -> Command:
        """Finalize the workflow."""
        return self.finalization_service.finalize_workflow(state, config)

    def route_after_summary(self, state: AgentState) -> str:
        """Route after summary node: replay → threats, space_id → space_context, else → asset."""
        return self.replay_service.route_after_summary(state)

    def define_threats_traditional(
        self, state: AgentState, config: RunnableConfig
    ) -> Command:
        """Define threats using traditional approach."""
        return self.threat_service.define_threats(state, config)


# Initialize the orchestrator
orchestrator = ThreatModelingOrchestrator(config)

# Create workflow graph
workflow = StateGraph(AgentState, ConfigSchema)

# Add nodes
workflow.add_node(WORKFLOW_NODE_IMAGE_TO_BASE64, orchestrator.image_to_base64)
workflow.add_node(WORKFLOW_NODE_SPACE_CONTEXT, space_context_subgraph)
workflow.add_node(WORKFLOW_NODE_ASSET, orchestrator.define_assets)
workflow.add_node(WORKFLOW_NODE_FLOWS, flows_subgraph)
workflow.add_node(
    WORKFLOW_NODE_THREATS_TRADITIONAL, orchestrator.define_threats_traditional
)
workflow.add_node(WORKFLOW_NODE_THREATS_AGENTIC, threats_subgraph)
workflow.add_node(WORKFLOW_NODE_VERSION_DIFF, version_subgraph)
workflow.add_node(WORKFLOW_NODE_FINALIZE, orchestrator.finalize)

# Set entry point and edges
workflow.set_entry_point(WORKFLOW_NODE_IMAGE_TO_BASE64)

# Route from image_to_base64: version → version_diff, replay → threats, space_id → space_context, else → asset
workflow.add_conditional_edges(
    WORKFLOW_NODE_IMAGE_TO_BASE64,
    orchestrator.route_after_summary,
    {
        WORKFLOW_NODE_VERSION_DIFF: WORKFLOW_NODE_VERSION_DIFF,
        WORKFLOW_NODE_SPACE_CONTEXT: WORKFLOW_NODE_SPACE_CONTEXT,
        WORKFLOW_NODE_ASSET: WORKFLOW_NODE_ASSET,
        WORKFLOW_NODE_THREATS_AGENTIC: WORKFLOW_NODE_THREATS_AGENTIC,
        WORKFLOW_NODE_THREATS_TRADITIONAL: WORKFLOW_NODE_THREATS_TRADITIONAL,
    },
)

workflow.add_edge(WORKFLOW_NODE_ASSET, WORKFLOW_NODE_FLOWS)

# Flows subgraph handles routing to threats_agentic or threats_traditional
# via Command.PARENT in its continue_or_finish node

# Compile the workflow
agent = workflow.compile()
