import React from "react";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import ToggleButton from "@cloudscape-design/components/toggle-button";
import SpaceBetween from "@cloudscape-design/components/space-between";

/**
 * ThreatModelActions Component
 *
 * A presentational component that renders the actions dropdown menu for threat models.
 * Provides actions like Save, Share, Delete, Replay, Trail, Stop, and Download options.
 * Also includes a toggle button to switch between Threat List and Dashboard views.
 *
 * @param {Object} props - Component props
 * @param {boolean} props.showResults - Whether results are currently displayed
 * @param {boolean} props.showProcessing - Whether processing is in progress
 * @param {boolean} props.isReadOnly - Whether the threat model is in read-only mode
 * @param {boolean} props.isOwner - Whether the current user is the owner
 * @param {Function} props.onActionClick - Callback function when an action is clicked
 * @param {boolean} props.showDashboard - Whether dashboard view is active
 * @param {Function} props.onToggleDashboard - Callback function when dashboard toggle is clicked
 * @returns {JSX.Element|null} The actions dropdown or null if status is FAILED
 */
const ThreatModelActions = React.memo(
  ({
    showResults,
    showProcessing,
    isReadOnly,
    isOwner,
    onActionClick,
    tmStatus,
    showDashboard,
    onToggleDashboard,
  }) => {
    // Don't show actions if status is FAILED
    if (tmStatus === "FAILED") {
      return null;
    }

    // Build action items array based on state
    const actionItems = [
      {
        text: "Save",
        id: "sv",
        disabled: !showResults || isReadOnly,
      },
      // Only show Share and Delete for owners
      ...(isOwner
        ? [
            {
              text: "Share",
              id: "sh",
              disabled: !showResults,
            },
            {
              text: "Delete",
              id: "rm",
              disabled: !showResults,
            },
          ]
        : []),
      {
        text: "Replay",
        id: "re",
        disabled: !showResults || isReadOnly,
      },
      {
        text: "Trail",
        id: "tr",
        disabled: !showResults,
      },
      {
        text: "Stop",
        id: "st",
        disabled: !showProcessing,
      },
      {
        text: "Download",
        id: "download",
        disabled: !showResults,
        items: [
          {
            text: "PDF",
            id: "cp-pdf",
            disabled: !showResults,
          },
          {
            text: "DOCX",
            id: "cp-doc",
            disabled: !showResults,
          },
          {
            text: "JSON",
            id: "cp-json",
            disabled: !showResults,
          },
        ],
      },
    ];

    return (
      <SpaceBetween direction="horizontal" size="xs">
        {showResults && (
          <ToggleButton
            pressed={showDashboard}
            onChange={({ detail }) => {
              onToggleDashboard(detail.pressed);
            }}
            iconName="grid-view"
            ariaLabel="Toggle Insights view"
          >
            Insights
          </ToggleButton>
        )}
        <ButtonDropdown
          variant="primary"
          expandableGroups
          fullWidth
          onItemClick={(itemClickDetails) => {
            onActionClick(itemClickDetails.detail.id);
          }}
          items={actionItems}
        >
          Actions
        </ButtonDropdown>
      </SpaceBetween>
    );
  }
);

ThreatModelActions.displayName = "ThreatModelActions";

export default ThreatModelActions;
