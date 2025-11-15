import React from "react";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ThreatModelActions from "./ThreatModelActions";

/**
 * ThreatModelHeader Component
 *
 * A presentational component that renders the header section of the threat model page.
 * Includes breadcrumb navigation, page title, and action buttons.
 *
 * @param {Object} props - Component props
 * @param {Array} props.breadcrumbs - Array of breadcrumb items for navigation
 * @param {string} props.title - The threat model title to display
 * @param {string} props.tmStatus - Current threat model status
 * @param {boolean} props.showResults - Whether results are currently displayed
 * @param {boolean} props.showProcessing - Whether processing is in progress
 * @param {boolean} props.isReadOnly - Whether the threat model is in read-only mode
 * @param {boolean} props.isOwner - Whether the current user is the owner
 * @param {Function} props.onBreadcrumbClick - Callback function when breadcrumb is clicked
 * @param {Function} props.onActionClick - Callback function when an action is clicked
 * @param {boolean} props.showDashboard - Whether dashboard view is active
 * @param {Function} props.onToggleDashboard - Callback function when dashboard toggle is clicked
 * @returns {JSX.Element} The header section with breadcrumbs, title, and actions
 */
const ThreatModelHeader = React.memo(
  ({
    breadcrumbs,
    title,
    tmStatus,
    showResults,
    showProcessing,
    isReadOnly,
    isOwner,
    onBreadcrumbClick,
    onActionClick,
    showDashboard,
    onToggleDashboard,
  }) => {
    return (
      <SpaceBetween size="xxl">
        <BreadcrumbGroup items={breadcrumbs} ariaLabel="Breadcrumbs" onClick={onBreadcrumbClick} />
        <Header
          variant="h1"
          actions={
            <ThreatModelActions
              showResults={showResults}
              showProcessing={showProcessing}
              isReadOnly={isReadOnly}
              isOwner={isOwner}
              onActionClick={onActionClick}
              tmStatus={tmStatus}
              showDashboard={showDashboard}
              onToggleDashboard={onToggleDashboard}
            />
          }
        >
          <SpaceBetween direction="horizontal" size="xs">
            <div>{title}</div>
          </SpaceBetween>
        </Header>
      </SpaceBetween>
    );
  }
);

ThreatModelHeader.displayName = "ThreatModelHeader";

export default ThreatModelHeader;
