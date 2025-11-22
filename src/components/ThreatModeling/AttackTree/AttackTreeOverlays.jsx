import PropTypes from "prop-types";
import { Button, Alert } from "@cloudscape-design/components";
import NebulaLoader from "../NebulaLoader";

/**
 * AttackTreeOverlays component
 *
 * Renders state-based overlays for the attack tree viewer:
 * - Empty state with "Create Attack Tree" button
 * - Creating state with NebulaLoader
 * - Error state with retry button
 *
 * @param {Object} props
 * @param {Object} props.viewState - Current view state
 * @param {string} props.viewState.status - Status: 'empty' | 'creating' | 'loaded' | 'error'
 * @param {string|null} props.viewState.error - Error message if status is 'error'
 * @param {Function} props.onGenerate - Callback to generate attack tree
 * @param {boolean} props.isSubmitting - Whether generation is in progress (button loading state)
 * @param {boolean} props.isGenerating - Whether generation is in progress (for retry button)
 * @param {boolean} props.isReadOnly - Whether the viewer is in read-only mode
 */
const AttackTreeOverlays = ({ viewState, onGenerate, isSubmitting, isGenerating, isReadOnly }) => {
  // Empty State Overlay
  if (viewState.status === "empty") {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "16px",
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <Button
            onClick={onGenerate}
            variant="primary"
            iconName="add-plus"
            loading={isSubmitting}
            disabled={isReadOnly}
          >
            Create Attack Tree
          </Button>
        </div>
      </div>
    );
  }

  // Creating State Overlay
  if (viewState.status === "creating") {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        <NebulaLoader />
      </div>
    );
  }

  // Error State Overlay
  if (viewState.status === "error") {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "20px",
          pointerEvents: "none",
        }}
      >
        <div style={{ maxWidth: "600px", pointerEvents: "auto" }}>
          <Alert
            type="error"
            header="Attack Tree Generation Failed"
            action={
              !isReadOnly && (
                <Button onClick={onGenerate} loading={isGenerating}>
                  Retry
                </Button>
              )
            }
          >
            {viewState.error ||
              "An error occurred while generating the attack tree. Please try again."}
          </Alert>
        </div>
      </div>
    );
  }

  // No overlay for 'loaded' state
  return null;
};

AttackTreeOverlays.propTypes = {
  viewState: PropTypes.shape({
    status: PropTypes.oneOf(["empty", "creating", "loaded", "error"]).isRequired,
    error: PropTypes.string,
  }).isRequired,
  onGenerate: PropTypes.func.isRequired,
  isSubmitting: PropTypes.bool.isRequired,
  isGenerating: PropTypes.bool.isRequired,
  isReadOnly: PropTypes.bool.isRequired,
};

export default AttackTreeOverlays;
