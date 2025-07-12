"""State management service for workflow operations."""

from typing import Optional

from constants import FLUSH_MODE_REPLACE, JobState
from exceptions import StateUpdateError
from monitoring import with_error_context
from utils import (create_dynamodb_item, update_item_with_backup,
                   update_job_state, update_trail)


class StateService:
    """Service for managing workflow state operations."""

    def __init__(self, agent_table: str):
        self.agent_table = agent_table

    @with_error_context("job state update")
    def update_job_state(
        self, job_id: str, state: JobState, retry_count: Optional[int] = None
    ) -> None:
        """Update job state with error handling."""
        try:
            # Convert enum to string value for the underlying utility function
            state_value = state.value if isinstance(state, JobState) else state
            update_job_state(job_id, state_value, retry_count)
        except Exception as e:
            raise StateUpdateError(f"Failed to update job state: {str(e)}")

    @with_error_context("trail update")
    def update_trail(
        self,
        job_id: str,
        threats: Optional[str] = None,
        gaps: Optional[str] = None,
        assets: Optional[str] = None,
        flows: Optional[str] = None,
        flush: int = FLUSH_MODE_REPLACE,
    ) -> None:
        """Update trail with reasoning information."""
        try:
            kwargs = {"job_id": job_id, "flush": flush}
            if threats is not None:
                kwargs["threats"] = threats
            if gaps is not None:
                kwargs["gaps"] = gaps
            if assets is not None:
                kwargs["assets"] = assets
            if flows is not None:
                kwargs["flows"] = flows

            update_trail(**kwargs)
        except Exception as e:
            raise StateUpdateError(f"Failed to update trail: {str(e)}")

    @with_error_context("finalization")
    def finalize_workflow(self, state: dict) -> None:
        """Finalize workflow and persist state."""
        try:
            create_dynamodb_item(state, self.agent_table)
        except Exception as e:
            raise StateUpdateError(f"Failed to finalize workflow: {str(e)}")

    @with_error_context("backup update")
    def update_with_backup(self, job_id: str) -> None:
        """Update item with backup."""
        try:
            update_item_with_backup(job_id, self.agent_table)
        except Exception as e:
            raise StateUpdateError(f"Failed to update with backup: {str(e)}")
