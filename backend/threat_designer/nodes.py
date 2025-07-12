"""Business logic services for threat modeling graph nodes."""

import time
from datetime import datetime
from typing import Any, Dict

from config import ThreatModelingConfig
from constants import (FINALIZATION_SLEEP_SECONDS, FLUSH_MODE_APPEND,
                       FLUSH_MODE_REPLACE, JobState)
from langchain_core.messages import SystemMessage
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import END
from langgraph.types import Command
from message_builder import MessageBuilder, list_to_string
from model_service import ModelService
from monitoring import logger, operation_context, with_error_context
from prompts import (asset_prompt, flow_prompt, gap_prompt, summary_prompt,
                     threats_improve_prompt, threats_prompt)
from state import (AgentState, AssetsList, ContinueThreatModeling, FlowsList,
                   SummaryState, ThreatsList)
from state_tracking_service import StateService


class SummaryService:
    """Service for generating architecture summaries."""

    def __init__(self, model_service: ModelService, config: ThreatModelingConfig):
        self.model_service = model_service
        self.config = config

    @with_error_context("summary node execution")
    def generate_summary(
        self, state: AgentState, config: RunnableConfig
    ) -> Dict[str, Any]:
        """Generate architecture summary if not already present."""
        if state.get("summary"):
            return {"image_data": state["image_data"]}

        with operation_context("generate_summary", state.get("job_id", "unknown")):
            msg_builder = MessageBuilder(
                state["image_data"],
                state.get("description", ""),
                list_to_string(state.get("assumptions", [])),
            )
            message = msg_builder.create_summary_message(
                self.config.summary_max_words,
            )

            system_prompt = SystemMessage(content=summary_prompt())

            messages = [system_prompt, message]
            response = self.model_service.generate_summary(
                messages, [SummaryState], config
            )

            return {"image_data": state["image_data"], "summary": response.summary}


class AssetDefinitionService:
    """Service for defining architecture assets."""

    def __init__(self, model_service: ModelService, state_service: StateService):
        self.model_service = model_service
        self.state_service = state_service

    def define_assets(
        self, state: AgentState, config: RunnableConfig
    ) -> Dict[str, Any]:
        """Define assets from architecture analysis."""
        job_id = state.get("job_id", "unknown")

        with operation_context("define_assets", job_id):
            self.state_service.update_job_state(job_id, JobState.ASSETS.value)

            message = self._prepare_asset_message(state)
            assets = self._invoke_asset_model(message, config, job_id)

            return {"assets": assets}

    def _prepare_asset_message(self, state: AgentState) -> list:
        """Prepare message for asset definition."""

        msg_builder = MessageBuilder(
            state["image_data"],
            state.get("description", ""),
            list_to_string(state.get("assumptions", [])),
        )

        human_message = msg_builder.create_asset_message()

        system_prompt = SystemMessage(content=asset_prompt())

        return [system_prompt, human_message]

    @with_error_context("asset node execution")
    def _invoke_asset_model(
        self, messages: list, config: RunnableConfig, job_id: str
    ) -> Any:
        """Invoke model for asset definition."""
        reasoning = config["configurable"].get("reasoning", False)
        response = self.model_service.invoke_structured_model(
            messages, [AssetsList], config, reasoning
        )
        if response["reasoning"]:
            self.state_service.update_trail(job_id=job_id, assets=response["reasoning"])
        return response["structured_response"]


class FlowDefinitionService:
    """Service for defining data flows between assets."""

    def __init__(self, model_service: ModelService, state_service: StateService):
        self.model_service = model_service
        self.state_service = state_service

    def define_flows(self, state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
        """Define data flows in the architecture."""
        job_id = state.get("job_id", "unknown")

        with operation_context("define_flows", job_id):
            self.state_service.update_job_state(job_id, JobState.FLOW.value)

            message = self._prepare_flow_message(state)
            flows = self._invoke_flow_model(message, config, job_id)

            return {"system_architecture": flows}

    def _prepare_flow_message(self, state: AgentState) -> list:
        """Prepare message for flow definition."""

        msg_builder = MessageBuilder(
            state["image_data"],
            state.get("description", ""),
            list_to_string(state.get("assumptions", [])),
        )
        human_message = msg_builder.create_system_flows_message(assets=state["assets"])
        system_prompt = SystemMessage(content=flow_prompt())

        return [system_prompt, human_message]

    @with_error_context("flow node execution")
    def _invoke_flow_model(
        self, messages: list, config: RunnableConfig, job_id: str
    ) -> Any:
        """Invoke model for flow definition."""
        reasoning = config["configurable"].get("reasoning", False)
        response = self.model_service.invoke_structured_model(
            messages, [FlowsList], config, reasoning
        )
        if response["reasoning"]:
            self.state_service.update_trail(job_id=job_id, flows=response["reasoning"])
        return response["structured_response"]


class ThreatDefinitionService:
    """Service for defining threats and mitigations."""

    def __init__(
        self,
        model_service: ModelService,
        state_service: StateService,
        config: ThreatModelingConfig,
    ):
        self.model_service = model_service
        self.state_service = state_service
        self.config = config

    def define_threats(self, state: AgentState, config: RunnableConfig) -> Command:
        """Define threats and mitigations for the architecture."""
        job_id = state.get("job_id", "unknown")
        retry_count = int(state.get("retry", 1))
        iteration = int(state.get("iteration", 0))

        with operation_context("define_threats", job_id):
            if self._should_finalize(retry_count, iteration, config):
                return Command(goto="finalize")

            self._update_job_state_for_threats(job_id, retry_count)

            messages = self._prepare_threat_messages(state, retry_count)
            response = self._invoke_threat_model(messages, config)

            self._update_reasoning_trail(
                response["reasoning"], config, job_id, retry_count
            )

            return self._create_next_command(
                response["structured_response"], retry_count, iteration
            )

    def _should_finalize(
        self, retry_count: int, iteration: int, config: RunnableConfig
    ) -> bool:
        """Check if threat modeling should finalize."""
        start_time = config["configurable"].get("start_time")
        current_time = datetime.now()

        max_retries_reached = retry_count > self.config.max_retry
        iteration_limit_reached = (retry_count > iteration) and (iteration != 0)
        time_limit_reached = (
            current_time - start_time
        ).total_seconds() >= self.config.max_execution_time_minutes * 60

        return max_retries_reached or iteration_limit_reached or time_limit_reached

    def _update_job_state_for_threats(self, job_id: str, retry_count: int) -> None:
        """Update job state based on retry count."""
        if retry_count > 1:
            self.state_service.update_job_state(
                job_id, JobState.THREAT_RETRY.value, retry_count
            )
        else:
            self.state_service.update_job_state(
                job_id, JobState.THREAT.value, retry_count
            )

    def _prepare_threat_messages(self, state: AgentState, retry_count: int) -> list:
        """Prepare messages for threat definition."""
        gap = state.get("gap", [])

        msg_builder = MessageBuilder(
            state["image_data"],
            state.get("description", ""),
            list_to_string(state.get("assumptions", [])),
        )

        if retry_count > 1:
            human_message = msg_builder.create_threat_improve_message(
                state["assets"], state["system_architecture"], state["threat_list"], gap
            )
            system_prompt = SystemMessage(content=threats_improve_prompt())
        else:
            human_message = msg_builder.create_threat_message(
                state["assets"], state["system_architecture"]
            )
            system_prompt = SystemMessage(content=threats_prompt())

        return [system_prompt, human_message]

    @with_error_context("threat node execution")
    def _invoke_threat_model(self, messages: list, config: RunnableConfig) -> Any:
        """Invoke model for threat definition."""
        reasoning = config["configurable"].get("reasoning", False)
        return self.model_service.invoke_structured_model(
            messages, [ThreatsList], config, reasoning
        )

    def _update_reasoning_trail(
        self, reasoning_text: Any, config: RunnableConfig, job_id: str, retry_count: int
    ) -> None:
        """Update reasoning trail if enabled."""
        reasoning = config["configurable"].get("reasoning", False)

        if reasoning:
            flush = FLUSH_MODE_REPLACE if retry_count == 1 else FLUSH_MODE_APPEND
            if reasoning_text:
                self.state_service.update_trail(
                    job_id=job_id, threats=reasoning_text, flush=flush
                )

    def _create_next_command(
        self, response: Any, retry_count: int, iteration: int
    ) -> Command:
        """Create next command based on current state."""
        next_retry = retry_count + 1

        if iteration == 0:
            return Command(
                goto="gap_analysis",
                update={"threat_list": response, "retry": next_retry},
            )

        return Command(
            goto="threats", update={"threat_list": response, "retry": next_retry}
        )


class GapAnalysisService:
    """Service for analyzing gaps in threat model."""

    def __init__(self, model_service: ModelService, state_service: StateService):
        self.model_service = model_service
        self.state_service = state_service

    def analyze_gaps(self, state: AgentState, config: RunnableConfig) -> Command:
        """Analyze gaps in the threat model."""
        job_id = state.get("job_id", "unknown")

        with operation_context("gap_analysis", job_id):
            messages = self._prepare_gap_messages(state)
            response = self._invoke_gap_model(messages, config)

            self._update_gap_reasoning_trail(
                response["reasoning"], config, job_id, state
            )

            if response["structured_response"].stop:
                return Command(goto="finalize")

            return Command(
                goto="threats", update={"gap": [response["structured_response"].gap]}
            )

    def _prepare_gap_messages(self, state: AgentState) -> list:
        """Prepare messages for gap analysis."""

        msg_builder = MessageBuilder(
            state["image_data"],
            state.get("description", ""),
            list_to_string(state.get("assumptions", [])),
        )

        human_message = msg_builder.create_gap_analysis_message(
            state["assets"],
            state["system_architecture"],
            state.get("threat_list", ""),
            state.get("gap", []),
        )

        system_prompt = SystemMessage(content=gap_prompt())

        return [system_prompt, human_message]

    @with_error_context("gap node execution")
    def _invoke_gap_model(self, messages: list, config: RunnableConfig) -> Any:
        """Invoke model for gap analysis."""
        reasoning = config["configurable"].get("reasoning", False)
        return self.model_service.invoke_structured_model(
            messages, [ContinueThreatModeling], config, reasoning
        )

    def _update_gap_reasoning_trail(
        self,
        reasoning_text: Any,
        config: RunnableConfig,
        job_id: str,
        state: AgentState,
    ) -> None:
        """Update gap reasoning trail if enabled."""
        reasoning = config["configurable"].get("reasoning", False)

        if reasoning:
            flush = (
                FLUSH_MODE_REPLACE
                if int(state.get("retry", 1)) == 1
                else FLUSH_MODE_APPEND
            )
            if reasoning_text:
                self.state_service.update_trail(
                    job_id=job_id, gaps=reasoning_text, flush=flush
                )


class WorkflowFinalizationService:
    """Service for finalizing the workflow."""

    def __init__(self, state_service: StateService):
        self.state_service = state_service

    def finalize_workflow(self, state: AgentState) -> Command:
        """Finalize the threat modeling workflow."""
        job_id = state.get("job_id", "unknown")

        with operation_context("finalize_workflow", job_id):
            try:
                self.state_service.update_job_state(job_id, JobState.FINALIZE.value)
                self.state_service.finalize_workflow(state)
                time.sleep(FINALIZATION_SLEEP_SECONDS)
                self.state_service.update_job_state(job_id, JobState.COMPLETE.value)
                return Command(goto=END)
            except Exception as e:
                self.state_service.update_job_state(job_id, JobState.FAILED.value)
                raise e


class ReplayService:
    """Service for handling replay operations."""

    def __init__(self, state_service: StateService):
        self.state_service = state_service

    def route_replay(self, state: AgentState) -> str:
        """Route workflow based on replay flag."""
        if not state.get("replay", False):
            return "full"

        job_id = state.get("job_id", "unknown")

        with operation_context("replay_routing", job_id):
            try:
                self.state_service.update_trail(
                    job_id=job_id, threats=[], gaps=[], flush=FLUSH_MODE_REPLACE
                )
                self.state_service.update_with_backup(job_id)
                return "replay"
            except Exception as e:
                logger.error(f"Replay routing failed: {e}")
                raise e
