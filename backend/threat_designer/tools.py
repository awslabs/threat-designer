from langchain.tools import tool, ToolRuntime
from langchain_core.messages import ToolMessage
from langchain_core.messages import SystemMessage
from state import (
    ThreatsList,
    ContinueThreatModeling,
    DataFlowsList,
    TrustBoundariesList,
    ThreatSourcesList,
    FlowsList,
)
from langgraph.types import Command, Overwrite
from typing import List, Annotated, Dict, Any
from message_builder import MessageBuilder, list_to_string
from model_service import ModelService
from prompt_provider import gap_prompt
from constants import MAX_GAP_ANALYSIS_USES, MAX_ADD_THREATS_USES, JobState
from monitoring import logger
from config import config as app_config
from state_tracking_service import StateService
from pydantic import BaseModel
import json
import time
from collections import Counter

# Initialize state service for status updates
state_service = StateService(app_config.agent_state_table)


# ============================================================================
# KPI Calculation Helper Functions
# ============================================================================


def _calculate_threat_kpis(
    threat_list: ThreatsList, assets=None, system_architecture=None
) -> Dict[str, Any]:
    """
    Calculate Key Performance Indicators (KPIs) from the threat catalog.

    Args:
        threat_list: ThreatsList object containing all current threats
        assets: Optional assets object to identify uncovered assets
        system_architecture: Optional system architecture to identify uncovered threat sources

    Returns:
        Dictionary containing:
        - total_threats: Total number of threats
        - threats_by_likelihood: Count of threats by likelihood level
        - threats_by_stride: Count and percentage by STRIDE category
        - threats_by_source: Count by threat source category
        - threats_by_asset: Count and criticality by target asset
        - uncovered_sources: List of threat sources without any threats
        - uncovered_assets: List of uncovered asset dicts with name and criticality, sorted by criticality descending

    Example:
        >>> kpis = _calculate_threat_kpis(threat_list, assets, system_architecture)
        >>> print(kpis['total_threats'])
        45
    """
    # Handle empty catalog
    if not threat_list or not threat_list.threats:
        return {
            "total_threats": 0,
            "threats_by_likelihood": {"Low": 0, "Medium": 0, "High": 0},
            "threats_by_stride": {
                "Spoofing": {"count": 0, "percentage": 0.0},
                "Tampering": {"count": 0, "percentage": 0.0},
                "Repudiation": {"count": 0, "percentage": 0.0},
                "Information Disclosure": {"count": 0, "percentage": 0.0},
                "Denial of Service": {"count": 0, "percentage": 0.0},
                "Elevation of Privilege": {"count": 0, "percentage": 0.0},
            },
            "threats_by_source": {},
            "threats_by_asset": {},
            "uncovered_sources": [],
            "uncovered_assets": [],
        }

    threats = threat_list.threats
    total_threats = len(threats)

    # Count threats by likelihood
    likelihood_counter = Counter()
    for threat in threats:
        if hasattr(threat, "likelihood") and threat.likelihood:
            likelihood_counter[threat.likelihood] += 1
        else:
            logger.warning(
                "Threat missing likelihood attribute",
                threat_name=getattr(threat, "name", "unknown"),
            )

    threats_by_likelihood = {
        "Low": likelihood_counter.get("Low", 0),
        "Medium": likelihood_counter.get("Medium", 0),
        "High": likelihood_counter.get("High", 0),
    }

    # Count threats by STRIDE category
    stride_counter = Counter()
    for threat in threats:
        if hasattr(threat, "stride_category") and threat.stride_category:
            stride_counter[threat.stride_category] += 1
        else:
            logger.warning(
                "Threat missing stride_category attribute",
                threat_name=getattr(threat, "name", "unknown"),
            )

    # Calculate percentages for STRIDE (avoid division by zero)
    threats_by_stride = {}
    stride_categories = [
        "Spoofing",
        "Tampering",
        "Repudiation",
        "Information Disclosure",
        "Denial of Service",
        "Elevation of Privilege",
    ]

    for category in stride_categories:
        count = stride_counter.get(category, 0)
        percentage = (
            round((count / total_threats * 100), 1) if total_threats > 0 else 0.0
        )
        threats_by_stride[category] = {
            "count": count,
            "percentage": percentage,
        }

    # Count threats by source
    source_counter = Counter()
    for threat in threats:
        if hasattr(threat, "source") and threat.source:
            source_counter[threat.source] += 1
        else:
            logger.warning(
                "Threat missing source attribute",
                threat_name=getattr(threat, "name", "unknown"),
            )

    # Sort by count descending
    threats_by_source = dict(
        sorted(source_counter.items(), key=lambda x: x[1], reverse=True)
    )

    # Build asset name -> criticality lookup from assets parameter
    asset_criticality_map = {}
    if assets and assets.assets:
        for asset in assets.assets:
            asset_criticality_map[asset.name] = getattr(asset, "criticality", "Medium")

    # Count threats by asset (target), include criticality
    asset_counter = Counter()
    for threat in threats:
        if hasattr(threat, "target") and threat.target:
            asset_counter[threat.target] += 1
        else:
            logger.warning(
                "Threat missing target attribute",
                threat_name=getattr(threat, "name", "unknown"),
            )

    # Sort by count descending, include criticality level
    threats_by_asset = {
        asset_name: {
            "count": count,
            "criticality": asset_criticality_map.get(asset_name, "Medium"),
        }
        for asset_name, count in sorted(
            asset_counter.items(), key=lambda x: x[1], reverse=True
        )
    }

    # Identify uncovered threat sources
    uncovered_sources = []
    if system_architecture and system_architecture.threat_sources:
        all_sources = {source.category for source in system_architecture.threat_sources}
        covered_sources = set(source_counter.keys())
        uncovered_sources = sorted(list(all_sources - covered_sources))

    # Criticality sort order: High > Medium > Low
    criticality_sort_order = {"High": 0, "Medium": 1, "Low": 2}

    # Identify uncovered assets (filter only Asset type, exclude Entity type)
    uncovered_assets = []
    if assets and assets.assets:
        all_assets = {asset.name for asset in assets.assets if asset.type == "Asset"}
        covered_assets = set(asset_counter.keys())
        uncovered_asset_names = all_assets - covered_assets
        uncovered_assets = sorted(
            [
                {
                    "name": name,
                    "criticality": asset_criticality_map.get(name, "Medium"),
                }
                for name in uncovered_asset_names
            ],
            key=lambda a: criticality_sort_order.get(a["criticality"], 1),
        )

    return {
        "total_threats": total_threats,
        "threats_by_likelihood": threats_by_likelihood,
        "threats_by_stride": threats_by_stride,
        "threats_by_source": threats_by_source,
        "threats_by_asset": threats_by_asset,
        "uncovered_sources": uncovered_sources,
        "uncovered_assets": uncovered_assets,
    }


def _format_kpis_for_prompt(kpis: Dict[str, Any]) -> str:
    """
    Convert KPI dictionary into human-readable formatted string for LLM prompt.

    Args:
        kpis: Dictionary containing KPI metrics from _calculate_threat_kpis()

    Returns:
        Formatted string with KPI sections ready for inclusion in prompt

    Example:
        >>> kpis = _calculate_threat_kpis(threat_list)
        >>> formatted = _format_kpis_for_prompt(kpis)
        >>> print(formatted)
        <threat_catalog_kpis>
        **Total Threats**: 45
        ...
        </threat_catalog_kpis>
    """
    # Handle empty catalog
    if kpis["total_threats"] == 0:
        return """<threat_catalog_kpis>
**Total Threats**: 0

No threats in catalog yet.
</threat_catalog_kpis>"""

    # Build formatted output
    output = ["<threat_catalog_kpis>"]
    output.append(f"**Total Threats**: {kpis['total_threats']}")
    output.append("")

    # Threats by Likelihood
    output.append("**Threats by Likelihood**:")
    likelihood_order = ["High", "Medium", "Low"]
    total = kpis["total_threats"]
    for level in likelihood_order:
        count = kpis["threats_by_likelihood"][level]
        percentage = round((count / total * 100), 1) if total > 0 else 0.0
        output.append(f"- {level}: {count} ({percentage}%)")
    output.append("")

    # Threats by STRIDE Category
    output.append("**Threats by STRIDE Category**:")
    for category, data in kpis["threats_by_stride"].items():
        count = data["count"]
        percentage = data["percentage"]
        output.append(f"- {category}: {count} ({percentage}%)")
    output.append("")

    # Threats by Source
    if kpis["threats_by_source"]:
        output.append("**Threats by Source**:")
        for source, count in kpis["threats_by_source"].items():
            output.append(f"- {source}: {count}")
        output.append("")

    # Threats by Asset (with criticality)
    if kpis.get("threats_by_asset"):
        output.append("**Threats by Asset**:")
        for asset_name, data in kpis["threats_by_asset"].items():
            count = data["count"]
            criticality = data["criticality"]
            output.append(f"- {asset_name} [Criticality: {criticality}]: {count}")
        output.append("")

    # Uncovered Threat Sources
    if kpis.get("uncovered_sources"):
        output.append("**⚠️ Threat Sources Without Coverage**:")
        for source in kpis["uncovered_sources"]:
            output.append(f"- {source}")
        output.append("")

    # Uncovered Assets (with criticality)
    if kpis.get("uncovered_assets"):
        output.append("**⚠️ Assets Without Threat Coverage**:")
        for asset in kpis["uncovered_assets"]:
            name = asset["name"]
            criticality = asset["criticality"]
            output.append(f"- {name} [Criticality: {criticality}]")
        output.append("")

    output.append("</threat_catalog_kpis>")

    return "\n".join(output)


def _unwrap_value(value, default=None):
    """Unwrap Overwrite objects to get the actual value."""
    if isinstance(value, Overwrite):
        return value.value
    return value if value is not None else default


@tool(
    name_or_callable="add_threats",
    description=""" Used to add new threats to the existing catalog""",
)
def add_threats(threats: ThreatsList, runtime: ToolRuntime):
    tool_use = _unwrap_value(runtime.state.get("tool_use", 0), 0)
    gap_tool_use = _unwrap_value(runtime.state.get("gap_tool_use", 0), 0)
    job_id = runtime.state.get("job_id", "unknown")

    # Check limit
    if tool_use >= MAX_ADD_THREATS_USES:
        # Check if gap_analysis is still available
        if gap_tool_use < MAX_GAP_ANALYSIS_USES:
            error_msg = "You must call gap_analysis to verify the current threat model first. Afterwards you can use the tool again to add other threats if needed."
        else:
            error_msg = (
                "You have consumed all your tool calls. "
                "You can only delete threats or proceed to finish."
            )
        logger.warning(
            "Tool usage limit exceeded - gap_analysis required",
            tool="add_threats",
            current_usage=tool_use,
            max_usage=MAX_ADD_THREATS_USES,
            gap_tool_use=gap_tool_use,
            job_id=job_id,
        )
        return error_msg

    # Get valid assets and threat sources from state
    assets = runtime.state.get("assets")
    system_architecture = runtime.state.get("system_architecture")

    # Build sets of valid asset names and threat source categories
    valid_asset_names = set()
    if assets and assets.assets:
        valid_asset_names = {asset.name for asset in assets.assets}

    valid_threat_sources = set()
    if system_architecture and system_architecture.threat_sources:
        valid_threat_sources = {
            source.category for source in system_architecture.threat_sources
        }

    # Validate threats and separate valid from invalid
    valid_threats = []
    invalid_threats = []

    for threat in threats.threats:
        violations = []

        # Check if target is a valid asset
        if threat.target not in valid_asset_names:
            violations.append(f"Invalid target '{threat.target}' - not in asset list")

        # Check if source is a valid threat source
        if threat.source not in valid_threat_sources:
            violations.append(
                f"Invalid source '{threat.source}' - not in threat sources"
            )

        if violations:
            invalid_threats.append({"name": threat.name, "violations": violations})
            logger.warning(
                "Threat validation failed",
                tool="add_threats",
                threat_name=threat.name,
                violations=violations,
                job_id=job_id,
            )
        else:
            # Ensure starred=False (only users can star threats)
            threat.starred = False
            valid_threats.append(threat)

    # Create ThreatsList with only valid threats
    valid_threats_list = ThreatsList(threats=valid_threats)

    # Update status
    valid_count = len(valid_threats)
    invalid_count = len(invalid_threats)

    if valid_count > 0:
        state_service.update_job_state(
            job_id,
            JobState.THREAT.value,
            detail=f"{valid_count} threats added to catalog",
        )

    # Build response message
    if invalid_count == 0:
        tool_use_delta = 1  # Increment by 1
        new_tool_use = tool_use + tool_use_delta
        response_msg = f"Successfully added: {valid_count} threats."
        logger.debug(
            "Tool invoked successfully - all threats valid",
            tool="add_threats",
            usage_count=new_tool_use,
            max_usage=MAX_ADD_THREATS_USES,
            threats_added=valid_count,
            remaining_invocations=MAX_ADD_THREATS_USES - new_tool_use,
            job_id=job_id,
        )
    else:
        # Format invalid threats for response
        tool_use_delta = 0  # No increment if all threats invalid
        new_tool_use = tool_use
        invalid_details = []
        for invalid in invalid_threats:
            violations_str = "; ".join(invalid["violations"])
            invalid_details.append(f"  - {invalid['name']}: {violations_str}")

        invalid_summary = "\n".join(invalid_details)

        response_msg = f"""Successfully added: {valid_count} threats. \n

{invalid_count} threats were NOT added due to validation failures: \n
{invalid_summary} \n

Please ensure:
- Threat 'target' matches an asset name from the asset list: {valid_asset_names} \n
- Threat 'source' matches a threat source category from the data flow threat sources" {valid_threat_sources}"""

        logger.warning(
            "Tool invoked with validation failures",
            tool="add_threats",
            usage_count=new_tool_use,
            max_usage=MAX_ADD_THREATS_USES,
            threats_added=valid_count,
            threats_rejected=invalid_count,
            remaining_invocations=MAX_ADD_THREATS_USES - new_tool_use,
            job_id=job_id,
        )

    time.sleep(5)

    return Command(
        update={
            "threat_list": valid_threats_list,
            "tool_use": tool_use_delta,  # Send delta, not absolute value
            "messages": [
                ToolMessage(
                    response_msg,
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


def create_dynamic_add_threats_tool(threats_list_model: type[BaseModel]):
    """Create an add_threats tool bound to a dynamic ThreatsList model.

    The returned tool has the same name, description, and handler logic as the
    static ``add_threats`` tool but its input schema uses the dynamic model so
    that the JSON schema presented to the LLM includes ``enum`` constraints for
    the ``target`` and ``source`` fields.

    Args:
        threats_list_model: Dynamic ThreatsList with Literal-constrained fields.

    Returns:
        A langchain tool instance with the constrained schema.
    """

    @tool(
        name_or_callable="add_threats",
        description=""" Used to add new threats to the existing catalog""",
    )
    def dynamic_add_threats(threats: threats_list_model, runtime: ToolRuntime):
        tool_use = _unwrap_value(runtime.state.get("tool_use", 0), 0)
        gap_tool_use = _unwrap_value(runtime.state.get("gap_tool_use", 0), 0)
        job_id = runtime.state.get("job_id", "unknown")

        # Check limit
        if tool_use >= MAX_ADD_THREATS_USES:
            if gap_tool_use < MAX_GAP_ANALYSIS_USES:
                error_msg = "You must call gap_analysis to verify the current threat model first. Afterwards you can use the tool again to add other threats if needed."
            else:
                error_msg = (
                    "You have consumed all your tool calls. "
                    "You can only delete threats or proceed to finish."
                )
            logger.warning(
                "Tool usage limit exceeded - gap_analysis required",
                tool="add_threats",
                current_usage=tool_use,
                max_usage=MAX_ADD_THREATS_USES,
                gap_tool_use=gap_tool_use,
                job_id=job_id,
            )
            return error_msg

        # Get valid assets and threat sources from state
        assets = runtime.state.get("assets")
        system_architecture = runtime.state.get("system_architecture")

        valid_asset_names = set()
        if assets and assets.assets:
            valid_asset_names = {asset.name for asset in assets.assets}

        valid_threat_sources = set()
        if system_architecture and system_architecture.threat_sources:
            valid_threat_sources = {
                source.category for source in system_architecture.threat_sources
            }

        # Validate threats and separate valid from invalid
        valid_threats = []
        invalid_threats = []

        for threat in threats.threats:
            violations = []

            if threat.target not in valid_asset_names:
                violations.append(
                    f"Invalid target '{threat.target}' - not in asset list"
                )

            if threat.source not in valid_threat_sources:
                violations.append(
                    f"Invalid source '{threat.source}' - not in threat sources"
                )

            if violations:
                invalid_threats.append({"name": threat.name, "violations": violations})
                logger.warning(
                    "Threat validation failed for dynamic tools",
                    tool="add_threats",
                    threat_name=threat.name,
                    violations=violations,
                    job_id=job_id,
                )
            else:
                threat.starred = False
                valid_threats.append(threat)

        valid_threats_list = ThreatsList(threats=valid_threats)

        valid_count = len(valid_threats)
        invalid_count = len(invalid_threats)

        if valid_count > 0:
            state_service.update_job_state(
                job_id,
                JobState.THREAT.value,
                detail=f"{valid_count} threats added to catalog",
            )

        if invalid_count == 0:
            tool_use_delta = 1
            new_tool_use = tool_use + tool_use_delta
            response_msg = f"Successfully added: {valid_count} threats."
            logger.debug(
                "Tool invoked successfully - all threats valid",
                tool="add_threats",
                usage_count=new_tool_use,
                max_usage=MAX_ADD_THREATS_USES,
                threats_added=valid_count,
                remaining_invocations=MAX_ADD_THREATS_USES - new_tool_use,
                job_id=job_id,
            )
        else:
            tool_use_delta = 0
            new_tool_use = tool_use
            invalid_details = []
            for invalid in invalid_threats:
                violations_str = "; ".join(invalid["violations"])
                invalid_details.append(f"  - {invalid['name']}: {violations_str}")

            invalid_summary = "\n".join(invalid_details)

            response_msg = f"""Successfully added: {valid_count} threats. \n

{invalid_count} threats were NOT added due to validation failures: \n
{invalid_summary} \n

Please ensure:
- Threat 'target' matches an asset name from the asset list: {valid_asset_names} \n
- Threat 'source' matches a threat source category from the data flow threat sources" {valid_threat_sources}"""

            logger.warning(
                "Tool invoked with validation failures",
                tool="add_threats",
                usage_count=new_tool_use,
                max_usage=MAX_ADD_THREATS_USES,
                threats_added=valid_count,
                threats_rejected=invalid_count,
                remaining_invocations=MAX_ADD_THREATS_USES - new_tool_use,
                job_id=job_id,
            )

        time.sleep(5)

        return Command(
            update={
                "threat_list": valid_threats_list,
                "tool_use": tool_use_delta,
                "messages": [
                    ToolMessage(
                        response_msg,
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )

    return dynamic_add_threats


@tool(
    name_or_callable="delete_threats",
    description="Used to delete threats from the existing catalog",
)
def remove_threat(
    threats: Annotated[List[str], "List of threat names to remove from the catalog"],
    runtime: ToolRuntime,
) -> Command:
    """Remove multiple threats from the threat list by name."""

    # Get current state
    current_threat_list = runtime.state.get("threat_list")
    job_id = runtime.state.get("job_id", "unknown")

    # Update status
    threat_count = len(threats)
    state_service.update_job_state(
        job_id,
        JobState.THREAT.value,
        detail=f"{threat_count} threats deleted from catalog",
    )

    # Apply remove method for each threat name
    updated_threat_list = current_threat_list
    for threat_name in threats:
        updated_threat_list = updated_threat_list.remove(threat_name)

    time.sleep(5)

    return Command(
        update={
            "threat_list": Overwrite(updated_threat_list),
            "messages": [
                ToolMessage(
                    "Successfully removed threats", tool_call_id=runtime.tool_call_id
                )
            ],
        },
    )


@tool(
    name_or_callable="read_threat_catalog",
    description="Read and retrieve the current list of threats from the catalog",
)
def read_threat_catalog(
    runtime: ToolRuntime,
    verbose: Annotated[
        bool, "Whether to include detailed threat information in the output"
    ] = False,
) -> str:
    """Read and return the current threat catalog."""

    # Get current state
    current_threat_list = runtime.state.get("threat_list")
    job_id = runtime.state.get("job_id", "unknown")

    # Update status
    state_service.update_job_state(
        job_id, JobState.THREAT.value, detail="Reviewing catalog"
    )

    time.sleep(5)

    # Check if there are any threats
    if not current_threat_list or not current_threat_list.threats:
        return "No threats found in the catalog."

    # Format the output
    output = f"Total threats: {len(current_threat_list.threats)}\n\n"

    if verbose:
        output += json.dumps(
            [
                threat.model_dump(exclude={"notes"})
                for threat in current_threat_list.threats
            ],
            indent=2,
        )
    else:
        for i, threat in enumerate(current_threat_list.threats, 1):
            output += f"{i}. {threat.name}\n"
            output += f"   Likelihood: {threat.likelihood}\n"
            output += f"   Stride category: {threat.stride_category}\n"
            output += "\n"

    return output


@tool(
    name_or_callable="catalog_stats",
    description="Get statistics about the current threat catalog: total count, distribution by severity/likelihood, STRIDE category breakdown, and per-asset/entity threat counts. Use this to check coverage before finishing or to decide where more threats are needed. Do not invoke this tool in parallel with other tools otherwise you may not receive accurate stats.",
)
def catalog_stats(
    runtime: ToolRuntime,
    asset_name: Annotated[
        str,
        "Optional asset/entity name to get STRIDE breakdown for a specific target. Leave empty for overall stats.",
    ] = "",
) -> str:
    """Return threat catalog statistics and distribution metrics."""

    state = runtime.state
    threat_list = state.get("threat_list")

    if not threat_list or not threat_list.threats:
        return "No threats in the catalog yet."

    threats = threat_list.threats

    # If a specific asset is requested, return per-asset STRIDE breakdown
    if asset_name:
        asset_threats = [t for t in threats if t.target == asset_name]
        if not asset_threats:
            return f"No threats found targeting '{asset_name}'."

        stride_counter = Counter()
        likelihood_counter = Counter()
        for t in asset_threats:
            if t.stride_category:
                stride_counter[t.stride_category] += 1
            if t.likelihood:
                likelihood_counter[t.likelihood] += 1

        output = f"Stats for '{asset_name}' ({len(asset_threats)} threats):\n\n"
        output += "By STRIDE:\n"
        for cat in [
            "Spoofing",
            "Tampering",
            "Repudiation",
            "Information Disclosure",
            "Denial of Service",
            "Elevation of Privilege",
        ]:
            count = stride_counter.get(cat, 0)
            output += f"  - {cat}: {count}\n"
        output += "\nBy Likelihood:\n"
        for level in ["High", "Medium", "Low"]:
            output += f"  - {level}: {likelihood_counter.get(level, 0)}\n"
        return output

    # Overall stats — reuse existing KPI calculation
    kpis = _calculate_threat_kpis(
        threat_list, state.get("assets"), state.get("system_architecture")
    )
    return _format_kpis_for_prompt(kpis)


@tool(
    name_or_callable="gap_analysis",
    description="Analyze the current threat catalog for gaps and completeness. Returns identified gaps or confirmation of completeness.",
)
def gap_analysis(runtime: ToolRuntime) -> str:
    """Perform gap analysis on the current threat catalog."""

    # Get current gap_tool_use counter (unwrap Overwrite if present)
    gap_tool_use = _unwrap_value(runtime.state.get("gap_tool_use", 0), 0)
    tool_use = _unwrap_value(runtime.state.get("tool_use", 0), 0)
    job_id = runtime.state.get("job_id", "unknown")

    # Check if threat catalog has at least 25 threats
    threat_list = runtime.state.get("threat_list")
    threat_count = (
        len(threat_list.threats) if threat_list and threat_list.threats else 0
    )

    if threat_count < 30:
        error_msg = (
            f"Gap analysis requires at least 30 threats in the catalog. "
            f"Current count: {threat_count}. Please add more threats before performing gap analysis."
        )
        logger.warning(
            "Gap analysis rejected - insufficient threats",
            tool="gap_analysis",
            current_threat_count=threat_count,
            required_threat_count=30,
            job_id=job_id,
        )
        # Reset tool_use counter so agent can continue adding threats
        return Command(
            update={
                "tool_use": Overwrite(0),
                "messages": [
                    ToolMessage(
                        error_msg,
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )

    # Check limit
    if gap_tool_use >= MAX_GAP_ANALYSIS_USES:
        remaining_add_threats = MAX_ADD_THREATS_USES - tool_use
        error_msg = (
            "You have consumed all your tool calls. "
            "You can only delete threats or proceed to finish."
        )
        logger.warning(
            "Tool usage limit exceeded",
            tool="gap_analysis",
            current_usage=gap_tool_use,
            max_usage=MAX_GAP_ANALYSIS_USES,
            remaining_add_threats=remaining_add_threats,
            job_id=job_id,
        )
        return error_msg

    # Update status
    state_service.update_job_state(
        job_id, JobState.THREAT.value, detail="Reviewing for gaps"
    )

    # Get current state
    state = runtime.state

    # Prepare gap analysis messages using MessageBuilder
    msg_builder = MessageBuilder(
        state.get("image_data"),
        state.get("description", ""),
        list_to_string(state.get("assumptions", [])),
        state.get("image_type"),
    )

    # Convert threat_list to string for message
    threat_list = state.get("threat_list")
    threat_list_str = ""
    if threat_list and threat_list.threats:
        threat_list_str = json.dumps(
            [threat.model_dump(exclude={"notes"}) for threat in threat_list.threats],
            indent=2,
        )

    # Get previous gap analysis results
    gap = state.get("gap", [])
    gap_str = "\n".join(gap) if gap else ""

    # Get threat sources for validation
    threat_sources_str = None
    system_architecture = state.get("system_architecture")
    if system_architecture and system_architecture.threat_sources:
        source_categories = [
            source.category for source in system_architecture.threat_sources
        ]
        threat_sources_str = "\n".join(
            [f"  - {category}" for category in source_categories]
        )

    # Create gap analysis message (with threat sources, without KPIs — gap analysis focuses on semantic coverage)
    human_message = msg_builder.create_gap_analysis_message(
        json.dumps(
            [asset.model_dump() for asset in state.get("assets").assets], indent=2
        )
        if state.get("assets")
        else "",
        json.dumps(
            [flow.model_dump() for flow in state.get("system_architecture").data_flows],
            indent=2,
        )
        if state.get("system_architecture")
        else "",
        threat_list_str,
        gap_str,
        threat_sources_str,  # Pass threat sources to HumanMessage
    )

    # Create system prompt (without threat sources)
    app_type = state.get("application_type", "hybrid")
    if state.get("instructions"):
        system_prompt = SystemMessage(
            content=gap_prompt(state.get("instructions"), application_type=app_type)
        )
    else:
        system_prompt = SystemMessage(content=gap_prompt(application_type=app_type))

    messages = [system_prompt, human_message]

    # Invoke gap analysis model
    model_service = ModelService()
    config = runtime.config
    reasoning = config["configurable"].get("reasoning", False)

    try:
        logger.debug(
            "Invoking gap analysis model",
            tool="gap_analysis",
            usage_count=gap_tool_use + 1,
            max_usage=MAX_GAP_ANALYSIS_USES,
            job_id=job_id,
        )

        response = model_service.invoke_structured_model(
            messages, [ContinueThreatModeling], config, reasoning, "model_gaps"
        )

        # Extract gap result
        gap_result = response["structured_response"]

        # Increment gap_tool_use counter
        gap_tool_use_delta = 1
        new_gap_tool_use = gap_tool_use + gap_tool_use_delta

        # Prepare update dictionary
        update_dict = {
            "gap_tool_use": gap_tool_use_delta,  # Send delta, not absolute value
            "tool_use": Overwrite(0),
        }

        # Update gap in state
        if not gap_result.stop and gap_result.gap:
            update_dict["gap"] = [gap_result.gap]

        # Format result message
        if gap_result.stop:
            update_dict["messages"] = [
                ToolMessage(
                    "Gap Analysis: The threat catalog is comprehensive and complete. No actionable gaps identified. You may proceed to finish or continue refining.",
                    tool_call_id=runtime.tool_call_id,
                )
            ]
            logger.debug(
                "Gap analysis completed - catalog is comprehensive, counter reset",
                tool="gap_analysis",
                usage_count=new_gap_tool_use,
                tool_use_reset=True,
                rating=gap_result.rating,
                job_id=job_id,
            )
            return Command(update=update_dict)
        else:
            update_dict["messages"] = [
                ToolMessage(
                    f"""
                    You have {MAX_GAP_ANALYSIS_USES - new_gap_tool_use} more gap_analysis invocations left \n\n
                    Gap identified: {gap_result.gap}""",
                    tool_call_id=runtime.tool_call_id,
                )
            ]
            logger.debug(
                "Gap analysis completed - gaps identified, counter reset",
                tool="gap_analysis",
                usage_count=new_gap_tool_use,
                gaps_found=True,
                gaps=gap_result.gap,
                rating=gap_result.rating,
                tool_use_reset=True,
                job_id=job_id,
            )

            # Return Command with state updates and result message
            return Command(
                update=update_dict,
            )

    except Exception as e:
        # Log error with full context - counters not reset on failure
        logger.error(
            "Gap analysis model invocation failed - counters not reset",
            tool="gap_analysis",
            usage_count=gap_tool_use,
            error=str(e),
            job_id=job_id,
            exc_info=True,
        )
        # Return user-friendly message as string (not Command, so state is not updated)
        error_msg = f"Gap analysis failed due to a model error. Please try again or proceed without gap analysis. Error: {str(e)}"
        return error_msg


# ============================================================================
# Flow Tools — Agentic Define Flows Sub-Graph
# ============================================================================


@tool(
    name_or_callable="add_data_flows",
    description="Add data flows to the FlowsList. Each data flow must reference valid asset/entity names as source_entity and target_entity.",
)
def add_data_flows(data_flows: DataFlowsList, runtime: ToolRuntime) -> Command:
    """Add data flows with entity validation against known assets."""
    job_id = runtime.state.get("job_id", "unknown")
    assets = runtime.state.get("assets")

    # Build set of valid asset names
    valid_asset_names = set()
    if assets and assets.assets:
        valid_asset_names = {asset.name for asset in assets.assets}

    # Partition into valid/invalid
    valid_flows = []
    invalid_flows = []

    for flow in data_flows.data_flows:
        violations = []
        if flow.source_entity not in valid_asset_names:
            violations.append(
                f"Invalid source_entity '{flow.source_entity}' - not in asset list"
            )
        if flow.target_entity not in valid_asset_names:
            violations.append(
                f"Invalid target_entity '{flow.target_entity}' - not in asset list"
            )
        if violations:
            invalid_flows.append(
                {"description": flow.flow_description, "violations": violations}
            )
            logger.warning(
                "Data flow validation failed",
                tool="add_data_flows",
                flow_description=flow.flow_description,
                violations=violations,
                job_id=job_id,
            )
        else:
            valid_flows.append(flow)

    valid_count = len(valid_flows)
    invalid_count = len(invalid_flows)

    if valid_count > 0:
        state_service.update_job_state(
            job_id,
            JobState.FLOW.value,
            detail=f"Adding {valid_count} data flows",
        )

    # Build response message
    if invalid_count == 0:
        response_msg = f"Successfully added {valid_count} data flows."
    else:
        invalid_details = []
        for inv in invalid_flows:
            violations_str = "; ".join(inv["violations"])
            invalid_details.append(f"  - {inv['description']}: {violations_str}")
        invalid_summary = "\n".join(invalid_details)
        response_msg = (
            f"Successfully added {valid_count} data flows.\n\n"
            f"{invalid_count} data flows were NOT added due to validation failures:\n"
            f"{invalid_summary}\n\n"
            f"Valid asset names: {sorted(valid_asset_names)}"
        )

    # Build delta FlowsList with only valid flows
    delta = FlowsList(data_flows=valid_flows, trust_boundaries=[], threat_sources=[])

    return Command(
        update={
            "flows_list": delta,
            "tool_use": 1,
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool(
    name_or_callable="add_trust_boundaries",
    description="Add trust boundaries to the FlowsList. Each trust boundary must reference valid asset/entity names as source_entity and target_entity.",
)
def add_trust_boundaries(
    trust_boundaries: TrustBoundariesList, runtime: ToolRuntime
) -> Command:
    """Add trust boundaries with entity validation against known assets."""
    job_id = runtime.state.get("job_id", "unknown")
    assets = runtime.state.get("assets")

    # Build set of valid asset names
    valid_asset_names = set()
    if assets and assets.assets:
        valid_asset_names = {asset.name for asset in assets.assets}

    # Partition into valid/invalid
    valid_boundaries = []
    invalid_boundaries = []

    for boundary in trust_boundaries.trust_boundaries:
        violations = []
        if boundary.source_entity not in valid_asset_names:
            violations.append(
                f"Invalid source_entity '{boundary.source_entity}' - not in asset list"
            )
        if boundary.target_entity not in valid_asset_names:
            violations.append(
                f"Invalid target_entity '{boundary.target_entity}' - not in asset list"
            )
        if violations:
            invalid_boundaries.append(
                {"purpose": boundary.purpose, "violations": violations}
            )
            logger.warning(
                "Trust boundary validation failed",
                tool="add_trust_boundaries",
                purpose=boundary.purpose,
                violations=violations,
                job_id=job_id,
            )
        else:
            valid_boundaries.append(boundary)

    valid_count = len(valid_boundaries)
    invalid_count = len(invalid_boundaries)

    if valid_count > 0:
        state_service.update_job_state(
            job_id,
            JobState.FLOW.value,
            detail=f"Adding {valid_count} trust boundaries",
        )

    # Build response message
    if invalid_count == 0:
        response_msg = f"Successfully added {valid_count} trust boundaries."
    else:
        invalid_details = []
        for inv in invalid_boundaries:
            violations_str = "; ".join(inv["violations"])
            invalid_details.append(f"  - {inv['purpose']}: {violations_str}")
        invalid_summary = "\n".join(invalid_details)
        response_msg = (
            f"Successfully added {valid_count} trust boundaries.\n\n"
            f"{invalid_count} trust boundaries were NOT added due to validation failures:\n"
            f"{invalid_summary}\n\n"
            f"Valid asset names: {sorted(valid_asset_names)}"
        )

    # Build delta FlowsList with only valid boundaries
    delta = FlowsList(
        data_flows=[], trust_boundaries=valid_boundaries, threat_sources=[]
    )

    return Command(
        update={
            "flows_list": delta,
            "tool_use": 1,
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool(
    name_or_callable="add_threat_sources",
    description="Add threat sources (actor categories) to the FlowsList. No entity validation is needed for threat sources.",
)
def add_threat_sources(
    threat_sources: ThreatSourcesList, runtime: ToolRuntime
) -> Command:
    """Add threat sources to the FlowsList. All provided sources are appended."""
    job_id = runtime.state.get("job_id", "unknown")

    count = len(threat_sources.threat_sources)

    if count > 0:
        state_service.update_job_state(
            job_id,
            JobState.FLOW.value,
            detail=f"Adding {count} threat sources",
        )

    response_msg = f"Successfully added {count} threat sources."

    delta = FlowsList(
        data_flows=[], trust_boundaries=[], threat_sources=threat_sources.threat_sources
    )

    return Command(
        update={
            "flows_list": delta,
            "tool_use": 1,
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


def create_dynamic_add_data_flows_tool(data_flows_list_model: type):
    """Create an add_data_flows tool with Literal-constrained entity fields.

    Args:
        data_flows_list_model: Dynamic DataFlowsList with Literal-constrained fields.

    Returns:
        A langchain tool instance with the constrained schema.
    """

    @tool(
        name_or_callable="add_data_flows",
        description="Add data flows to the FlowsList. Each data flow must reference valid asset/entity names as source_entity and target_entity.",
    )
    def dynamic_add_data_flows(
        data_flows: data_flows_list_model, runtime: ToolRuntime
    ) -> Command:
        """Add data flows with entity validation against known assets."""
        job_id = runtime.state.get("job_id", "unknown")
        assets = runtime.state.get("assets")

        valid_asset_names = set()
        if assets and assets.assets:
            valid_asset_names = {asset.name for asset in assets.assets}

        valid_flows = []
        invalid_flows = []

        for flow in data_flows.data_flows:
            violations = []
            if flow.source_entity not in valid_asset_names:
                violations.append(
                    f"Invalid source_entity '{flow.source_entity}' - not in asset list"
                )
            if flow.target_entity not in valid_asset_names:
                violations.append(
                    f"Invalid target_entity '{flow.target_entity}' - not in asset list"
                )
            if violations:
                invalid_flows.append(
                    {"description": flow.flow_description, "violations": violations}
                )
            else:
                valid_flows.append(flow)

        valid_count = len(valid_flows)
        invalid_count = len(invalid_flows)

        if valid_count > 0:
            state_service.update_job_state(
                job_id, JobState.FLOW.value, detail=f"Adding {valid_count} data flows"
            )

        if invalid_count == 0:
            response_msg = f"Successfully added {valid_count} data flows."
        else:
            invalid_details = [
                f"  - {inv['description']}: {'; '.join(inv['violations'])}"
                for inv in invalid_flows
            ]
            response_msg = (
                f"Successfully added {valid_count} data flows.\n\n"
                f"{invalid_count} data flows were NOT added due to validation failures:\n"
                f"{chr(10).join(invalid_details)}\n\n"
                f"Valid asset names: {sorted(valid_asset_names)}"
            )

        delta = FlowsList(
            data_flows=valid_flows, trust_boundaries=[], threat_sources=[]
        )

        return Command(
            update={
                "flows_list": delta,
                "tool_use": 1,
                "messages": [
                    ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)
                ],
            }
        )

    return dynamic_add_data_flows


def create_dynamic_add_trust_boundaries_tool(trust_boundaries_list_model: type):
    """Create an add_trust_boundaries tool with Literal-constrained entity fields.

    Args:
        trust_boundaries_list_model: Dynamic TrustBoundariesList with Literal-constrained fields.

    Returns:
        A langchain tool instance with the constrained schema.
    """

    @tool(
        name_or_callable="add_trust_boundaries",
        description="Add trust boundaries to the FlowsList. Each trust boundary must reference valid asset/entity names as source_entity and target_entity.",
    )
    def dynamic_add_trust_boundaries(
        trust_boundaries: trust_boundaries_list_model, runtime: ToolRuntime
    ) -> Command:
        """Add trust boundaries with entity validation against known assets."""
        job_id = runtime.state.get("job_id", "unknown")
        assets = runtime.state.get("assets")

        valid_asset_names = set()
        if assets and assets.assets:
            valid_asset_names = {asset.name for asset in assets.assets}

        valid_boundaries = []
        invalid_boundaries = []

        for boundary in trust_boundaries.trust_boundaries:
            violations = []
            if boundary.source_entity not in valid_asset_names:
                violations.append(
                    f"Invalid source_entity '{boundary.source_entity}' - not in asset list"
                )
            if boundary.target_entity not in valid_asset_names:
                violations.append(
                    f"Invalid target_entity '{boundary.target_entity}' - not in asset list"
                )
            if violations:
                invalid_boundaries.append(
                    {"purpose": boundary.purpose, "violations": violations}
                )
            else:
                valid_boundaries.append(boundary)

        valid_count = len(valid_boundaries)
        invalid_count = len(invalid_boundaries)

        if valid_count > 0:
            state_service.update_job_state(
                job_id,
                JobState.FLOW.value,
                detail=f"Adding {valid_count} trust boundaries",
            )

        if invalid_count == 0:
            response_msg = f"Successfully added {valid_count} trust boundaries."
        else:
            invalid_details = [
                f"  - {inv['purpose']}: {'; '.join(inv['violations'])}"
                for inv in invalid_boundaries
            ]
            response_msg = (
                f"Successfully added {valid_count} trust boundaries.\n\n"
                f"{invalid_count} trust boundaries were NOT added due to validation failures:\n"
                f"{chr(10).join(invalid_details)}\n\n"
                f"Valid asset names: {sorted(valid_asset_names)}"
            )

        delta = FlowsList(
            data_flows=[], trust_boundaries=valid_boundaries, threat_sources=[]
        )

        return Command(
            update={
                "flows_list": delta,
                "tool_use": 1,
                "messages": [
                    ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)
                ],
            }
        )

    return dynamic_add_trust_boundaries


@tool(
    name_or_callable="delete_data_flows",
    description="Delete data flows from the FlowsList by matching flow_description.",
)
def delete_data_flows(
    flow_descriptions: Annotated[
        List[str], "List of flow descriptions to remove from the FlowsList"
    ],
    runtime: ToolRuntime,
) -> Command:
    """Remove data flows matching by flow_description."""
    job_id = runtime.state.get("job_id", "unknown")
    current_flows = runtime.state.get("flows_list")

    descriptions_to_remove = set(flow_descriptions)
    remaining_flows = []
    removed_count = 0
    found_descriptions = set()

    for flow in current_flows.data_flows:
        if flow.flow_description in descriptions_to_remove:
            removed_count += 1
            found_descriptions.add(flow.flow_description)
        else:
            remaining_flows.append(flow)

    not_found = sorted(descriptions_to_remove - found_descriptions)

    state_service.update_job_state(
        job_id,
        JobState.FLOW.value,
        detail=f"Removed {removed_count} data flows",
    )

    # Build response
    response_msg = f"Successfully removed {removed_count} data flows."
    if not_found:
        response_msg += f"\n\nNot found: {not_found}"

    # Use Overwrite to replace the entire flows_list
    updated_flows = FlowsList(
        data_flows=remaining_flows,
        trust_boundaries=current_flows.trust_boundaries,
        threat_sources=current_flows.threat_sources,
    )

    return Command(
        update={
            "flows_list": Overwrite(updated_flows),
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool(
    name_or_callable="delete_trust_boundaries",
    description="Delete trust boundaries from the FlowsList by matching purpose.",
)
def delete_trust_boundaries(
    boundary_purposes: Annotated[
        List[str], "List of trust boundary purposes to remove from the FlowsList"
    ],
    runtime: ToolRuntime,
) -> Command:
    """Remove trust boundaries matching by purpose."""
    job_id = runtime.state.get("job_id", "unknown")
    current_flows = runtime.state.get("flows_list")

    purposes_to_remove = set(boundary_purposes)
    remaining_boundaries = []
    removed_count = 0
    found_purposes = set()

    for boundary in current_flows.trust_boundaries:
        if boundary.purpose in purposes_to_remove:
            removed_count += 1
            found_purposes.add(boundary.purpose)
        else:
            remaining_boundaries.append(boundary)

    not_found = sorted(purposes_to_remove - found_purposes)

    state_service.update_job_state(
        job_id,
        JobState.FLOW.value,
        detail=f"Removed {removed_count} trust boundaries",
    )

    # Build response
    response_msg = f"Successfully removed {removed_count} trust boundaries."
    if not_found:
        response_msg += f"\n\nNot found: {not_found}"

    # Use Overwrite to replace the entire flows_list
    updated_flows = FlowsList(
        data_flows=current_flows.data_flows,
        trust_boundaries=remaining_boundaries,
        threat_sources=current_flows.threat_sources,
    )

    return Command(
        update={
            "flows_list": Overwrite(updated_flows),
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool(
    name_or_callable="delete_threat_sources",
    description="Delete threat sources from the FlowsList by matching category.",
)
def delete_threat_sources(
    source_categories: Annotated[
        List[str], "List of threat source categories to remove from the FlowsList"
    ],
    runtime: ToolRuntime,
) -> Command:
    """Remove threat sources matching by category."""
    job_id = runtime.state.get("job_id", "unknown")
    current_flows = runtime.state.get("flows_list")

    categories_to_remove = set(source_categories)
    remaining_sources = []
    removed_count = 0
    found_categories = set()

    for source in current_flows.threat_sources:
        if source.category in categories_to_remove:
            removed_count += 1
            found_categories.add(source.category)
        else:
            remaining_sources.append(source)

    not_found = sorted(categories_to_remove - found_categories)

    state_service.update_job_state(
        job_id,
        JobState.FLOW.value,
        detail=f"Removed {removed_count} threat sources",
    )

    # Build response
    response_msg = f"Successfully removed {removed_count} threat sources."
    if not_found:
        response_msg += f"\n\nNot found: {not_found}"

    # Use Overwrite to replace the entire flows_list
    updated_flows = FlowsList(
        data_flows=current_flows.data_flows,
        trust_boundaries=current_flows.trust_boundaries,
        threat_sources=remaining_sources,
    )

    return Command(
        update={
            "flows_list": Overwrite(updated_flows),
            "messages": [ToolMessage(response_msg, tool_call_id=runtime.tool_call_id)],
        }
    )


@tool(
    name_or_callable="flows_stats",
    description="Get the current status and full contents of the FlowsList including counts and details of data flows, trust boundaries, and threat sources.",
)
def flows_stats(runtime: ToolRuntime) -> str:
    """Return counts and full contents of all FlowsList categories."""
    job_id = runtime.state.get("job_id", "unknown")
    current_flows = runtime.state.get("flows_list")

    state_service.update_job_state(job_id, JobState.FLOW.value, detail="Checking stats")

    is_empty = not current_flows or not any(
        [
            current_flows.data_flows,
            current_flows.trust_boundaries,
            current_flows.threat_sources,
        ]
    )
    if is_empty:
        return (
            "FlowsList is empty.\nData Flows: 0\nTrust Boundaries: 0\nThreat Sources: 0"
        )

    output = []
    output.append(f"Data Flows: {len(current_flows.data_flows)}")
    output.append(f"Trust Boundaries: {len(current_flows.trust_boundaries)}")
    output.append(f"Threat Sources: {len(current_flows.threat_sources)}")
    output.append("")

    # Data flows details
    if current_flows.data_flows:
        output.append("--- Data Flows ---")
        for i, flow in enumerate(current_flows.data_flows, 1):
            output.append(
                f"  {i}. {flow.flow_description} "
                f"({flow.source_entity} -> {flow.target_entity})"
            )
        output.append("")

    # Trust boundaries details
    if current_flows.trust_boundaries:
        output.append("--- Trust Boundaries ---")
        for i, boundary in enumerate(current_flows.trust_boundaries, 1):
            output.append(
                f"  {i}. {boundary.purpose} "
                f"({boundary.source_entity} -> {boundary.target_entity})"
            )
        output.append("")

    # Threat sources details
    if current_flows.threat_sources:
        output.append("--- Threat Sources ---")
        for i, source in enumerate(current_flows.threat_sources, 1):
            output.append(
                f"  {i}. {source.category}: {source.description} "
                f"(Examples: {source.example})"
            )
        output.append("")

    return "\n".join(output)
