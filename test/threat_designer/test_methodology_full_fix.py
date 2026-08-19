"""Tests for the fixes applied in response to the PR #146 maintainer review.

Covers what test_methodology.py / test_methodology_wiring.py didn't:
1. _resolve_methodology rejects non-string input instead of crashing.
2. Replay restores applicable_maestro_layers, not just methodology.
3. VersionState carries methodology + applicable_maestro_layers.
4. The threat-generation/gap-analysis prompts (both provider variants) are
   actually methodology-aware, not just the structured-output schema.
5. The traditional path (iteration >= 1) builds a methodology-constrained
   model instead of the unconstrained base ThreatsList.
"""

import typing

import pytest


def _threat_model_fields(threats_list_model):
    """Pull the required-field set off the inner Threat model of a ThreatsList."""
    threat_annotation = threats_list_model.model_fields["threats"].annotation
    (threat_model,) = typing.get_args(threat_annotation)
    return {n for n, f in threat_model.model_fields.items() if f.is_required()}


# ============================================================================
# 1. _resolve_methodology type guard
# ============================================================================


@pytest.mark.unit
class TestResolveMethodologyTypeGuard:
    def test_non_string_methodology_is_rejected_not_crashed(
        self, entrypoint, validation_error
    ):
        mod = entrypoint()
        with pytest.raises(validation_error, match="Invalid methodology"):
            mod._resolve_methodology(123)

    def test_dict_methodology_is_rejected_not_crashed(self, entrypoint, validation_error):
        mod = entrypoint()
        with pytest.raises(validation_error, match="Invalid methodology"):
            mod._resolve_methodology({"methodology": "maestro"})

    def test_none_methodology_still_defaults_to_stride(self, entrypoint):
        assert entrypoint()._resolve_methodology(None) == "stride"


# ============================================================================
# 2. Replay restores applicable_maestro_layers
# ============================================================================


@pytest.mark.unit
class TestReplayRestoresMaestroLayers:
    def _stored_item(self, **overrides):
        base = {
            "assets": None,
            "system_architecture": None,
            "threat_list": {"threats": []},
            "space_insights": None,
            "s3_location": "diagrams/x.png",
            "s3_locations": None,
            "image_type": "png",
            "description": "",
            "assumptions": [],
            "title": "t",
            "owner": "o",
            "methodology": "maestro",
            "applicable_maestro_layers": ["Foundation Models", "Cross-Layer"],
            "space_id": None,
            "parent_id": None,
        }
        return {**base, **overrides}

    def test_applicable_maestro_layers_survive_replay(self, entrypoint, monkeypatch):
        mod = entrypoint()
        monkeypatch.setattr(
            mod, "fetch_results", lambda job_id, table: {"item": self._stored_item()}
        )
        monkeypatch.setattr(
            mod, "parse_s3_image_to_base64", lambda bucket, loc: "aGVsbG8="
        )

        state = mod._handle_replay_state(mod.AgentState(), "job-1")

        assert state["applicable_maestro_layers"] == ["Foundation Models", "Cross-Layer"]
        assert state["methodology"] == "maestro"

    def test_missing_applicable_maestro_layers_restores_none(self, entrypoint, monkeypatch):
        """A pre-fix stored item (no applicable_maestro_layers key) must not crash replay."""
        mod = entrypoint()
        monkeypatch.setattr(
            mod,
            "fetch_results",
            lambda job_id, table: {
                "item": self._stored_item(applicable_maestro_layers=None)
            },
        )
        monkeypatch.setattr(
            mod, "parse_s3_image_to_base64", lambda bucket, loc: "aGVsbG8="
        )

        state = mod._handle_replay_state(mod.AgentState(), "job-1")

        assert state["applicable_maestro_layers"] is None


# ============================================================================
# 3. VersionState carries the methodology channels
# ============================================================================


@pytest.mark.unit
def test_version_state_declares_methodology_channels(agent):
    annotations = agent.state.VersionState.__annotations__
    assert "methodology" in annotations
    assert "applicable_maestro_layers" in annotations


# ============================================================================
# 4. Prompts are methodology-aware, in both provider variants
# ============================================================================


def _text_of(system_message):
    """Flatten a SystemMessage's content (str or content-block list) to plain text."""
    content = system_message.content
    if isinstance(content, str):
        return content
    return " ".join(
        block.get("text", "") for block in content if isinstance(block, dict)
    )


@pytest.mark.unit
@pytest.mark.parametrize("variant", ["stride", "gpt"])
class TestPromptsAreMethodologyAware:
    def test_gap_prompt_uses_maestro_layer_under_maestro(self, prompts, variant):
        mod = getattr(prompts, variant)
        text = mod.gap_prompt(methodology="maestro")[0]["text"]
        assert "maestro_layer" in text
        assert "Foundation Models" in text  # from MAESTRO_LAYER_DEFINITIONS

    def test_gap_prompt_uses_stride_category_under_stride(self, prompts, variant):
        mod = getattr(prompts, variant)
        text = mod.gap_prompt(methodology="stride")[0]["text"]
        assert "stride_category" in text
        assert "maestro_layer" not in text

    def test_threats_prompt_schema_field_matches_methodology(self, prompts, variant):
        mod = getattr(prompts, variant)
        maestro_text = mod.threats_prompt(methodology="maestro")[0]["text"]
        stride_text = mod.threats_prompt(methodology="stride")[0]["text"]
        assert '"maestro_layer"' in maestro_text
        assert '"stride_category"' in stride_text
        assert '"maestro_layer"' not in stride_text

    def test_agentic_system_prompt_is_not_hardcoded_to_stride(self, prompts, variant):
        mod = getattr(prompts, variant)
        maestro_msg = mod.create_threats_agent_system_prompt(methodology="maestro")
        text = _text_of(maestro_msg)
        assert "CSA MAESTRO framework" in text
        assert "Foundation Models" in text
        assert "using the STRIDE methodology" not in text

    def test_agentic_system_prompt_still_says_stride_for_stride(self, prompts, variant):
        mod = getattr(prompts, variant)
        stride_msg = mod.create_threats_agent_system_prompt(methodology="stride")
        text = _text_of(stride_msg)
        assert "STRIDE methodology" in text

    def test_version_agent_prompt_drops_hardcoded_apply_stride(self, prompts, variant):
        mod = getattr(prompts, variant)
        maestro_msg = mod.create_version_agent_system_prompt(methodology="maestro")
        text = _text_of(maestro_msg)
        assert "Apply STRIDE" not in text
        assert "MAESTRO layer" in text


# ============================================================================
# 5. Traditional path builds a methodology-constrained model
# ============================================================================


@pytest.mark.unit
class TestTraditionalPathIsMethodologyAware:
    def test_invoke_threat_model_constrains_to_maestro(self, agent):
        service = agent.nodes.ThreatDefinitionService.__new__(
            agent.nodes.ThreatDefinitionService
        )
        captured = {}

        class _StubModelService:
            def invoke_structured_model(self, messages, schemas, config, reasoning, name):
                captured["schema"] = schemas[0]
                return {"structured_response": None, "reasoning": None}

        service.model_service = _StubModelService()

        state = {
            "methodology": "maestro",
            "assets": None,
            "system_architecture": None,
        }
        service._invoke_threat_model([], {"configurable": {}}, state)

        required = _threat_model_fields(captured["schema"])
        assert "maestro_layer" in required
        assert "stride_category" not in required

    def test_invoke_threat_model_constrains_to_stride_by_default(self, agent):
        service = agent.nodes.ThreatDefinitionService.__new__(
            agent.nodes.ThreatDefinitionService
        )
        captured = {}

        class _StubModelService:
            def invoke_structured_model(self, messages, schemas, config, reasoning, name):
                captured["schema"] = schemas[0]
                return {"structured_response": None, "reasoning": None}

        service.model_service = _StubModelService()

        state = {"assets": None, "system_architecture": None}
        service._invoke_threat_model([], {"configurable": {}}, state)

        required = _threat_model_fields(captured["schema"])
        assert "stride_category" in required
        assert "maestro_layer" not in required


# ============================================================================
# 6. validate_node forwards applicable_maestro_layers across the subgraph
#    boundary — found via a live end-to-end run, not by static review. Its
#    Command(graph=Command.PARENT, ...) jump from the threats subgraph
#    straight to the parent's finalize node only carries whatever keys are
#    named in `update`; applicable_maestro_layers was silently dropped on
#    every completed run, so it was never actually in DynamoDB to restore.
# ============================================================================


@pytest.mark.unit
class TestValidateNodeForwardsMaestroLayers:
    def _completed_state(self, agent, make_threat, **overrides):
        threats = [
            make_threat(maestro_layer="Security and Compliance"),
            make_threat(maestro_layer="Cross-Layer"),
            make_threat(maestro_layer="Foundation Models"),
        ]
        base = {
            "job_id": "job-1",
            "methodology": "maestro",
            "applicable_maestro_layers": ["Foundation Models"],
            "gap_tool_use": 1,
            "threat_list": agent.state.ThreatsList(threats=threats),
            "messages": [],
        }
        return {**base, **overrides}

    def test_successful_completion_carries_applicable_maestro_layers_to_parent(
        self, agent, make_threat
    ):
        state = self._completed_state(agent, make_threat)
        command = agent.workflow_threats.validate_node(state)

        assert command.graph == agent.workflow_threats.Command.PARENT
        assert command.update["applicable_maestro_layers"] == ["Foundation Models"]

    def test_stride_completion_carries_none_through_harmlessly(self, agent, make_threat):
        threats = [make_threat(stride_category=c) for c in [
            "Spoofing", "Tampering", "Repudiation",
            "Information Disclosure", "Denial of Service", "Elevation of Privilege",
        ]]
        state = self._completed_state(
            agent, make_threat,
            methodology="stride",
            applicable_maestro_layers=None,
            threat_list=agent.state.ThreatsList(threats=threats),
        )
        command = agent.workflow_threats.validate_node(state)

        assert command.update["applicable_maestro_layers"] is None
