// React imports
import { useEffect, useState, useCallback, useMemo, useContext, useRef } from "react";

// Third-party imports
import { useParams, useNavigate } from "react-router";
import SpaceBetween from "@cloudscape-design/components/space-between";

// Local component imports
import ThreatModelAlerts from "./threatmodel/ThreatModelAlerts";
import ThreatModelHeader from "./threatmodel/ThreatModelHeader";
import ThreatModelContent from "./threatmodel/ThreatModelContent";
import ConflictResolutionModal from "./ConflictResolutionModal";
import { InfoContent } from "../HelpPanel/InfoContent";

// Custom hooks
import { useAlert } from "./hooks/useAlert";
import { useThreatModelData } from "./hooks/useThreatModelData";
import { useThreatModelLock } from "./hooks/useThreatModelLock";
import { useThreatModelPolling } from "./hooks/useThreatModelPolling";
import { useThreatModelInterrupts } from "./hooks/useThreatModelInterrupts";
import { useThreatModelActions } from "./hooks/useThreatModelActions";
import { useThreatModelDownload } from "./hooks/useThreatModelDownload";
import { useSessionInitializer } from "../Agent/useSessionInit";

// Context and services
import { useSplitPanel } from "../../SplitPanelContext";
import { ChatSessionFunctionsContext } from "../Agent/ChatContext";
import { SENTRY_ENABLED } from "../Agent/context/constants";

// Styles
import "./ThreatModeling.css";

/**
 * ThreatModel Component
 *
 * Main container component for viewing and managing threat models. This component orchestrates
 * the threat model lifecycle including data fetching, real-time collaboration, lock management,
 * polling for status updates, and user interactions.
 *
 * Features:
 * - View threat model details (assets, threats, data flows, trust boundaries, threat sources)
 * - Edit threat models with collaborative lock management
 * - Real-time updates via polling and interrupt events
 * - Save, delete, share, and replay threat models
 * - Download threat models in multiple formats (PDF, DOCX, JSON)
 * - Integration with Sentry agent for AI-assisted threat modeling
 *
 * @component
 * @returns {JSX.Element} The rendered threat model interface
 */
export const ThreatModel = () => {
  // Extract threat model ID from URL parameters
  const { id = null } = useParams();
  const updateSessionContext = useSessionInitializer(id);
  const functions = useContext(ChatSessionFunctionsContext);

  // Initialize threat model data management hook
  // Handles fetching, updating, and tracking changes to threat model data
  const {
    response,
    base64Content,
    loading: dataLoading,
    isOwner,
    previousResponse,
    lastKnownServerTimestamp,
    updateThreatModeling,
    initializeThreatModelSession,
    handleRefresh: handleRefreshTrail,
    fetchThreatModelData,
    setResponse,
  } = useThreatModelData(id, updateSessionContext, SENTRY_ENABLED, functions.setisVisible);

  // Memoized breadcrumbs array
  const breadcrumbs = useMemo(
    () => [
      { text: "Threat Catalog", href: "/threat-catalog" },
      { text: `${id}`, href: `/${id}` },
    ],
    [id]
  );

  // Alert system for displaying notifications to users
  const { alert, showAlert, hideAlert, alertMessages } = useAlert();

  // Track the response state when user dismissed the alert
  // If response changes after dismissal, we should show the alert again
  const dismissedResponseSnapshot = useRef(null);

  // Consolidated UI state for component rendering and modal visibility
  // Using a single state object reduces re-renders and simplifies state management
  const [uiState, setUiState] = useState({
    processing: false, // True when threat model is being generated/processed
    results: false, // True when threat model results are loaded and displayed
    replayModalVisible: false, // Controls replay modal visibility
    deleteModalVisible: false, // Controls delete confirmation modal visibility
    sharingModalVisible: false, // Controls sharing modal visibility
    conflictModalVisible: false, // Controls conflict resolution modal visibility
  });

  // Conflict state for version conflict resolution
  const [conflictData, setConflictData] = useState(null);

  // Memoized callback for polling status changes
  // This prevents the polling hook from restarting on every render
  const handleStatusChange = useCallback(
    async (status, statusData) => {
      if (status === "COMPLETE") {
        try {
          await fetchThreatModelData();
          setUiState((prevState) => ({
            ...prevState,
            processing: false,
            results: true,
          }));
        } catch (error) {
          console.error("Error getting threat modeling results:", error);
          setUiState((prevState) => ({
            ...prevState,
            processing: false,
            results: false,
          }));
        }
      } else if (status === "FAILED") {
        setUiState((prevState) => ({
          ...prevState,
          processing: false,
          results: false,
        }));
        showAlert("ErrorThreatModeling");
      }
    },
    [fetchThreatModelData, showAlert]
  );

  // Polling hook with status change callback
  // Continuously checks threat model processing status and triggers data refresh on completion
  const { tmStatus, tmDetail, sessionId, iteration, loading, trigger, setTrigger } =
    useThreatModelPolling(id, handleStatusChange);
  const navigate = useNavigate();
  const { setTrail, handleHelpButtonClick, setSplitPanelOpen } = useSplitPanel();

  // Lock management hook for collaborative editing
  // Handles acquiring, maintaining, and releasing edit locks to prevent conflicts
  const { isReadOnly, lockStatus, lockManagerRef } = useThreatModelLock(
    id,
    uiState.results,
    showAlert
  );

  // Send acknowledgment messages to Sentry agent
  const handleSendMessage = useCallback(
    async (id, response) => {
      if (!SENTRY_ENABLED) {
        console.log("Sentry disabled - message not sent to backend");
        return;
      }
      await functions.sendMessage(id, response, true, response);
    },
    [functions]
  );

  // Interrupt handling hook for real-time collaboration
  // Processes interrupt events from Sentry agent (add/edit/delete threats)
  useThreatModelInterrupts(
    id,
    response,
    initializeThreatModelSession,
    setResponse,
    handleSendMessage
  );

  // Helper function to set processing state
  const setProcessing = useCallback((value) => {
    setUiState((prevState) => ({
      ...prevState,
      processing: value,
      results: !value,
    }));
  }, []);

  // Helper function to set results state
  const setResultsState = useCallback((value) => {
    setUiState((prevState) => ({
      ...prevState,
      results: value,
      processing: !value,
    }));
  }, []);

  // Helper function to check for changes
  const checkChanges = useCallback(() => {
    if (!response || !previousResponse.current) return;

    const hasChanges = JSON.stringify(response) !== JSON.stringify(previousResponse.current);
    const currentResponseStr = JSON.stringify(response);
    const wasDismissedForThisResponse = dismissedResponseSnapshot.current === currentResponseStr;

    if (hasChanges && !wasDismissedForThisResponse && !alert.visible) {
      // Show the alert only if:
      // 1. There are changes
      // 2. User hasn't dismissed it for this exact response state
      // 3. Alert is not already visible
      showAlert("Info");
    } else if (!hasChanges && alert.visible && alert.state === "Info") {
      // Hide the alert and reset dismissal snapshot if there are no more changes
      hideAlert();
      dismissedResponseSnapshot.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response, previousResponse, alert.visible, alert.state]);

  // Actions hook - encapsulates all user action handlers
  // Provides handlers for save, delete, replay, stop, restore, and conflict resolution
  const {
    handleSave,
    handleDelete,
    handleReplay,
    handleStop,
    handleRestore,
    handleReloadServerVersion,
  } = useThreatModelActions({
    threatModelId: id,
    response,
    sessionId,
    lockManagerRef,
    navigate,
    showAlert,
    hideAlert,
    setTrigger,
    clearSession: functions.clearSession,
    lastKnownServerTimestamp,
    previousResponse,
    checkChanges,
    setProcessing,
    setResults: setResultsState,
    setisVisible: functions.setisVisible,
  });

  // Download hook - handles document generation and export
  const { handleDownload } = useThreatModelDownload(response, base64Content);

  // Replay handler - closes modal and initiates replay with specified parameters
  const handleReplayThreatModeling = useCallback(
    async (iteration, reasoning, instructions) => {
      setUiState((prevState) => ({
        ...prevState,
        replayModalVisible: false,
      }));
      await handleReplay(iteration, reasoning, instructions);
    },
    [handleReplay]
  );

  // Breadcrumb navigation handler
  // Releases edit lock before navigating to prevent lock leaks
  const onBreadcrumbsClick = useCallback(
    async (e) => {
      e.preventDefault();
      // Release lock before navigating to prevent holding locks on unmounted components
      if (lockManagerRef.current) {
        await lockManagerRef.current.releaseLock().catch(console.error);
      }
      navigate(e.detail.href);
    },
    [lockManagerRef, navigate]
  );

  // Modal visibility handlers - memoized to prevent unnecessary re-renders
  // Custom dismiss handler for change alert
  const handleDismissChangeAlert = useCallback(() => {
    // Save a snapshot of the current response state
    // If the response changes after this, we'll show the alert again
    dismissedResponseSnapshot.current = JSON.stringify(response);
    hideAlert();
  }, [hideAlert, response]);

  const handleReplayModalChange = useCallback((visible) => {
    setUiState((prevState) => ({
      ...prevState,
      replayModalVisible: visible,
    }));
  }, []);

  const handleDeleteModalChange = useCallback((visible) => {
    setUiState((prevState) => ({
      ...prevState,
      deleteModalVisible: visible,
    }));
  }, []);

  const handleSharingModalChange = useCallback((visible) => {
    setUiState((prevState) => ({
      ...prevState,
      sharingModalVisible: visible,
    }));
  }, []);

  const handleConflictModalChange = useCallback((visible) => {
    setUiState((prevState) => ({
      ...prevState,
      conflictModalVisible: visible,
    }));
    if (!visible) {
      setConflictData(null);
    }
  }, []);

  // Wrapper for handleSave that shows conflict modal if needed
  const handleSaveWithConflictDetection = useCallback(
    async (viaAlert = false) => {
      const result = await handleSave(viaAlert);
      // Check if save resulted in a conflict
      if (result && !result.success && result.conflict) {
        setConflictData(result.conflictData);
        setUiState((prevState) => ({
          ...prevState,
          conflictModalVisible: true,
        }));
      }
      return result;
    },
    [handleSave]
  );

  // Action click handler - dispatches button dropdown actions to appropriate handlers
  // Handles save, share, delete, stop, replay, trail, and download actions
  const onActionClick = useCallback(
    async (actionId) => {
      switch (actionId) {
        case "sv":
          await handleSaveWithConflictDetection();
          break;
        case "sh":
          setUiState((prevState) => ({
            ...prevState,
            sharingModalVisible: true,
          }));
          break;
        case "rm":
          setUiState((prevState) => ({
            ...prevState,
            deleteModalVisible: true,
          }));
          break;
        case "st":
          handleStop();
          break;
        case "re":
          setUiState((prevState) => ({
            ...prevState,
            replayModalVisible: true,
          }));
          break;
        case "tr":
          handleHelpButtonClick(<InfoContent context={"All"} />);
          break;
        case "cp-doc":
          handleDownload("docx");
          break;
        case "cp-pdf":
          handleDownload("pdf");
          break;
        case "cp-json":
          handleDownload("json");
          break;
        default:
          break;
      }
    },
    [handleSaveWithConflictDetection, handleStop, handleDownload, handleHelpButtonClick]
  );

  // Update processing state based on tmStatus changes
  // Sets processing=true for any status except COMPLETE or FAILED
  useEffect(() => {
    if (tmStatus && tmStatus !== "COMPLETE" && tmStatus !== "FAILED") {
      setUiState((prevState) => ({
        ...prevState,
        processing: true,
        results: false,
      }));
    }
  }, [tmStatus]);

  // Refresh threat modeling trail in split panel
  const handleRefresh = useCallback(
    async (idValue) => {
      await handleRefreshTrail(idValue, setTrail);
    },
    [handleRefreshTrail, setTrail]
  );

  // Check for changes whenever response data updates
  // Displays an alert if local changes differ from the last saved version
  useEffect(() => {
    if (response) {
      checkChanges();
    }
  }, [response, checkChanges]);

  return (
    <>
      <SpaceBetween size="s">
        <ThreatModelHeader
          breadcrumbs={breadcrumbs}
          title={response?.item?.title}
          tmStatus={tmStatus}
          showResults={uiState.results}
          showProcessing={uiState.processing}
          isReadOnly={isReadOnly}
          isOwner={isOwner}
          onBreadcrumbClick={onBreadcrumbsClick}
          onActionClick={onActionClick}
        />
        <ThreatModelAlerts
          alert={alert}
          alertMessages={alertMessages}
          lockStatus={lockStatus}
          isReadOnly={isReadOnly}
          showResults={uiState.results}
          onDismiss={handleDismissChangeAlert}
          onSave={handleSaveWithConflictDetection}
          loading={false}
        />
        <ThreatModelContent
          loading={dataLoading || loading}
          processing={uiState.processing}
          results={uiState.results}
          error={alert.visible && alert.state === "ErrorThreatModeling"}
          tmStatus={tmStatus}
          iteration={iteration}
          tmDetail={tmDetail}
          threatModelId={id}
          response={response}
          base64Content={base64Content}
          isReadOnly={isReadOnly}
          isOwner={isOwner}
          updateThreatModeling={updateThreatModeling}
          refreshTrail={handleRefresh}
          alert={alert}
          alertMessages={alertMessages}
          onRestore={handleRestore}
          replayModalVisible={uiState.replayModalVisible}
          onReplayModalChange={handleReplayModalChange}
          onReplay={handleReplayThreatModeling}
          setSplitPanelOpen={setSplitPanelOpen}
          deleteModalVisible={uiState.deleteModalVisible}
          onDeleteModalChange={handleDeleteModalChange}
          onDelete={handleDelete}
          sharingModalVisible={uiState.sharingModalVisible}
          onSharingModalChange={handleSharingModalChange}
        />
      </SpaceBetween>

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        visible={uiState.conflictModalVisible}
        onDismiss={() => {
          handleConflictModalChange(false);
          hideAlert(); // Hide the loading alert when canceling
        }}
        conflictData={conflictData}
        localChanges={response?.item}
        onReload={async () => {
          // Reload server version
          await fetchThreatModelData();
          handleConflictModalChange(false);
          hideAlert();
        }}
        onOverride={async () => {
          // Force save by updating timestamp to bypass conflict check
          lastKnownServerTimestamp.current = conflictData.server_timestamp;
          const result = await handleSave();
          if (result && result.success) {
            handleConflictModalChange(false);
            // Success alert is shown by handleSave - don't hide it
          }
        }}
      />
    </>
  );
};
