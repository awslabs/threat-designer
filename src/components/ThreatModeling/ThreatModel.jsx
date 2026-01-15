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
import {
  ThreatModelProvider,
  useThreatModelContext,
  THREAT_MODEL_ACTIONS,
} from "./ThreatModelContext";

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
const ThreatModelInner = () => {
  // Extract threat model ID from URL parameters
  const { id = null } = useParams();
  const updateSessionContext = useSessionInitializer(id);
  const functions = useContext(ChatSessionFunctionsContext);

  // Get context state and dispatch
  const { state: contextState, dispatch } = useThreatModelContext();

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

  // Sync response to context when it changes
  useEffect(() => {
    if (response !== contextState.response) {
      dispatch({ type: THREAT_MODEL_ACTIONS.SET_RESPONSE, payload: response });
    }
  }, [response, contextState.response, dispatch]);

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

  // Handle dashboard toggle with transition delay
  const handleToggleDashboard = useCallback(
    (newValue) => {
      dispatch({ type: THREAT_MODEL_ACTIONS.START_DASHBOARD_TRANSITION });
      setTimeout(() => {
        dispatch({ type: THREAT_MODEL_ACTIONS.FINISH_DASHBOARD_TRANSITION, payload: newValue });
      }, 300);
    },
    [dispatch]
  );

  // Memoized callback for polling status changes
  const handleStatusChange = useCallback(
    async (status) => {
      if (status === "COMPLETE") {
        try {
          await fetchThreatModelData();
          dispatch({ type: THREAT_MODEL_ACTIONS.SET_PROCESSING, payload: false });
          dispatch({ type: THREAT_MODEL_ACTIONS.SET_STOPPING, payload: false });
          dispatch({ type: THREAT_MODEL_ACTIONS.SET_RESULTS, payload: true });
        } catch (error) {
          console.error("Error getting threat modeling results:", error);
          dispatch({ type: THREAT_MODEL_ACTIONS.SET_PROCESSING, payload: false });
          dispatch({ type: THREAT_MODEL_ACTIONS.SET_STOPPING, payload: false });
          dispatch({ type: THREAT_MODEL_ACTIONS.SET_RESULTS, payload: false });
        }
      } else if (status === "FAILED") {
        dispatch({ type: THREAT_MODEL_ACTIONS.SET_PROCESSING, payload: false });
        dispatch({ type: THREAT_MODEL_ACTIONS.SET_STOPPING, payload: false });
        dispatch({ type: THREAT_MODEL_ACTIONS.SET_RESULTS, payload: false });
        showAlert("ErrorThreatModeling");
      }
    },
    [fetchThreatModelData, showAlert, dispatch]
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
  const { isReadOnly, lockStatus, lockManagerRef } = useThreatModelLock(id, showAlert);

  // Sync isReadOnly and isOwner to context
  useEffect(() => {
    if (isReadOnly !== contextState.isReadOnly) {
      dispatch({ type: THREAT_MODEL_ACTIONS.SET_READ_ONLY, payload: isReadOnly });
    }
  }, [isReadOnly, contextState.isReadOnly, dispatch]);

  useEffect(() => {
    if (isOwner !== contextState.isOwner) {
      dispatch({ type: THREAT_MODEL_ACTIONS.SET_OWNER, payload: isOwner });
    }
  }, [isOwner, contextState.isOwner, dispatch]);

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
    (value) => dispatch({ type: THREAT_MODEL_ACTIONS.SET_PROCESSING, payload: value }),
    [dispatch]
  );
  const setResultsState = useCallback(
    (value) => dispatch({ type: THREAT_MODEL_ACTIONS.SET_RESULTS, payload: value }),
    [dispatch]
  );
  const setStopping = useCallback(
    (value) => dispatch({ type: THREAT_MODEL_ACTIONS.SET_STOPPING, payload: value }),
    [dispatch]
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
      dispatch({ type: THREAT_MODEL_ACTIONS.CLOSE_MODAL, modal: "replay" });
      await handleReplay(iteration, reasoning, instructions);
    },
    [handleReplay, dispatch]
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
  const handleModalChange = useCallback(
    (modalKey, visible) => {
      dispatch({
        type: visible ? THREAT_MODEL_ACTIONS.OPEN_MODAL : THREAT_MODEL_ACTIONS.CLOSE_MODAL,
        modal: modalKey,
      });
    },
    [dispatch]
  );

  // Wrapper for handleSave that shows conflict modal if needed
  const handleSaveWithConflictDetection = useCallback(
    async (viaAlert = false) => {
      const result = await handleSave(viaAlert);
      if (result && !result.success && result.conflict) {
        dispatch({ type: THREAT_MODEL_ACTIONS.SET_CONFLICT, payload: result.conflictData });
      }
      return result;
    },
    [handleSave, dispatch]
  );

  // Action click handler - dispatches button dropdown actions to appropriate handlers
  const onActionClick = useCallback(
    async (actionId) => {
      const actions = {
        sv: () => handleSaveWithConflictDetection(),
        sh: () => dispatch({ type: THREAT_MODEL_ACTIONS.OPEN_MODAL, modal: "sharing" }),
        rm: () => dispatch({ type: THREAT_MODEL_ACTIONS.OPEN_MODAL, modal: "delete" }),
        st: () => handleStop(),
        re: () => dispatch({ type: THREAT_MODEL_ACTIONS.OPEN_MODAL, modal: "replay" }),
        tr: () => handleHelpButtonClick(<InfoContent context={"All"} />),
        "cp-doc": () => handleDownload("docx"),
        "cp-pdf": () => handleDownload("pdf"),
        "cp-json": () => handleDownload("json"),
      };
      await actions[actionId]?.();
    },
    [handleSaveWithConflictDetection, handleStop, handleDownload, handleHelpButtonClick, dispatch]
  );

  // Update processing state based on tmStatus changes
  useEffect(() => {
    if (tmStatus && tmStatus !== "COMPLETE" && tmStatus !== "FAILED") {
      dispatch({ type: THREAT_MODEL_ACTIONS.SET_PROCESSING, payload: true });
    }
  }, [tmStatus, dispatch]);

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
          showResults={contextState.results}
          showProcessing={contextState.processing || contextState.stopping}
          isReadOnly={contextState.isReadOnly}
          isOwner={contextState.isOwner}
          onBreadcrumbClick={onBreadcrumbsClick}
          onActionClick={onActionClick}
          showDashboard={contextState.showDashboard}
          onToggleDashboard={handleToggleDashboard}
        />
        <ThreatModelAlerts
          alert={alert}
          alertMessages={alertMessages}
          lockStatus={lockStatus}
          isReadOnly={contextState.isReadOnly}
          showResults={contextState.results}
          onDismiss={handleDismissChangeAlert}
          onSave={handleSaveWithConflictDetection}
          loading={false}
        />
        <ThreatModelContent
          loading={dataLoading || loading || contextState.stopping}
          processing={contextState.processing || contextState.stopping}
          results={contextState.results && !contextState.stopping}
          error={alert.visible && alert.state === "ErrorThreatModeling"}
          tmStatus={tmStatus}
          iteration={iteration}
          tmDetail={tmDetail}
          threatModelId={id}
          response={response}
          base64Content={base64Content}
          isReadOnly={contextState.isReadOnly}
          isOwner={contextState.isOwner}
          updateThreatModeling={updateThreatModeling}
          refreshTrail={handleRefresh}
          alert={alert}
          alertMessages={alertMessages}
          onRestore={handleRestore}
          replayModalVisible={contextState.modals.replay}
          onReplayModalChange={(v) => handleModalChange("replay", v)}
          onReplay={handleReplayThreatModeling}
          setSplitPanelOpen={setSplitPanelOpen}
          deleteModalVisible={contextState.modals.delete}
          onDeleteModalChange={(v) => handleModalChange("delete", v)}
          onDelete={handleDelete}
          sharingModalVisible={contextState.modals.sharing}
          onSharingModalChange={(v) => handleModalChange("sharing", v)}
          showDashboard={contextState.showDashboard}
          isTransitioning={contextState.isTransitioning}
        />
      </SpaceBetween>

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        visible={contextState.modals.conflict}
        onDismiss={() => {
          handleModalChange("conflict", false);
          hideAlert();
        }}
        conflictData={contextState.conflictData}
        localChanges={response?.item}
        onReload={async () => {
          await fetchThreatModelData();
          handleModalChange("conflict", false);
          hideAlert();
        }}
        onOverride={async () => {
          lastKnownServerTimestamp.current = contextState.conflictData.server_timestamp;
          const result = await handleSave();
          if (result && result.success) {
            handleModalChange("conflict", false);
          }
        }}
      />
    </>
  );
};

/**
 * ThreatModel - Wrapper component that provides context
 */
export const ThreatModel = () => {
  return (
    <ThreatModelProvider>
      <ThreatModelInner />
    </ThreatModelProvider>
  );
};
