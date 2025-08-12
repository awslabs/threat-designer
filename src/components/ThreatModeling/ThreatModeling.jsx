import React, { useEffect, useState } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { SubmissionComponent } from "./SubmissionForm";
import { Modal } from "@cloudscape-design/components";
import { useAlert } from "./hooks/useAlert";
import { uploadFile } from "./docs";
import { useNavigate } from "react-router-dom";
import { startThreatModeling, generateUrl } from "../../services/ThreatDesigner/stats";
import GenAiButton from "../../components/ThreatModeling/GenAiButton";
import "./ThreatModeling.css";

export default function ThreatModeling({ user }) {
  const [iteration, setIteration] = useState({ label: "Auto", value: 0 });
  const [reasoning, setReasoning] = useState("0");
  const [base64Content, setBase64Content] = useState([]);
  const [id, setId] = useState(null);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleBase64Change = (base64) => {
    setBase64Content(base64);
  };

  const handleStartThreatModeling = async (title, description, assumptions) => {
    setLoading(true);
    try {
      const results = await generateUrl(base64Content?.type);
      await uploadFile(base64Content?.value, results?.data?.presigned, base64Content?.type);
      const response = await startThreatModeling(
        results?.data?.name,
        iteration?.value,
        reasoning,
        title,
        description,
        assumptions
      );
      setLoading(false);
      setId(response.data.id);
    } catch (error) {
      console.error("Error starting threat modeling:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      navigate(`/${id}`);
    }
  }, [id]);

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
        onDismiss={() => setVisible(false)}
        visible={visible}
        size="large"
        header={"Threat model"}
      >
        <SubmissionComponent
          onBase64Change={handleBase64Change}
          base64Content={base64Content}
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
