import React, { useEffect, useState, useRef } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Header from "@cloudscape-design/components/header";
import ThreatModelingOutput from "./ResultsComponent";
import Processing from "./ProcessingComponent";
import { Button } from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";
import { useAlert } from "./hooks/useAlert";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import { useParams, useNavigate } from "react-router";
import { downloadDocument, downloadPDFDocument } from "./docs";
import createThreatModelingDocument from "./ResultsDocx";
import { createThreatModelingPDF } from "./ResutlPdf";
import { ReplayModalComponent } from "./ReplayModal";
import { Spinner } from "@cloudscape-design/components";
import DeleteModal from "./DeleteModal";
import {
  getThreatModelingStatus,
  getThreatModelingResults,
  getDownloadUrl,
  updateTm,
  deleteTm,
  startThreatModeling,
} from "../../services/ThreatDesigner/stats";
import "./ThreatModeling.css";

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

export const ThreatModel = ({ user }) => {
  const { id = null } = useParams();
  const BreadcrumbItems = [
    { text: "Threat Catalog", href: "/threat-catalog" },
    { text: `${id}`, href: `/${id}` },
  ];
  const [breadcrumbs, setBreadcrumbs] = useState(BreadcrumbItems);
  const [tmStatus, setTmStatus] = useState("START");
  const [iteration, setIteration] = useState(null);
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
  const navigate = useNavigate();
  const [deleteModalVisible, setDeleteModal] = useState(false);
  const handleReplayThreatModeling = async (iteration, reasoning) => {
    try {
      setIteration(0);
      setTmStatus("START");
      setState({ results: false, processing: true });
      setVisible(false);
      await startThreatModeling(
        null, // key
        iteration, // iteration
        reasoning,
        null, // title
        null, // description
        null, // assumptions
        true, // replay
        id // id
      );

      setTrigger(Math.floor(Math.random() * 100) + 1);
    } catch (error) {
      console.error("Error starting threat modeling:", error);
    } finally {
      previousResponse.current = null;
    }
  };

  const handleDownload = async (format = "docx") => {
    try {
      // Create DOCX document
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
      // Add error handling UI feedback here
    } finally {
    }
  };

  const onBreadcrumbsClick = (e) => {
    e.preventDefault();
    navigate(e.detail.href);
  };

  function updateThreatModeling(type, index, newItem) {
    const newState = { ...response };
    // Helper function to update arrays
    const updateArray = (array, index, newItem) => {
      if (newItem === null) {
        // Delete item at index
        return array.filter((_, i) => i !== index);
      } else if (index === -1) {
        // Add new item at the beginning
        return [newItem, ...array];
      } else {
        // Update item at index
        return array.map((item, i) => (i === index ? newItem : item));
      }
    };

    const updateAssumptions = (array, index, newItem) => {
      if (newItem === undefined || newItem === null) {
        // Delete item at index
        return array.filter((_, i) => i !== index);
      } else if (index === -1) {
        // Add new item at beginning
        return [newItem, ...array];
      } else {
        // Update item at index
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

    setResponse(newState);
  }

  useEffect(() => {
    let intervalId;
    const checkStatus = async () => {
      if (!id) return;

      try {
        const statusResponse = await getThreatModelingStatus(id);
        const currentStatus = statusResponse.data.state;
        const retry = statusResponse.data.retry;
        setIteration(retry);

        if (currentStatus === "COMPLETE") {
          // Stop polling first
          clearInterval(intervalId);

          setLoading(true); // Set loading once
          try {
            const resultsResponse = await getThreatModelingResults(id);
            const architectureDiagram = await getDownloadUrl(resultsResponse.data.item.s3_location);
            const base64Data = await blobToBase64(architectureDiagram);
            setBase64Content(base64Data);
            setResponse(resultsResponse.data);
            if (!previousResponse.current) {
              previousResponse.current = JSON.parse(JSON.stringify(resultsResponse.data));
            }
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
  }, [id, trigger]);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const results = await deleteTm(response?.job_id);
      navigate("/");
    } catch (error) {
      console.error("Error deleting threat modeling:", error);
    } finally {
      setLoading(false);
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
    } else {
    }
  };

  useEffect(() => {
    if (response) {
      checkChanges();
    }
  }, [response]);

  return (
    <>
      <SpaceBetween size="s">
        <BreadcrumbGroup items={breadcrumbs} ariaLabel="Breadcrumbs" onClick={onBreadcrumbsClick} />
        {alert.visible && (
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
        <Header
          variant="h1"
          actions={
            state?.results && (
              <SpaceBetween direction="horizontal" size="xs">
                <ButtonDropdown
                  fullWidth
                  onItemClick={(itemClickDetails) => {
                    if (itemClickDetails.detail.id === "sv") {
                      handleUpdateTm();
                    }
                    if (itemClickDetails.detail.id === "rm") {
                      setDeleteModal(true);
                      // handleDelete();
                    }
                    if (itemClickDetails.detail.id === "re") {
                      setVisible(true);
                    }
                  }}
                  items={[
                    { text: "Save", id: "sv", disabled: false },
                    { text: "Delete", id: "rm", disabled: false },
                    { text: "Replay", id: "re", disabled: false },
                  ]}
                >
                  Actions
                </ButtonDropdown>
                <ButtonDropdown
                  variant="primary"
                  fullWidth
                  onItemClick={(itemClickDetails) => {
                    if (itemClickDetails.detail.id === "cp-doc") {
                      handleDownload("docx");
                    }
                    if (itemClickDetails.detail.id === "cp-pdf") {
                      handleDownload("pdf");
                    }
                  }}
                  items={[
                    { text: "Docx", id: "cp-doc", disabled: false },
                    { text: "Pdf", id: "cp-pdf", disabled: false },
                  ]}
                >
                  Download
                </ButtonDropdown>
              </SpaceBetween>
            )
          }
        >
          {
            <SpaceBetween direction="horizontal" size="xs">
              <div>{response?.item?.title}</div>
            </SpaceBetween>
          }
        </Header>
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
              {state.processing && (
                <div style={{ width: "100%", marginTop: "200px" }}>
                  <Processing status={tmStatus} iteration={iteration} />
                </div>
              )}
              {state.results && (
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
                />
              )}
            </div>
          </>
        )}
        <ReplayModalComponent
          handleReplay={handleReplayThreatModeling}
          visible={visible}
          setVisible={setVisible}
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
