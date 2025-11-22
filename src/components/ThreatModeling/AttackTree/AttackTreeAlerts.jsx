import PropTypes from "prop-types";
import { Alert } from "@cloudscape-design/components";

/**
 * AttackTreeAlerts Component
 *
 * Displays connection errors, save errors, and success messages for the attack tree editor.
 * Alerts are stacked vertically with dynamic positioning and include dismissal handlers.
 *
 * @param {Object} props - Component props
 * @param {string|null} props.connectionError - Connection validation error message
 * @param {string|null} props.saveError - Save operation error message
 * @param {boolean} props.saveSuccess - Save success flag
 * @param {Function} props.onDismissConnectionError - Handler for dismissing connection error
 * @param {Function} props.onDismissSaveError - Handler for dismissing save error
 * @param {Function} props.onDismissSaveSuccess - Handler for dismissing save success message
 */
const AttackTreeAlerts = ({
  connectionError,
  saveError,
  saveSuccess,
  onDismissConnectionError,
  onDismissSaveError,
  onDismissSaveSuccess,
}) => {
  // Calculate dynamic positioning for stacked alerts
  const getAlertPosition = (alertType) => {
    let topPosition = 16; // Base position

    // Stack alerts vertically based on which ones are active
    if (alertType === "saveError" && connectionError) {
      topPosition = 80; // Below connection error
    } else if (alertType === "saveSuccess") {
      if (connectionError && saveError) {
        topPosition = 144; // Below both errors
      } else if (connectionError || saveError) {
        topPosition = 80; // Below one error
      }
    }

    return topPosition;
  };

  return (
    <>
      {/* Connection Error Alert */}
      {connectionError && (
        <div
          style={{
            position: "absolute",
            top: `${getAlertPosition("connectionError")}px`,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            maxWidth: "500px",
            pointerEvents: "auto",
            animation: "slideDown 0.3s ease-out",
          }}
        >
          <Alert
            type="error"
            dismissible
            onDismiss={onDismissConnectionError}
            header="Invalid Connection"
          >
            {connectionError}
          </Alert>
        </div>
      )}

      {/* Save Error Alert */}
      {saveError && (
        <div
          style={{
            position: "absolute",
            top: `${getAlertPosition("saveError")}px`,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            maxWidth: "500px",
            pointerEvents: "auto",
            animation: "slideDown 0.3s ease-out",
          }}
        >
          <Alert type="error" dismissible onDismiss={onDismissSaveError} header="Save Failed">
            {saveError}
          </Alert>
        </div>
      )}

      {/* Save Success Alert */}
      {saveSuccess && (
        <div
          style={{
            position: "absolute",
            top: `${getAlertPosition("saveSuccess")}px`,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            maxWidth: "500px",
            pointerEvents: "auto",
            animation: "slideDown 0.3s ease-out",
          }}
        >
          <Alert type="success" dismissible onDismiss={onDismissSaveSuccess} header="Success">
            Attack tree saved successfully
          </Alert>
        </div>
      )}

      <style>
        {`
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateX(-50%) translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateX(-50%) translateY(0);
            }
          }
        `}
      </style>
    </>
  );
};

AttackTreeAlerts.propTypes = {
  connectionError: PropTypes.string,
  saveError: PropTypes.string,
  saveSuccess: PropTypes.bool,
  onDismissConnectionError: PropTypes.func.isRequired,
  onDismissSaveError: PropTypes.func.isRequired,
  onDismissSaveSuccess: PropTypes.func.isRequired,
};

AttackTreeAlerts.defaultProps = {
  connectionError: null,
  saveError: null,
  saveSuccess: false,
};

export default AttackTreeAlerts;
