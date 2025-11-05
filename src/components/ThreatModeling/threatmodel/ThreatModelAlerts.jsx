import React from "react";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";

/**
 * ThreatModelAlerts - Presentational component for displaying alert messages
 *
 * Displays various alert types including:
 * - Change alerts with save button
 * - Lock conflict warnings
 * - Read-only mode notifications
 * - Collaboration indicators
 *
 * @param {Object} props - Component props
 * @param {Object} props.alert - Alert state object with visible, state, and loading properties
 * @param {Object} props.alertMessages - Alert message templates keyed by alert state
 * @param {Object|null} props.lockStatus - Lock status information (lockedBy, since, message)
 * @param {boolean} props.isReadOnly - Whether the threat model is in read-only mode
 * @param {boolean} props.showResults - Whether results are currently displayed
 * @param {Function} props.onDismiss - Handler for dismissing alerts
 * @param {Function} props.onSave - Handler for save action from alert
 * @param {boolean} props.loading - Loading state for save button
 */
const ThreatModelAlerts = React.memo(
  ({
    alert,
    alertMessages,
    lockStatus,
    isReadOnly,
    showResults,
    onDismiss,
    onSave,
    loading = false,
  }) => {
    // Map alert states to CloudScape alert types
    const getAlertType = (state) => {
      const typeMap = {
        Info: "info",
        Success: "success",
        Error: "error",
        Unauthorized: "error",
        Conflict: "warning",
        LockLost: "warning",
        LockConflict: "warning",
      };
      return typeMap[state] || "info";
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {/* Change alert with save button */}
        {alert.visible && alert.state !== "ErrorThreatModeling" && (
          <Alert
            dismissible
            onDismiss={onDismiss}
            type={getAlertType(alert.state)}
            action={
              alert.state === "Info" && (
                <Button loading={loading || alert.loading} onClick={() => onSave(true)}>
                  {alertMessages[alert.state].button}
                </Button>
              )
            }
            header={alertMessages[alert.state].title}
          >
            {alertMessages[alert.state].msg}
          </Alert>
        )}

        {/* Lock conflict alert */}
        {lockStatus && (
          <Alert type="warning" header={alertMessages.LockConflict.title}>
            {lockStatus.message}
            {lockStatus.since && <> (since {new Date(lockStatus.since).toLocaleString()})</>}
          </Alert>
        )}

        {/* Read-only mode alert */}
        {isReadOnly && !lockStatus && showResults && (
          <Alert type="info" header="Read-only mode">
            This threat model is currently in read-only mode. You cannot make changes.
          </Alert>
        )}
      </div>
    );
  }
);

ThreatModelAlerts.displayName = "ThreatModelAlerts";

export default ThreatModelAlerts;
