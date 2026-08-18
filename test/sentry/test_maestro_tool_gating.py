"""Tests for withholding STRIDE-only threat-catalog tools from a MAESTRO context.

Sentry's Threat model (data_model.py) requires a STRIDE stride_category on
every threat and has no MAESTRO equivalent. add_threats/edit_threats would
silently write STRIDE-mislabeled threats into a MAESTRO catalog, so
utils.filter_tools_for_methodology withholds them whenever the active
context says methodology is "maestro".
"""

from types import SimpleNamespace


def _tool(name):
    return SimpleNamespace(name=name)


ALL_TOOLS = [
    _tool("add_threats"),
    _tool("edit_threats"),
    _tool("delete_threats"),
    _tool("get_attack_tree"),
]


class TestFilterToolsForMethodology:
    def test_stride_context_keeps_all_tools(self, sentry):
        result = sentry.utils.filter_tools_for_methodology(
            ALL_TOOLS, {"methodology": "stride"}, MagicMockLogger()
        )
        assert [t.name for t in result] == [t.name for t in ALL_TOOLS]

    def test_missing_methodology_keeps_all_tools(self, sentry):
        result = sentry.utils.filter_tools_for_methodology(
            ALL_TOOLS, {}, MagicMockLogger()
        )
        assert [t.name for t in result] == [t.name for t in ALL_TOOLS]

    def test_none_context_keeps_all_tools(self, sentry):
        result = sentry.utils.filter_tools_for_methodology(
            ALL_TOOLS, None, MagicMockLogger()
        )
        assert [t.name for t in result] == [t.name for t in ALL_TOOLS]

    def test_maestro_context_withholds_add_and_edit(self, sentry):
        result = sentry.utils.filter_tools_for_methodology(
            ALL_TOOLS, {"methodology": "maestro"}, MagicMockLogger()
        )
        names = {t.name for t in result}
        assert names == {"delete_threats", "get_attack_tree"}

    def test_maestro_context_does_not_mutate_input_list(self, sentry):
        original_len = len(ALL_TOOLS)
        sentry.utils.filter_tools_for_methodology(
            ALL_TOOLS, {"methodology": "maestro"}, MagicMockLogger()
        )
        assert len(ALL_TOOLS) == original_len


class TestMaestroToolNote:
    def test_stride_context_has_no_notice(self, sentry):
        note = sentry.prompt._maestro_tool_note({"methodology": "stride"})
        assert note == ""

    def test_missing_context_has_no_notice(self, sentry):
        assert sentry.prompt._maestro_tool_note(None) == ""
        assert sentry.prompt._maestro_tool_note({}) == ""

    def test_maestro_context_explains_the_limitation(self, sentry):
        note = sentry.prompt._maestro_tool_note({"methodology": "maestro"})
        assert "maestro_catalog_notice" in note
        assert "delete_threats remains available" in note


class MagicMockLogger:
    """Minimal logger stand-in — filter_tools_for_methodology only calls .debug()."""

    def debug(self, *args, **kwargs):
        pass
