import { useCallback, useEffect, useState } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { SubmissionComponent } from "./SubmissionForm";
import { Modal } from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";
import { uploadFile } from "./docs";
import { useNavigate } from "react-router-dom";
import { startThreatModeling, generateUrl } from "../../services/ThreatDesigner/stats";
import GenAiButton from "../../components/ThreatModeling/GenAiButton";
import "./ThreatModeling.css";

export default function ThreatModeling() {
  const [iteration, setIteration] = useState({ label: "Auto", value: 0 });
  const [reasoning, setReasoning] = useState("1");
  const [base64Content, setBase64Content] = useState([]);
  const [id, setId] = useState(null);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const handleBase64Change = useCallback((base64) => {
    setBase64Content(base64);
  }, []);

  const handleStartThreatModeling = async (
    title,
    description,
    assumptions,
    applicationType,
    spaceId = null,
    methodology = "stride"
  ) => {
    setLoading(true);
    try {
      // Support both single file (legacy) and multiple files
      const filesArray = Array.isArray(base64Content) ? base64Content : [base64Content];
      const s3Locations = [];

      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        if (file && file.value) {
          const results = await generateUrl(file.type);
          await uploadFile(file.value, results?.data?.presigned, file.type);
          s3Locations.push(results?.data?.name);
        }
      }

      if (s3Locations.length === 0) {
        setLoading(false);
        return;
      }

      const response = await startThreatModeling(
        s3Locations,
        iteration?.value,
        reasoning,
        title,
        description,
        assumptions,
        false, // replay
        null, // id
        null, // instructions
        filesArray[0]?.type, // imageType (first file for backward compat)
        applicationType,
        spaceId,
        methodology
      );
      setLoading(false);
      setId(response.data.id);
    } catch (error) {
      console.error("Error starting threat modeling:", error);
      setLoading(false);
      // The endpoint returns real 4xx responses, so surface them. Staying silent here
      // just stops the spinner and leaves the user with no idea why nothing happened.
      setSubmitError(
        error.response?.data?.message || "The threat model could not be started. Please try again."
      );
    }
  };

  useEffect(() => {
    if (id) {
      navigate(`/${id}`);
    }
  }, [id, navigate]);

  return (
    <SpaceBetween size="s">
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ marginTop: "200px" }}>
          <GenAiButton
            onClick={() => {
              setVisible(true);
            }}
          >
            Submit Threat Model
          </GenAiButton>
        </div>
      </div>
      <Modal
        onDismiss={() => {
          setVisible(false);
          setSubmitError(null);
        }}
        visible={visible}
        size="large"
        header={"Threat model"}
      >
        {submitError && (
          <Alert
            type="error"
            header="Could not start threat modeling"
            dismissible
            onDismiss={() => setSubmitError(null)}
          >
            {submitError}
          </Alert>
        )}
        <SubmissionComponent
          onBase64Change={handleBase64Change}
          iteration={iteration}
          setIteration={setIteration}
          setVisible={setVisible}
          handleStart={handleStartThreatModeling}
          loading={loading}
          reasoning={reasoning}
          setReasoning={setReasoning}
        />
      </Modal>
    </SpaceBetween>
  );
}
