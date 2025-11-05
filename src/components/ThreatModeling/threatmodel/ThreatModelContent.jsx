import React from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import ThreatModelingOutput from "../ResultsComponent";
import Processing from "../ProcessingComponent";
import { ReplayModalComponent } from "../ReplayModal";
import DeleteModal from "../DeleteModal";
import SharingModal from "../SharingModal";

/**
 * ThreatModelContent - Presentational component for rendering the main content area
 *
 * Conditionally renders different content based on the current state:
 * - Loading spinner when data is being fetched
 * - Processing component when threat model is being generated
 * - ThreatModelingOutput when results are available
 * - Error alert when processing fails
 * - Modal components for replay, delete, and sharing actions
 *
 * @param {Object} props - Component props
 * @param {boolean} props.loading - Whether data is currently loading
 * @param {boolean} props.processing - Whether threat model is being processed
 * @param {boolean} props.results - Whether results are available to display
 * @param {boolean} props.error - Whether an error occurred
 * @param {string} props.tmStatus - Current threat model status
 * @param {number} props.iteration - Current iteration number
 * @param {string} props.tmDetail - Status detail message
 * @param {string} props.threatModelId - The threat model ID
 * @param {Object} props.response - Threat model response data
 * @param {Object} props.base64Content - Architecture diagram base64 content
 * @param {boolean} props.isReadOnly - Whether the threat model is in read-only mode
 * @param {boolean} props.isOwner - Whether the current user is the owner
 * @param {Function} props.updateThreatModeling - Function to update threat model data
 * @param {Function} props.refreshTrail - Function to refresh the trail
 * @param {Object} props.alert - Alert state object
 * @param {Object} props.alertMessages - Alert message templates
 * @param {Function} props.onRestore - Handler for restore action
 * @param {boolean} props.replayModalVisible - Whether replay modal is visible
 * @param {Function} props.onReplayModalChange - Handler for replay modal visibility change
 * @param {Function} props.onReplay - Handler for replay action
 * @param {Function} props.setSplitPanelOpen - Function to control split panel
 * @param {boolean} props.deleteModalVisible - Whether delete modal is visible
 * @param {Function} props.onDeleteModalChange - Handler for delete modal visibility change
 * @param {Function} props.onDelete - Handler for delete action
 * @param {boolean} props.sharingModalVisible - Whether sharing modal is visible
 * @param {Function} props.onSharingModalChange - Handler for sharing modal visibility change
 */
const ThreatModelContent = React.memo(
  ({
    loading,
    processing,
    results,
    error,
    tmStatus,
    iteration,
    tmDetail,
    threatModelId,
    response,
    base64Content,
    isReadOnly,
    isOwner,
    updateThreatModeling,
    refreshTrail,
    alert,
    alertMessages,
    onRestore,
    replayModalVisible,
    onReplayModalChange,
    onReplay,
    setSplitPanelOpen,
    deleteModalVisible,
    onDeleteModalChange,
    onDelete,
    sharingModalVisible,
    onSharingModalChange,
  }) => {
    return (
      <>
        {/* Loading spinner */}
        {loading ? (
          <SpaceBetween alignItems="center">
            <div style={{ marginTop: "20px" }}>
              <Spinner size="large" />
            </div>
          </SpaceBetween>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: "100%",
              }}
            >
              {/* Processing component */}
              {processing && (
                <div style={{ width: "100%", marginTop: "200px" }}>
                  <Processing
                    status={tmStatus}
                    iteration={iteration}
                    id={threatModelId}
                    detail={tmDetail}
                  />
                </div>
              )}

              {/* Results component */}
              {results && (
                <ThreatModelingOutput
                  title={response?.item?.title}
                  architectureDiagramBase64={base64Content}
                  description={response?.item?.description}
                  assumptions={response?.item?.assumptions}
                  dataFlowData={response?.item?.system_architecture?.data_flows}
                  trustBoundaryData={response?.item?.system_architecture?.trust_boundaries}
                  threatSourceData={response?.item?.system_architecture?.threat_sources}
                  threatCatalogData={response?.item?.threat_list?.threats}
                  assets={response?.item?.assets?.assets}
                  updateTM={updateThreatModeling}
                  refreshTrail={refreshTrail}
                  isReadOnly={isReadOnly}
                />
              )}

              {/* Error alert */}
              {alert.visible && alert.state === "ErrorThreatModeling" && (
                <div style={{ width: "80%", marginTop: "200px" }}>
                  <Alert
                    type={"error"}
                    action={
                      <Button onClick={onRestore}>{alertMessages[alert.state].button}</Button>
                    }
                    header={alertMessages[alert.state].title}
                  >
                    {alertMessages[alert.state].msg}
                  </Alert>
                </div>
              )}
            </div>
          </>
        )}

        {/* Replay Modal */}
        <ReplayModalComponent
          handleReplay={onReplay}
          visible={replayModalVisible}
          setVisible={onReplayModalChange}
          setSplitPanelOpen={setSplitPanelOpen}
        />

        {/* Delete Modal */}
        <DeleteModal
          visible={deleteModalVisible}
          setVisible={onDeleteModalChange}
          handleDelete={onDelete}
          title={response?.item?.title}
        />

        {/* Sharing Modal */}
        <SharingModal
          visible={sharingModalVisible}
          setVisible={onSharingModalChange}
          threatModelId={threatModelId}
          isOwner={isOwner}
        />
      </>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function to prevent unnecessary re-renders
    // Only re-render if these specific props change
    return (
      prevProps.loading === nextProps.loading &&
      prevProps.processing === nextProps.processing &&
      prevProps.results === nextProps.results &&
      prevProps.error === nextProps.error &&
      prevProps.tmStatus === nextProps.tmStatus &&
      prevProps.iteration === nextProps.iteration &&
      prevProps.tmDetail === nextProps.tmDetail &&
      prevProps.threatModelId === nextProps.threatModelId &&
      prevProps.isReadOnly === nextProps.isReadOnly &&
      prevProps.isOwner === nextProps.isOwner &&
      prevProps.replayModalVisible === nextProps.replayModalVisible &&
      prevProps.deleteModalVisible === nextProps.deleteModalVisible &&
      prevProps.sharingModalVisible === nextProps.sharingModalVisible &&
      prevProps.alert.visible === nextProps.alert.visible &&
      prevProps.alert.state === nextProps.alert.state &&
      prevProps.response === nextProps.response &&
      prevProps.base64Content === nextProps.base64Content
    );
  }
);

ThreatModelContent.displayName = "ThreatModelContent";

export default ThreatModelContent;
