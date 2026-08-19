"""Tests for MAESTRO methodology support alongside STRIDE."""

from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError


class SimpleThreatList:
    """Stand-in for ThreatsList that skips its list validators."""

    def __init__(self, threats):
        self.threats = threats


ALL_STRIDE = [
    "Spoofing",
    "Tampering",
    "Repudiation",
    "Information Disclosure",
    "Denial of Service",
    "Elevation of Privilege",
]


# ============================================================================
# Enums
# ============================================================================


@pytest.mark.unit
def test_maestro_layers_match_the_csa_framework(agent):
    assert [layer.value for layer in agent.constants.MaestroLayer] == [
        "Foundation Models",
        "Data Operations",
        "Agent Frameworks",
        "Deployment and Infrastructure",
        "Evaluation and Observability",
        "Security and Compliance",
        "Agent Ecosystem",
        "Cross-Layer",
    ]


@pytest.mark.unit
def test_vertical_and_cross_layer_are_always_applicable(agent):
    assert agent.constants.MAESTRO_ALWAYS_APPLICABLE == frozenset(
        {"Security and Compliance", "Cross-Layer"}
    )


@pytest.mark.unit
def test_default_methodology_is_stride(agent):
    assert agent.constants.DEFAULT_METHODOLOGY == "stride"


# ============================================================================
# Threat schema
# ============================================================================


@pytest.mark.unit
def test_stride_threat_leaves_maestro_layer_unset(make_threat):
    threat = make_threat(stride_category="Spoofing")
    assert threat.stride_category == "Spoofing"
    assert threat.maestro_layer is None


@pytest.mark.unit
def test_maestro_threat_leaves_stride_category_unset(make_threat):
    threat = make_threat(maestro_layer="Agent Frameworks")
    assert threat.maestro_layer == "Agent Frameworks"
    assert threat.stride_category is None


@pytest.mark.unit
def test_threat_without_any_classification_is_rejected(make_threat):
    with pytest.raises(ValidationError):
        make_threat()


@pytest.mark.unit
def test_maestro_schema_requires_the_layer_and_not_the_stride_category(agent):
    threat_model, _ = agent.state.create_constrained_threat_model(
        frozenset({"API"}), frozenset({"Insider"}), "maestro"
    )
    required = {n for n, f in threat_model.model_fields.items() if f.is_required()}
    assert "maestro_layer" in required
    assert "stride_category" not in required


@pytest.mark.unit
def test_stride_schema_requires_the_category_and_not_the_maestro_layer(agent):
    threat_model, _ = agent.state.create_constrained_threat_model(
        frozenset({"API"}), frozenset({"Insider"}), "stride"
    )
    required = {n for n, f in threat_model.model_fields.items() if f.is_required()}
    assert "stride_category" in required
    assert "maestro_layer" not in required


@pytest.mark.unit
def test_schema_defaults_to_stride_for_existing_two_argument_callers(agent):
    explicit, _ = agent.state.create_constrained_threat_model(
        frozenset({"API"}), frozenset(), "stride"
    )
    implicit, _ = agent.state.create_constrained_threat_model(
        frozenset({"API"}), frozenset()
    )
    assert implicit.model_fields.keys() == explicit.model_fields.keys()
    assert {n for n, f in implicit.model_fields.items() if f.is_required()} == {
        n for n, f in explicit.model_fields.items() if f.is_required()
    }


@pytest.mark.unit
def test_maestro_schema_does_not_offer_stride_values_to_the_model(agent):
    """A MAESTRO run must not let the model classify along the STRIDE axis."""
    threat_model, _ = agent.state.create_constrained_threat_model(
        frozenset({"API"}), frozenset(), "maestro"
    )
    schema = threat_model.model_json_schema()
    assert "Spoofing" not in str(schema["properties"]["stride_category"])
    assert "Agent Frameworks" in str(schema["properties"]["maestro_layer"])


@pytest.mark.unit
def test_target_constraint_still_applies_under_maestro(agent):
    threat_model, _ = agent.state.create_constrained_threat_model(
        frozenset({"API"}), frozenset(), "maestro"
    )
    with pytest.raises(ValidationError):
        threat_model(
            name="t",
            maestro_layer="Foundation Models",
            description="d",
            target="NotAnAsset",
            impact="i",
            likelihood="Low",
            mitigations=["m1", "m2"],
            source="Insider",
            prerequisites=["p"],
            vector="v",
        )


@pytest.mark.unit
def test_gap_findings_classify_along_the_active_axis(agent):
    gap_model = agent.state.create_constrained_gap_model("maestro")
    result = gap_model(
        stop=False,
        rating=5,
        gaps=[
            {
                "target": "API",
                "maestro_layer": "Foundation Models",
                "severity": "MAJOR",
                "description": "x",
            }
        ],
    )
    assert result.gaps[0].maestro_layer == "Foundation Models"


# ============================================================================
# Coverage gate
# ============================================================================


@pytest.mark.unit
def test_stride_gate_passes_on_full_coverage(agent, make_threat):
    catalog = SimpleThreatList([make_threat(stride_category=c) for c in ALL_STRIDE])
    assert agent.workflow_threats._coverage_feedback({}, catalog) is None


@pytest.mark.unit
def test_stride_gate_reports_missing_categories(agent, make_threat):
    catalog = SimpleThreatList([make_threat(stride_category="Spoofing")])
    feedback = agent.workflow_threats._coverage_feedback({}, catalog)
    assert "Missing STRIDE categories" in feedback
    assert "Tampering" in feedback


@pytest.mark.unit
def test_absent_methodology_falls_back_to_stride(agent, make_threat):
    catalog = SimpleThreatList([make_threat(stride_category=c) for c in ALL_STRIDE])
    assert agent.workflow_threats._coverage_feedback({}, catalog) is None


@pytest.mark.unit
def test_maestro_gate_requires_only_always_applicable_layers_without_detection(
    agent, make_threat
):
    """Until layer detection exists, the gate must not demand absent layers."""
    state = {"methodology": "maestro"}
    catalog = SimpleThreatList(
        [
            make_threat(maestro_layer="Security and Compliance"),
            make_threat(maestro_layer="Cross-Layer"),
        ]
    )
    assert agent.workflow_threats._coverage_feedback(state, catalog) is None


@pytest.mark.unit
def test_maestro_gate_reports_uncovered_detected_layers(agent, make_threat):
    state = {
        "methodology": "maestro",
        "applicable_maestro_layers": {"Foundation Models", "Agent Ecosystem"},
    }
    catalog = SimpleThreatList(
        [
            make_threat(maestro_layer="Security and Compliance"),
            make_threat(maestro_layer="Cross-Layer"),
        ]
    )
    feedback = agent.workflow_threats._coverage_feedback(state, catalog)
    assert "Foundation Models" in feedback
    assert "Agent Ecosystem" in feedback


@pytest.mark.unit
def test_maestro_gate_passes_once_detected_layers_are_covered(agent, make_threat):
    state = {
        "methodology": "maestro",
        "applicable_maestro_layers": {"Foundation Models"},
    }
    catalog = SimpleThreatList(
        [
            make_threat(maestro_layer="Security and Compliance"),
            make_threat(maestro_layer="Cross-Layer"),
            make_threat(maestro_layer="Foundation Models"),
        ]
    )
    assert agent.workflow_threats._coverage_feedback(state, catalog) is None


@pytest.mark.unit
def test_gate_never_demands_a_layer_the_architecture_lacks(agent, make_threat):
    """The whole point of the policy: no inventing Layer 2 threats for a system
    with no data pipeline."""
    state = {
        "methodology": "maestro",
        "applicable_maestro_layers": {"Foundation Models"},
    }
    catalog = SimpleThreatList([make_threat(maestro_layer="Agent Frameworks")])
    feedback = agent.workflow_threats._coverage_feedback(state, catalog)
    assert "Data Operations" not in feedback
    assert "Agent Ecosystem" not in feedback
    assert "Foundation Models" in feedback


# ============================================================================
# Classification axis and KPIs
# ============================================================================


@pytest.mark.unit
@pytest.mark.parametrize(
    "methodology,field,label",
    [
        ("stride", "stride_category", "STRIDE Category"),
        ("maestro", "maestro_layer", "MAESTRO Layer"),
        (None, "stride_category", "STRIDE Category"),
        ("unrecognised", "stride_category", "STRIDE Category"),
    ],
)
def test_classification_axis_resolves_with_a_safe_default(
    agent, methodology, field, label
):
    axis = agent.tools.classification_axis(methodology)
    assert axis.field == field
    assert axis.label == label


@pytest.mark.unit
def test_empty_catalog_reports_every_category_of_the_active_axis(agent):
    stride = agent.tools._calculate_threat_kpis(None, methodology="stride")
    maestro = agent.tools._calculate_threat_kpis(None, methodology="maestro")
    assert len(stride["threats_by_category"]) == 6
    assert len(maestro["threats_by_category"]) == 8
    assert maestro["classification_label"] == "MAESTRO Layer"


@pytest.mark.unit
def test_kpis_count_maestro_layers(agent, make_threat):
    catalog = SimpleThreatList(
        [
            make_threat(maestro_layer="Agent Frameworks"),
            make_threat(maestro_layer="Agent Frameworks"),
            make_threat(maestro_layer="Cross-Layer"),
        ]
    )
    kpis = agent.tools._calculate_threat_kpis(catalog, methodology="maestro")
    counts = kpis["threats_by_category"]
    assert counts["Agent Frameworks"]["count"] == 2
    assert counts["Agent Frameworks"]["percentage"] == 66.7
    assert counts["Foundation Models"]["count"] == 0


@pytest.mark.unit
def test_kpis_still_count_stride_categories(agent, make_threat):
    catalog = SimpleThreatList(
        [make_threat(stride_category="Spoofing"), make_threat(stride_category="Tampering")]
    )
    kpis = agent.tools._calculate_threat_kpis(catalog, methodology="stride")
    assert kpis["threats_by_category"]["Spoofing"]["count"] == 1
    assert kpis["classification_label"] == "STRIDE Category"


@pytest.mark.unit
@pytest.mark.parametrize(
    "methodology,expected",
    [("maestro", "**Threats by MAESTRO Layer**:"), ("stride", "**Threats by STRIDE Category**:")],
)
def test_prompt_formatting_labels_the_active_axis(
    agent, make_threat, methodology, expected
):
    field = "maestro_layer" if methodology == "maestro" else "stride_category"
    value = "Agent Frameworks" if methodology == "maestro" else "Spoofing"
    catalog = SimpleThreatList([make_threat(**{field: value})])
    kpis = agent.tools._calculate_threat_kpis(catalog, methodology=methodology)
    assert expected in agent.tools._format_kpis_for_prompt(kpis)


# ============================================================================
# MAESTRO layer detection
# ============================================================================


@pytest.mark.unit
def test_only_architecture_dependent_layers_are_detectable(agent):
    """The vertical layer and cross-layer class are never the model's decision."""
    detectable = agent.constants.MAESTRO_DETECTABLE_LAYERS
    assert "Security and Compliance" not in detectable
    assert "Cross-Layer" not in detectable
    assert len(detectable) == 6
    assert detectable[0] == "Foundation Models"


@pytest.mark.unit
def test_detection_model_rejects_the_always_applicable_layers(agent):
    with pytest.raises(ValidationError):
        agent.state.MaestroLayerDetection(
            applicable_layers=["Security and Compliance"], rationale="r"
        )


@pytest.mark.unit
def test_detection_model_accepts_a_partial_layer_set(agent):
    detection = agent.state.MaestroLayerDetection(
        applicable_layers=["Foundation Models", "Agent Frameworks"], rationale="r"
    )
    assert detection.applicable_layers == ["Foundation Models", "Agent Frameworks"]


@pytest.mark.unit
def test_detection_returns_the_layers_the_model_reports(agent, monkeypatch):
    detection = agent.state.MaestroLayerDetection(
        applicable_layers=["Foundation Models", "Data Operations"], rationale="r"
    )
    monkeypatch.setattr(
        agent.workflow_threats.model_service,
        "invoke_structured_model",
        lambda *a, **k: {"structured_response": detection},
    )
    result = agent.workflow_threats._detect_maestro_layers(
        {"description": "d"}, {"configurable": {}}
    )
    assert result == ["Foundation Models", "Data Operations"]


@pytest.mark.unit
def test_detection_failure_degrades_instead_of_raising(agent, monkeypatch):
    """A failed scoping call must not block the run."""

    def boom(*args, **kwargs):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(
        agent.workflow_threats.model_service, "invoke_structured_model", boom
    )
    assert (
        agent.workflow_threats._detect_maestro_layers(
            {"description": "d"}, {"configurable": {}}
        )
        is None
    )


@pytest.mark.unit
def test_failed_detection_leaves_the_gate_on_its_conservative_fallback(
    agent, make_threat, monkeypatch
):
    monkeypatch.setattr(
        agent.workflow_threats.model_service,
        "invoke_structured_model",
        MagicMock(side_effect=RuntimeError("down")),
    )
    detected = agent.workflow_threats._detect_maestro_layers(
        {"description": "d"}, {"configurable": {}}
    )
    state = {"methodology": "maestro", "applicable_maestro_layers": detected}
    catalog = SimpleThreatList(
        [
            make_threat(maestro_layer="Security and Compliance"),
            make_threat(maestro_layer="Cross-Layer"),
        ]
    )
    assert agent.workflow_threats._coverage_feedback(state, catalog) is None


@pytest.mark.unit
def test_detected_layers_become_gate_requirements(agent, make_threat, monkeypatch):
    """End to end: what detection reports is what the gate demands."""
    detection = agent.state.MaestroLayerDetection(
        applicable_layers=["Agent Ecosystem"], rationale="r"
    )
    monkeypatch.setattr(
        agent.workflow_threats.model_service,
        "invoke_structured_model",
        lambda *a, **k: {"structured_response": detection},
    )
    detected = agent.workflow_threats._detect_maestro_layers(
        {"description": "d"}, {"configurable": {}}
    )
    state = {"methodology": "maestro", "applicable_maestro_layers": detected}

    uncovered = SimpleThreatList(
        [
            make_threat(maestro_layer="Security and Compliance"),
            make_threat(maestro_layer="Cross-Layer"),
        ]
    )
    feedback = agent.workflow_threats._coverage_feedback(state, uncovered)
    assert "Agent Ecosystem" in feedback
    # and a layer the architecture does not have is never demanded
    assert "Data Operations" not in feedback

    covered = SimpleThreatList(
        uncovered.threats + [make_threat(maestro_layer="Agent Ecosystem")]
    )
    assert agent.workflow_threats._coverage_feedback(state, covered) is None


@pytest.mark.unit
def test_detection_prompt_names_every_detectable_layer(agent):
    from prompts import maestro_layer_detection_prompt

    prompt = maestro_layer_detection_prompt()
    for layer in agent.constants.MAESTRO_DETECTABLE_LAYERS:
        assert layer in prompt


@pytest.mark.unit
def test_threat_classification_reads_either_axis(agent, make_threat):
    assert (
        agent.tools.threat_classification(make_threat(maestro_layer="Data Operations"))
        == "Data Operations"
    )
    assert (
        agent.tools.threat_classification(make_threat(stride_category="Repudiation"))
        == "Repudiation"
    )
