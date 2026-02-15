import React, { useMemo } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import ThreatModelingOutput from "../ResultsComponent";
import ThreatModelDashboard from "../ThreatModelDashboard";
import Processing from "../ProcessingComponent";
import { ReplayModalComponent } from "../ReplayModal";
import DeleteModal from "../DeleteModal";
import SharingModal from "../SharingModal";
import { useThreatModelContext } from "../ThreatModelContext";

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
 * Now uses ThreatModelContext to access shared state, reducing prop drilling.
 *
 * @param {Object} props - Component props
 * @param {boolean} props.loading - Whether data is currently loading
 * @param {string} props.tmStatus - Current threat model status
 * @param {number} props.iteration - Current iteration number
 * @param {string} props.tmDetail - Status detail message
 * @param {string} props.threatModelId - The threat model ID
 * @param {Object} props.response - Threat model response data
 * @param {Object} props.base64Content - Architecture diagram base64 content
 * @param {Function} props.updateThreatModeling - Function to update threat model data
 * @param {Function} props.refreshTrail - Function to refresh the trail
 * @param {Object} props.alert - Alert state object
 * @param {Object} props.alertMessages - Alert message templates
 * @param {Function} props.onRestore - Handler for restore action
 * @param {Function} props.onReplay - Handler for replay action
 * @param {Function} props.setSplitPanelOpen - Function to control split panel
 * @param {Function} props.onReplayModalChange - Handler for replay modal visibility change
 * @param {Function} props.onDeleteModalChange - Handler for delete modal visibility change
 * @param {Function} props.onDelete - Handler for delete action
 * @param {Function} props.onSharingModalChange - Handler for sharing modal visibility change
 */
const ThreatModelContent = React.memo(
  ({
    loading,
    tmStatus,
    iteration,
    tmDetail,
    threatModelId,
    response,
    base64Content,
    updateThreatModeling,
    refreshTrail,
    alert,
    alertMessages,
    onRestore,
    onReplay,
    setSplitPanelOpen,
    onReplayModalChange,
    onDeleteModalChange,
    onDelete,
    onSharingModalChange,
  }) => {
    // Get shared state from context
    const { state } = useThreatModelContext();
    const { processing, results, isReadOnly, isOwner, showDashboard, isTransitioning, modals } =
      state;
    // Extract threat catalog data from response with memoization
    // This ensures the array reference only changes when the actual threat data changes
    const threatCatalogData = useMemo(() => {
      return response?.item?.threat_list?.threats || [];
    }, [response?.item?.threat_list?.threats]);

    // Memoize the dashboard component to prevent re-rendering when switching views
    const dashboardComponent = useMemo(() => {
      if (!showDashboard || !results) return null;
      return <ThreatModelDashboard threatCatalogData={threatCatalogData} />;
    }, [showDashboard, results, threatCatalogData]);

    // Memoize the threat list component to prevent re-rendering when switching views
    const threatListComponent = useMemo(() => {
      if (showDashboard || !results) return null;
      return (
        <ThreatModelingOutput
          title={response?.item?.title}
          architectureDiagramBase64={base64Content}
          description={response?.item?.description}
          assumptions={response?.item?.assumptions}
          dataFlowData={response?.item?.system_architecture?.data_flows}
          trustBoundaryData={response?.item?.system_architecture?.trust_boundaries}
          threatSourceData={response?.item?.system_architecture?.threat_sources}
          threatCatalogData={threatCatalogData}
          assets={response?.item?.assets?.assets}
          updateTM={updateThreatModeling}
          refreshTrail={refreshTrail}
          isReadOnly={isReadOnly}
        />
      );
    }, [
      showDashboard,
      results,
      response,
      base64Content,
      threatCatalogData,
      updateThreatModeling,
      refreshTrail,
      isReadOnly,
    ]);

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
              {processing && !(alert.visible && alert.state === "ErrorThreatModeling") && (
                <div style={{ width: "100%", marginTop: "200px" }}>
                  <Processing
                    status={tmStatus}
                    iteration={iteration}
                    id={threatModelId}
                    detail={tmDetail}
                  />
                </div>
              )}

              {/* Show spinner during view transition */}
              {results && isTransitioning && (
                <div
                  style={{
                    width: "100%",
                    marginTop: "200px",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <Spinner size="large" />
                </div>
              )}

              {/* Results component - conditionally render based on showDashboard */}
              {!isTransitioning && threatListComponent}

              {/* Dashboard component - conditionally render based on showDashboard */}
              {!isTransitioning && results && showDashboard && (
                <div style={{ width: "100%", padding: "0 20px" }}>{dashboardComponent}</div>
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
          visible={modals.replay}
          setVisible={onReplayModalChange}
          setSplitPanelOpen={setSplitPanelOpen}
          currentApplicationType={response?.item?.application_type || "hybrid"}
        />

        {/* Delete Modal */}
        <DeleteModal
          visible={modals.delete}
          setVisible={onDeleteModalChange}
          handleDelete={onDelete}
          title={response?.item?.title}
        />

        {/* Sharing Modal */}
        <SharingModal
          visible={modals.sharing}
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
    // Note: Context state changes will trigger re-renders automatically
    return (
      prevProps.loading === nextProps.loading &&
      prevProps.tmStatus === nextProps.tmStatus &&
      prevProps.iteration === nextProps.iteration &&
      prevProps.tmDetail === nextProps.tmDetail &&
      prevProps.threatModelId === nextProps.threatModelId &&
      prevProps.alert.visible === nextProps.alert.visible &&
      prevProps.alert.state === nextProps.alert.state &&
      prevProps.response === nextProps.response &&
      prevProps.base64Content === nextProps.base64Content
    );
  }
);

ThreatModelContent.displayName = "ThreatModelContent";

export default ThreatModelContent;
