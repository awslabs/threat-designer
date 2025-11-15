import React, { useEffect, useState, useRef, useCallback } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import { Button } from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";
import { useAlert } from "./hooks/useAlert";
import { useParams, useNavigate } from "react-router";
import { downloadDocument, downloadPDFDocument } from "./docs";
import createThreatModelingDocument from "./ResultsDocx";
import { createThreatModelingPDF } from "./ResutlPdf";
import { ReplayModalComponent } from "./ReplayModal";
import { InfoContent } from "../HelpPanel/InfoContent";
import DeleteModal from "./DeleteModal";
import { useContext } from "react";
import {
  getThreatModelingStatus,
  getThreatModelingTrail,
  getThreatModelingResults,
  getDownloadUrl,
  updateTm,
  deleteTm,
  startThreatModeling,
  restoreTm,
} from "../../services/ThreatDesigner/stats";
import { useSplitPanel } from "../../SplitPanelContext";
import "./ThreatModeling.css";
import { useEventReceiver } from "../Agent/useEventReceiver";
import { useSessionInitializer } from "../Agent/useSessionInit";
import { ChatSessionFunctionsContext } from "../Agent/ChatContext";
import { SENTRY_ENABLED } from "../Agent/context/constants";
import { getStateManager } from "../../services/ThreatDesigner/embeddedBackend";
import { BACKEND_MODE } from "../../config";
import { ThreatModelHeader } from "./threatmodel/ThreatModelHeader";
import { ThreatModelActions } from "./threatmodel/ThreatModelActions";
import { ThreatModelContent } from "./threatmodel/ThreatModelContent";

const blobToBase64 = (blob) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.replace("data:", "").replace(/^.+,/, "");
      resolve({
        type: blob.type,
        value: base64String,
      });
    };
    reader.readAsDataURL(blob);
  });
};

const arrayToObjects = (key, stringArray) => {
  if (!stringArray || stringArray.length === 0) return [];
  return stringArray.map((value) => ({ [key]: value }));
};

const downloadJSON = (data, filename, base64Diagram) => {
  // Destructure to exclude unwanted fields
  const { job_id, owner, retry, s3_location, ...cleanData } = data || {};

  // Create a complete export object that includes the diagram
  const exportData = {
    ...cleanData,
    architecture_diagram: base64Diagram
      ? {
          type: base64Diagram.type,
          value: base64Diagram.value,
        }
      : null,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename || "threat-model"}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const ThreatModel = ({ user }) => {
  const { id = null } = useParams();
  const updateSessionContext = useSessionInitializer(id);
  const navigate = useNavigate();

  // Check if Lightning Mode is enabled
  const isLightningMode = import.meta.env.VITE_BACKEND_MODE === "lightning";

  const BreadcrumbItems = [
    { text: "Threat Catalog", href: "/threat-catalog" },
    { text: `${id}`, href: `/${id}` },
  ];
  const [breadcrumbs, setBreadcrumbs] = useState(BreadcrumbItems);
  const [tmStatus, setTmStatus] = useState("START");
  const [iteration, setIteration] = useState(null);
  const [tmDetail, setTmDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(null);

  const { alert, showAlert, hideAlert, alertMessages } = useAlert();
  const [state, setState] = useState({
    processing: false,
    results: false,
  });
  const [visible, setVisible] = useState(false);
  const [base64Content, setBase64Content] = useState([]);
  const [response, setResponse] = useState(null);
  const previousResponse = useRef(null);
  const [deleteModalVisible, setDeleteModal] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const { setTrail, handleHelpButtonClick, setSplitPanelOpen } = useSplitPanel();
  const functions = useContext(ChatSessionFunctionsContext);

  // Queue for storing interrupt events that arrive before data is loaded
  const pendingInterrupts = useRef([]);

  // Validate job existence in Lightning Mode and redirect if not found
  useEffect(() => {
    const validateJobExists = async () => {
      // Only validate in Lightning Mode and when we have a job ID
      if (BACKEND_MODE === "lightning" && id) {
        try {
          const stateManager = await getStateManager();
          const jobStatus = stateManager.getJobStatus(id);

          if (!jobStatus) {
            // Job doesn't exist in sessionStorage, redirect to homepage
            console.warn(`Job ${id} not found in sessionStorage, redirecting to homepage`);
            navigate("/");
            return;
          }
        } catch (error) {
          console.error("Error validating job existence:", error);
          // On error, allow the component to continue (fail gracefully)
        }
      }
    };

    validateJobExists();
  }, [id, navigate]);

  // Reset pending interrupts when id changes
  useEffect(() => {
    pendingInterrupts.current = [];
  }, [id]);

  const handleReplayThreatModeling = async (iteration, reasoning, instructions) => {
    try {
      setIteration(0);
      setTmStatus("START");
      functions.setisVisible(false);
      setState({ results: false, processing: true });
      setVisible(false);

      // Clear any pending interrupts when starting a new replay
      pendingInterrupts.current = [];

      await startThreatModeling(
        null, // key
        iteration, // iteration
        reasoning,
        null, // title
        null, // description
        null, // assumptions
        true, // replay
        id, // id
        instructions // instructions
      );

      setTrigger(Math.floor(Math.random() * 100) + 1);
    } catch (error) {
      console.error("Error starting threat modeling:", error);
    } finally {
      previousResponse.current = null;
    }
  };

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

  const initializeThreatModelSession = useCallback(
    async (threatModelData) => {
      // Defensive check: threat_list might be null if workflow hasn't completed
      if (!threatModelData.threat_list) {
        console.warn("Threat list not yet available, skipping session initialization");
        return;
      }
      const threats = threatModelData.threat_list.threats || [];

      // Calculate likelihood distribution
      const likelihoodCounts = threats.reduce((acc, threat) => {
        acc[threat.likelihood] = (acc[threat.likelihood] || 0) + 1;
        return acc;
      }, {});

      // Calculate STRIDE distribution
      const strideCounts = threats.reduce((acc, threat) => {
        acc[threat.stride_category] = (acc[threat.stride_category] || 0) + 1;
        return acc;
      }, {});

      // Get unique assets
      const uniqueAssets = [...new Set(threats.map((threat) => threat.target))];

      // Calculate threat sources
      const sourceCounts = threats.reduce((acc, threat) => {
        acc[threat.source] = (acc[threat.source] || 0) + 1;
        return acc;
      }, {});

      const sessionContext = {
        diagram: threatModelData.s3_location,
        threatModel: {
          threats: threats,
          summary: threatModelData.summary,
          assumptions: threatModelData.assumptions,
          system_architecture: threatModelData.system_architecture,
          description: threatModelData.description,
          title: threatModelData.title,
          threat_catalog_summary: {
            nr_threats: {
              total: threats.length,
              high: likelihoodCounts.High || 0,
              medium: likelihoodCounts.Medium || 0,
              low: likelihoodCounts.Low || 0,
            },
            likelihood_distribution: likelihoodCounts,
            stride_distribution: strideCounts,
            assets: {
              total_unique_assets: uniqueAssets.length,
            },
            threat_sources: sourceCounts,
          },
        },
      };

      // Only update session context if Sentry is enabled
      if (SENTRY_ENABLED) {
        updateSessionContext(id, sessionContext).catch((error) => {
          console.error(`Failed to initialize session ${id}:`, error);
        });
        functions.setisVisible(true);
      } else {
        console.log("Sentry disabled - session context not sent to backend");
      }
    },
    [id, updateSessionContext, functions]
  );

  // New function to handle threat updates from interrupts
  const handleThreatUpdates = useCallback(
    (toolName, threatsPayload) => {
      if (!Array.isArray(threatsPayload)) {
        console.error("Invalid threat payload format - expected array");
        return;
      }

      let updatedThreats = [...response.item.threat_list.threats];

      switch (toolName) {
        case "add_threats":
          // Append new threats to existing ones
          updatedThreats = [...updatedThreats, ...threatsPayload];
          console.log(`Added ${threatsPayload.length} new threats`);
          break;

        case "edit_threats":
          // Replace existing threats by matching names
          threatsPayload.forEach((newThreat) => {
            const existingIndex = updatedThreats.findIndex(
              (existingThreat) => existingThreat.name === newThreat.name
            );
            if (existingIndex !== -1) {
              updatedThreats[existingIndex] = newThreat;
              console.log(`Updated threat: ${newThreat.name}`);
            } else {
              console.warn(`Threat not found for editing: ${newThreat.name}`);
            }
          });
          break;

        case "delete_threats":
          // Remove threats by matching names
          const threatNamesToDelete = threatsPayload.map((threat) => threat.name);
          const originalCount = updatedThreats.length;
          updatedThreats = updatedThreats.filter(
            (existingThreat) => !threatNamesToDelete.includes(existingThreat.name)
          );
          console.log(`Deleted ${originalCount - updatedThreats.length} threats`);
          break;

        default:
          console.warn(`Unknown threat operation: ${toolName}`);
          return;
      }

      // Create new state with updated threats
      const newState = { ...response };
      newState.item = { ...newState.item };
      newState.item.threat_list = { ...newState.item.threat_list };
      newState.item.threat_list.threats = updatedThreats;

      // Trigger the same side effects as updateThreatModeling
      initializeThreatModelSession(newState.item);
      setResponse(newState);
    },
    [response, initializeThreatModelSession]
  );

  const processInterruptEvent = useCallback(
    (event) => {
      const { interruptMessage, source, timestamp } = event.payload;
      console.log(`Processing interrupt from ${source}:`, interruptMessage);

      const payload = interruptMessage.content.payload;
      const toolName = interruptMessage.content.tool_name;

      // Handle threat updates based on tool name
      if (["add_threats", "edit_threats", "delete_threats"].includes(toolName)) {
        handleThreatUpdates(toolName, payload);
      }

      handleSendMessage(id, toolName);
    },
    [handleThreatUpdates, handleSendMessage, id]
  );

  const handleInterruptEvent = useCallback(
    (event) => {
      console.log(`Interrupt event received for id: ${id}`);

      // Check if response data is available
      if (!response?.item?.threat_list?.threats) {
        console.log(
          "Interrupt event received but threat model data not loaded yet - queuing for later processing"
        );
        // Queue the event for later processing
        pendingInterrupts.current.push(event);
        return;
      }

      // Process the event immediately if data is available
      processInterruptEvent(event);
    },
    [response, processInterruptEvent, id]
  );

  // Process pending interrupts when response data becomes available
  useEffect(() => {
    if (response?.item?.threat_list?.threats && pendingInterrupts.current.length > 0) {
      console.log(`Processing ${pendingInterrupts.current.length} pending interrupt(s)`);

      // Process all pending interrupts
      const interruptsToProcess = [...pendingInterrupts.current];
      pendingInterrupts.current = []; // Clear the queue first to prevent infinite loops

      interruptsToProcess.forEach((event) => {
        processInterruptEvent(event);
      });
    }
  }, [response, processInterruptEvent]);

  // Register the event receiver
  useEventReceiver("CHAT_INTERRUPT", id, handleInterruptEvent);

  const handleDownload = async (format = "docx") => {
    try {
      // Handle JSON export separately (no need for doc generation)
      if (format === "json") {
        downloadJSON(response?.item, response?.item?.title, base64Content);
        return;
      }

      const doc = await createThreatModelingDocument(
        response?.item?.title,
        response?.item?.description,
        base64Content,
        arrayToObjects("assumption", response?.item?.assumptions),
        response?.item?.assets?.assets,
        response?.item?.system_architecture?.data_flows,
        response?.item?.system_architecture?.trust_boundaries,
        response?.item?.system_architecture?.threat_sources,
        response?.item?.threat_list?.threats
      );
      const pdfDoc = await createThreatModelingPDF(
        base64Content,
        response?.item?.title,
        response?.item?.description,
        arrayToObjects("assumption", response?.item?.assumptions),
        response?.item?.assets?.assets,
        response?.item?.system_architecture?.data_flows,
        response?.item?.system_architecture?.trust_boundaries,
        response?.item?.system_architecture?.threat_sources,
        response?.item?.threat_list?.threats
      );

      if (format === "docx") {
        await downloadDocument(doc, response?.item?.title);
      } else if (format === "pdf") {
        downloadPDFDocument(pdfDoc, response?.item?.title);
      }
    } catch (error) {
      console.error(`Error generating ${format} document:`, error);
    }
  };

  const onBreadcrumbsClick = (e) => {
    e.preventDefault();
    navigate(e.detail.href);
  };

  const updateThreatModeling = useCallback(
    (type, index, newItem) => {
      const newState = { ...response };

      const updateArray = (array, index, newItem) => {
        if (newItem === null) {
          return array.filter((_, i) => i !== index);
        } else if (index === -1) {
          return [newItem, ...array];
        } else {
          return array.map((item, i) => (i === index ? newItem : item));
        }
      };

      const updateAssumptions = (array, index, newItem) => {
        if (newItem === undefined || newItem === null) {
          return array.filter((_, i) => i !== index);
        } else if (index === -1) {
          return [newItem, ...array];
        } else {
          return array.map((item, i) => (i === index ? newItem : item));
        }
      };

      switch (type) {
        case "threat_sources":
        case "trust_boundaries":
        case "data_flows":
          newState.item.system_architecture[type] = updateArray(
            newState.item.system_architecture[type],
            index,
            newItem
          );
          break;

        case "assets":
          newState.item.assets.assets = updateArray(newState.item.assets.assets, index, newItem);
          break;

        case "threats":
          newState.item.threat_list.threats = updateArray(
            newState.item.threat_list.threats,
            index,
            newItem
          );
          break;

        case "assumptions":
          newState.item.assumptions = updateAssumptions(
            newState.item.assumptions,
            index,
            newItem?.assumption
          );
          break;

        case "description":
          newState.item.description = newItem;
          break;

        default:
          throw new Error(`Invalid type: ${type}`);
      }

      initializeThreatModelSession(newState.item);
      setResponse(newState);
    },
    [response, setResponse, initializeThreatModelSession]
  );

  useEffect(() => {
    let intervalId;
    const checkStatus = async () => {
      if (!id) return;

      try {
        const statusResponse = await getThreatModelingStatus(id);
        const currentStatus = statusResponse.data.state;
        const retry = statusResponse.data.retry;
        const detail = statusResponse.data.detail;
        setIteration(retry);
        setTmDetail(detail);

        if (currentStatus === "COMPLETE") {
          clearInterval(intervalId);

          setLoading(true);
          try {
            const resultsResponse = await getThreatModelingResults(id);
            const architectureDiagram = await getDownloadUrl(resultsResponse.data.item.s3_location);
            const base64Data = await blobToBase64(architectureDiagram);
            setBase64Content(base64Data);
            setResponse(resultsResponse.data);
            if (!previousResponse.current) {
              previousResponse.current = JSON.parse(JSON.stringify(resultsResponse.data));
            }
            await initializeThreatModelSession(resultsResponse.data.item);

            setState((prevState) => ({
              ...prevState,
              processing: false,
              results: true,
            }));
          } catch (error) {
            console.error("Error getting threat modeling results:", error);
            setState((prevState) => ({
              ...prevState,
              processing: false,
              results: false,
            }));
            setTmStatus(null);
          } finally {
            setLoading(false);
          }
        } else if (currentStatus === "FAILED") {
          clearInterval(intervalId);
          setTmStatus(currentStatus);
          setState((prevState) => ({
            ...prevState,
            processing: false,
            results: false,
          }));
          setTmStatus(null);
          setLoading(false);
          showAlert("ErrorThreatModeling");
        } else if (currentStatus === "FINALIZE") {
          setTmStatus(currentStatus);
          setLoading(false);
        } else {
          setTmStatus(currentStatus);
          setState((prevState) => ({
            ...prevState,
            processing: true,
            results: false,
          }));
          setLoading(false);
        }
      } catch (error) {
        console.error("Error checking threat modeling status:", error);
        clearInterval(intervalId);
        setState((prevState) => ({
          ...prevState,
          processing: false,
          results: false,
        }));
        setTmStatus(null);
        setLoading(false);
      }
    };

    if (id) {
      checkStatus();
      intervalId = setInterval(checkStatus, 2000);
    }

    return () => clearInterval(intervalId);
  }, [id, trigger]); // Removed function dependencies that were causing loops

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteTm(response?.job_id);
      functions.clearSession(response?.job_id);
      navigate("/");
    } catch (error) {
      console.error("Error deleting threat modeling:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (idValue) => {
    if (!idValue) {
      return;
    }

    try {
      const statusResponse = await getThreatModelingTrail(idValue);
      setTrail(statusResponse.data);
    } catch (error) {
      console.error("Error fetching threat modeling trail:", error);
    }
  };

  const handleUpdateTm = async (viaAlert) => {
    try {
      if (viaAlert) {
        showAlert("Info", true);
      }

      const results = await updateTm(response?.job_id, response?.item);
      previousResponse.current = JSON.parse(JSON.stringify(response));
      checkChanges();
      showAlert("Success");
      return results;
    } catch (error) {
      showAlert("Error");
      console.error("Error updating threat modeling:", error);
    }
  };

  const checkChanges = () => {
    if (!response || !previousResponse.current) return;

    const hasChanges = JSON.stringify(response) !== JSON.stringify(previousResponse.current);
    if (hasChanges) {
      showAlert("Info");
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      await restoreTm(id);
      hideAlert();
    } catch (error) {
      setLoading(false);
      console.error("Error restoring threat modeling:", error);
    } finally {
      setTrigger(Math.floor(Math.random() * 100) + 1);
    }
  };

  useEffect(() => {
    if (response) {
      checkChanges();
    }
  }, [response]);

  return (
    <>
      <SpaceBetween size="xl">
        <BreadcrumbGroup items={breadcrumbs} ariaLabel="Breadcrumbs" onClick={onBreadcrumbsClick} />
        {alert.visible && alert.state !== "ErrorThreatModeling" && (
          <Alert
            dismissible
            onDismiss={hideAlert}
            statusIconAriaLabel={alert.state}
            type={alert.state.toLowerCase()}
            action={
              alert.state === "Info" && (
                <Button loading={alert.loading} onClick={() => handleUpdateTm(true)}>
                  {alertMessages[alert.state].button}
                </Button>
              )
            }
            header={alertMessages[alert.state].title}
          >
            {alertMessages[alert.state].msg}
          </Alert>
        )}
        <ThreatModelHeader
          title={response?.item?.title}
          showInsights={showInsights}
          onToggleInsights={(pressed) => setShowInsights(pressed)}
          actions={
            state?.results && (
              <ThreatModelActions
                onSave={handleUpdateTm}
                onDelete={() => setDeleteModal(true)}
                onReplay={() => setVisible(true)}
                onTrail={() => handleHelpButtonClick(<InfoContent context={"All"} />)}
                onDownload={handleDownload}
                isLightningMode={isLightningMode}
              />
            )
          }
        />
        <ThreatModelContent
          loading={loading}
          state={state}
          tmStatus={tmStatus}
          iteration={iteration}
          tmDetail={tmDetail}
          id={id}
          alert={alert}
          alertMessages={alertMessages}
          hideAlert={hideAlert}
          handleRestore={handleRestore}
          response={response}
          base64Content={base64Content}
          updateThreatModeling={updateThreatModeling}
          handleRefresh={handleRefresh}
          showInsights={showInsights}
        />
        <ReplayModalComponent
          handleReplay={handleReplayThreatModeling}
          visible={visible}
          setVisible={setVisible}
          setSplitPanelOpen={setSplitPanelOpen}
        />
      </SpaceBetween>
      <DeleteModal
        visible={deleteModalVisible}
        setVisible={setDeleteModal}
        handleDelete={handleDelete}
        title={response?.item?.title}
      ></DeleteModal>
    </>
  );
};
