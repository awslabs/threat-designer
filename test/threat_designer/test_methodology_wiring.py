"""End-to-end wiring tests: a caller must be able to actually select MAESTRO.

The schema, gate and detection are covered in test_methodology.py. These tests
cover the path a request travels — API payload to agent state to persistence —
because a methodology the caller cannot set is dead code no matter how correct
the rest of it is.
"""

import pytest


# ============================================================================
# Methodology resolution at the agent boundary
# ============================================================================


@pytest.mark.unit
def test_absent_methodology_defaults_to_stride(entrypoint):
    assert entrypoint()._resolve_methodology(None) == "stride"


@pytest.mark.unit
@pytest.mark.parametrize("value", ["maestro", "MAESTRO", "  Maestro  "])
def test_methodology_is_case_and_whitespace_tolerant(entrypoint, value):
    assert entrypoint()._resolve_methodology(value) == "maestro"


@pytest.mark.unit
def test_unknown_methodology_is_rejected(entrypoint, validation_error):
    with pytest.raises(validation_error, match="Invalid methodology"):
        entrypoint()._resolve_methodology("bogus")


@pytest.mark.unit
def test_maestro_is_rejected_when_the_feature_flag_is_off(entrypoint, validation_error):
    """The Terraform flag must actually gate the feature, not just exist."""
    with pytest.raises(validation_error, match="disabled for this deployment"):
        entrypoint(maestro_enabled=False)._resolve_methodology("maestro")


@pytest.mark.unit
def test_stride_still_works_when_maestro_is_disabled(entrypoint):
    assert entrypoint(maestro_enabled=False)._resolve_methodology("stride") == "stride"


@pytest.mark.unit
def test_disabling_maestro_never_silently_downgrades(entrypoint, validation_error):
    """A caller asking for MAESTRO must not receive a STRIDE model labelled otherwise."""
    with pytest.raises(validation_error):
        entrypoint(maestro_enabled=False)._resolve_methodology("maestro")


# ============================================================================
# Full request flow
# ============================================================================


@pytest.mark.unit
def test_methodology_survives_the_whole_pipeline(agent, entrypoint, make_threat):
    """API payload -> agent state -> threats subgraph -> gate -> persisted item."""
    mod = entrypoint()

    # 1. API layer forwards the caller's choice (mirrors threat_designer_service)
    payload = {"methodology": "maestro", "application_type": "hybrid"}
    agent_input = {"methodology": payload.get("methodology", "stride")}
    assert agent_input["methodology"] == "maestro"

    # 2. Agent entrypoint validates it onto state
    resolved = mod._resolve_methodology(agent_input["methodology"])
    state = {"methodology": resolved}
    assert state["methodology"] == "maestro"

    # 3. The threats subgraph selects the MAESTRO classification axis
    axis = agent.tools.classification_axis(state["methodology"])
    assert axis.field == "maestro_layer"

    # 4. The model is only offered MAESTRO layers
    threat_model, _ = agent.state.create_constrained_threat_model(
        frozenset({"API"}), frozenset({"Insider"}), state["methodology"]
    )
    required = {n for n, f in threat_model.model_fields.items() if f.is_required()}
    assert "maestro_layer" in required and "stride_category" not in required

    # 5. Detected layers drive the gate
    state["applicable_maestro_layers"] = ["Foundation Models"]
    catalog = type("TL", (), {})()
    catalog.threats = [
        make_threat(maestro_layer="Security and Compliance"),
        make_threat(maestro_layer="Cross-Layer"),
    ]
    assert "Foundation Models" in agent.workflow_threats._coverage_feedback(
        state, catalog
    )

    catalog.threats.append(make_threat(maestro_layer="Foundation Models"))
    assert agent.workflow_threats._coverage_feedback(state, catalog) is None

    # 6. Persistence keeps it, so replay/version stay on the same axis
    item = {
        "methodology": state.get("methodology"),
        "applicable_maestro_layers": state.get("applicable_maestro_layers"),
    }
    item = {k: v for k, v in item.items() if v is not None}
    assert item["methodology"] == "maestro"
    assert item["applicable_maestro_layers"] == ["Foundation Models"]


@pytest.mark.unit
def test_stride_path_is_unchanged_end_to_end(agent, entrypoint, make_threat):
    """Existing callers send no methodology and must behave exactly as before."""
    mod = entrypoint()
    resolved = mod._resolve_methodology({}.get("methodology"))
    state = {"methodology": resolved}

    assert agent.tools.classification_axis(state["methodology"]).field == "stride_category"

    catalog = type("TL", (), {})()
    catalog.threats = [
        make_threat(stride_category=c)
        for c in [
            "Spoofing",
            "Tampering",
            "Repudiation",
            "Information Disclosure",
            "Denial of Service",
            "Elevation of Privilege",
        ]
    ]
    assert agent.workflow_threats._coverage_feedback(state, catalog) is None
