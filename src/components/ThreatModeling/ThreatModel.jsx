// React imports
import { useEffect, useReducer, useCallback, useMemo, useContext, useRef } from "react";

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
import { clearThreatModelCache } from "../../services/ThreatDesigner/attackTreeCache";

// Styles
import "./ThreatModeling.css";

// UI State Action Types
const UI_ACTIONS = {
  SET_PROCESSING: "SET_PROCESSING",
  STATUS_COMPLETE: "STATUS_COMPLETE",
  STATUS_FAILED: "STATUS_FAILED",
  SET_STOPPING: "SET_STOPPING",
  START_DASHBOARD_TRANSITION: "START_DASHBOARD_TRANSITION",
  FINISH_DASHBOARD_TRANSITION: "FINISH_DASHBOARD_TRANSITION",
  OPEN_MODAL: "OPEN_MODAL",
  CLOSE_MODAL: "CLOSE_MODAL",
  SET_CONFLICT: "SET_CONFLICT",
};

// Initial UI state
const initialUiState = {
  processing: false,
  results: false,
  stopping: false,
  showDashboard: false,
  isTransitioning: false,
  replayModalVisible: false,
  deleteModalVisible: false,
  sharingModalVisible: false,
  conflictModalVisible: false,
  conflictData: null,
};

// UI State Reducer
function uiReducer(state, action) {
  switch (action.type) {
    case UI_ACTIONS.SET_PROCESSING:
      return { ...state, processing: action.value, results: !action.value };
    case UI_ACTIONS.STATUS_COMPLETE:
      return { ...state, processing: false, stopping: false, results: true };
    case UI_ACTIONS.STATUS_FAILED:
      return { ...state, processing: false, stopping: false, results: false };
    case UI_ACTIONS.SET_STOPPING:
      return { ...state, stopping: action.value };
    case UI_ACTIONS.START_DASHBOARD_TRANSITION:
      return { ...state, isTransitioning: true };
    case UI_ACTIONS.FINISH_DASHBOARD_TRANSITION:
      return { ...state, showDashboard: action.value, isTransitioning: false };
    case UI_ACTIONS.OPEN_MODAL:
      return { ...state, [action.modal]: true };
    case UI_ACTIONS.CLOSE_MODAL:
      return {
        ...state,
        [action.modal]: false,
        ...(action.modal === "conflictModalVisible" ? { conflictData: null } : {}),
      };
    case UI_ACTIONS.SET_CONFLICT:
      return { ...state, conflictData: action.data, conflictModalVisible: true };
    default:
      return state;
  }
}

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

  // UI state managed by reducer for predictable state transitions
  const [uiState, dispatch] = useReducer(uiReducer, initialUiState);

  // Handle dashboard toggle with transition delay
  const handleToggleDashboard = useCallback((newValue) => {
    dispatch({ type: UI_ACTIONS.START_DASHBOARD_TRANSITION });
    setTimeout(() => {
      dispatch({ type: UI_ACTIONS.FINISH_DASHBOARD_TRANSITION, value: newValue });
    }, 300);
  }, []);

  // Memoized callback for polling status changes
  const handleStatusChange = useCallback(
    async (status) => {
      if (status === "COMPLETE") {
        try {
          await fetchThreatModelData();
          dispatch({ type: UI_ACTIONS.STATUS_COMPLETE });
        } catch (error) {
          console.error("Error getting threat modeling results:", error);
          dispatch({ type: UI_ACTIONS.STATUS_FAILED });
        }
      } else if (status === "FAILED") {
        dispatch({ type: UI_ACTIONS.STATUS_FAILED });
        showAlert("ErrorThreatModeling");
      }
    },
    [fetchThreatModelData, showAlert]
  );

  // Polling hook with status change callback
  // Continuously checks threat model processing status and triggers data refresh on completion
  const { tmStatus, tmDetail, sessionId, iteration, loading, setTrigger } = useThreatModelPolling(
    id,
    handleStatusChange
  );
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

  // Helper functions for state updates - passed to actions hook
  const setProcessing = useCallback(
    (value) => dispatch({ type: UI_ACTIONS.SET_PROCESSING, value }),
    []
  );
  const setResultsState = useCallback(
    (value) => dispatch({ type: UI_ACTIONS.SET_PROCESSING, value: !value }),
    []
  );
  const setStopping = useCallback(
    (value) => dispatch({ type: UI_ACTIONS.SET_STOPPING, value }),
    []
  );

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
  const { handleSave, handleDelete, handleReplay, handleStop, handleRestore } =
    useThreatModelActions({
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
      setStopping,
    });

  // Download hook - handles document generation and export
  const { handleDownload } = useThreatModelDownload(response, base64Content);

  // Replay handler - closes modal and initiates replay with specified parameters
  const handleReplayThreatModeling = useCallback(
    async (iteration, reasoning, instructions) => {
      dispatch({ type: UI_ACTIONS.CLOSE_MODAL, modal: "replayModalVisible" });
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

  // Custom dismiss handler for change alert
  const handleDismissChangeAlert = useCallback(() => {
    dismissedResponseSnapshot.current = JSON.stringify(response);
    hideAlert();
  }, [hideAlert, response]);

  // Generic modal visibility handler
  const handleModalChange = useCallback((modalKey, visible) => {
    dispatch({
      type: visible ? UI_ACTIONS.OPEN_MODAL : UI_ACTIONS.CLOSE_MODAL,
      modal: modalKey,
    });
  }, []);

  // Wrapper for handleSave that shows conflict modal if needed
  const handleSaveWithConflictDetection = useCallback(
    async (viaAlert = false) => {
      const result = await handleSave(viaAlert);
      if (result && !result.success && result.conflict) {
        dispatch({ type: UI_ACTIONS.SET_CONFLICT, data: result.conflictData });
      }
      return result;
    },
    [handleSave]
  );

  // Action click handler - dispatches button dropdown actions to appropriate handlers
  const onActionClick = useCallback(
    async (actionId) => {
      const actions = {
        sv: () => handleSaveWithConflictDetection(),
        sh: () => dispatch({ type: UI_ACTIONS.OPEN_MODAL, modal: "sharingModalVisible" }),
        rm: () => dispatch({ type: UI_ACTIONS.OPEN_MODAL, modal: "deleteModalVisible" }),
        st: () => handleStop(),
        re: () => dispatch({ type: UI_ACTIONS.OPEN_MODAL, modal: "replayModalVisible" }),
        tr: () => handleHelpButtonClick(<InfoContent context={"All"} />),
        "cp-doc": () => handleDownload("docx"),
        "cp-pdf": () => handleDownload("pdf"),
        "cp-json": () => handleDownload("json"),
      };
      await actions[actionId]?.();
    },
    [handleSaveWithConflictDetection, handleStop, handleDownload, handleHelpButtonClick]
  );

  // Update processing state based on tmStatus changes
  useEffect(() => {
    if (tmStatus && tmStatus !== "COMPLETE" && tmStatus !== "FAILED") {
      dispatch({ type: UI_ACTIONS.SET_PROCESSING, value: true });
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

  // Clear attack tree cache when threat model page unmounts
  // This ensures fresh data is loaded from backend on next visit
  useEffect(() => {
    return () => {
      if (id) {
        console.log(`Clearing attack tree cache for threat model: ${id}`);
        clearThreatModelCache(id);
      }
    };
  }, [id]);

  return (
    <>
      <SpaceBetween size="xl">
        <ThreatModelHeader
          breadcrumbs={breadcrumbs}
          title={response?.item?.title}
          tmStatus={tmStatus}
          showResults={uiState.results}
          showProcessing={uiState.processing || uiState.stopping}
          isReadOnly={isReadOnly}
          isOwner={isOwner}
          onBreadcrumbClick={onBreadcrumbsClick}
          onActionClick={onActionClick}
          showDashboard={uiState.showDashboard}
          onToggleDashboard={handleToggleDashboard}
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
          loading={dataLoading || loading || uiState.stopping}
          processing={uiState.processing || uiState.stopping}
          results={uiState.results && !uiState.stopping}
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
          onReplayModalChange={(v) => handleModalChange("replayModalVisible", v)}
          onReplay={handleReplayThreatModeling}
          setSplitPanelOpen={setSplitPanelOpen}
          deleteModalVisible={uiState.deleteModalVisible}
          onDeleteModalChange={(v) => handleModalChange("deleteModalVisible", v)}
          onDelete={handleDelete}
          sharingModalVisible={uiState.sharingModalVisible}
          onSharingModalChange={(v) => handleModalChange("sharingModalVisible", v)}
          showDashboard={uiState.showDashboard}
          isTransitioning={uiState.isTransitioning}
        />
      </SpaceBetween>

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        visible={uiState.conflictModalVisible}
        onDismiss={() => {
          handleModalChange("conflictModalVisible", false);
          hideAlert();
        }}
        conflictData={uiState.conflictData}
        localChanges={response?.item}
        onReload={async () => {
          await fetchThreatModelData();
          handleModalChange("conflictModalVisible", false);
          hideAlert();
        }}
        onOverride={async () => {
          lastKnownServerTimestamp.current = uiState.conflictData.server_timestamp;
          const result = await handleSave();
          if (result && result.success) {
            handleModalChange("conflictModalVisible", false);
          }
        }}
      />
    </>
  );
};
