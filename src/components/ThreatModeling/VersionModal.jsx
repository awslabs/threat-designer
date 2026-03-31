import React, { useState, useCallback, useRef } from "react";
import Modal from "@cloudscape-design/components/modal";
import {
  Button,
  SpaceBetween,
  FormField,
  Box,
  Checkbox,
  Input,
  Textarea,
  TokenGroup,
} from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";
import { I18nProvider } from "@cloudscape-design/components/i18n";
import Slider from "@cloudscape-design/components/slider";
import StartComponent from "./StartComponent";

const REASONING_LABELS = [
  { value: "0", label: "None" },
  { value: "1", label: "Low" },
  { value: "2", label: "Medium" },
  { value: "3", label: "High" },
  { value: "4", label: "Max" },
];
const REASONING_REFERENCE_VALUES = [1, 2, 3];
const MAX_REASONING = 4;

export const VersionModalComponent = ({
  visible,
  setVisible,
  currentTitle = "",
  currentDescription = "",
  currentAssumptions = [],
  collaboratorCount = 0,
  onVersion,
}) => {
  const [title, setTitle] = useState(currentTitle);
  const [reasoning, setReasoning] = useState("0");
  const [description, setDescription] = useState(currentDescription);
  const [assumptions, setAssumptions] = useState(
    currentAssumptions.map((a, i) => ({ label: a, dismissLabel: `Remove ${a}` }))
  );
  const [newAssumption, setNewAssumption] = useState("");
  const [mirrorAttackTrees, setMirrorAttackTrees] = useState(true);
  const [mirrorSharing, setMirrorSharing] = useState(true);
  const [fileValue, setFileValue] = useState([]);
  const [fileError, setFileError] = useState(false);
  const [base64, setBase64] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [imageName, setImageName] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const wasVisible = useRef(false);

  // Reset state only on open transition (visible going from false → true)
  React.useEffect(() => {
    if (visible && !wasVisible.current) {
      setTitle(currentTitle);
      setDescription(currentDescription);
      setAssumptions(currentAssumptions.map((a) => ({ label: a, dismissLabel: `Remove ${a}` })));
      setReasoning("0");
      setMirrorAttackTrees(true);
      setMirrorSharing(true);
      setFileValue([]);
      setFileError(false);
      setBase64(null);
      setFileType(null);
      setImageName(null);
      setSubmitting(false);
      setNewAssumption("");
    }
    wasVisible.current = visible;
  }, [visible, currentTitle, currentDescription, currentAssumptions]);

  const handleBase64Change = useCallback((data) => {
    setBase64(data.value);
    setFileType(data.type);
    setImageName(data.name);
  }, []);

  const handleSubmit = async () => {
    if (!base64) return;
    setSubmitting(true);
    try {
      const assumptionsList = assumptions.map((a) => a.label);
      await onVersion({
        title,
        base64,
        fileType,
        description,
        assumptions: assumptionsList,
        reasoning,
        mirrorAttackTrees,
        mirrorSharing,
      });
    } catch (error) {
      console.error("Error starting version:", error);
      setSubmitting(false);
    }
  };

  const handleAddAssumption = () => {
    const trimmed = newAssumption.trim();
    if (trimmed) {
      setAssumptions((prev) => [...prev, { label: trimmed, dismissLabel: `Remove ${trimmed}` }]);
      setNewAssumption("");
    }
  };

  return (
    <Modal
      onDismiss={() => setVisible(false)}
      visible={visible}
      header="Create new version"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => setVisible(false)} variant="link">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="primary"
              disabled={!base64 || submitting}
              loading={submitting}
            >
              Create version
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <Alert>
          Upload a new architecture diagram to create a new version of this threat model. The
          existing assets, flows, boundaries, and threats will be updated to reflect the
          architecture changes.
        </Alert>

        <FormField label="Title" description="Name for the new version.">
          <Input
            onChange={({ detail }) => setTitle(detail.value)}
            value={title}
            placeholder="Threat model title"
          />
        </FormField>

        <FormField label="Architecture diagram" description="Upload the new architecture diagram.">
          <StartComponent
            onBase64Change={handleBase64Change}
            value={fileValue}
            setValue={setFileValue}
            error={fileError}
            setError={setFileError}
          />
        </FormField>

        <FormField
          label={
            <span>
              Description <i>- optional</i>
            </span>
          }
          description="Edit the system description if needed."
        >
          <Textarea
            onChange={({ detail }) => setDescription(detail.value)}
            value={description}
            placeholder="System description"
          />
        </FormField>

        <FormField
          label={
            <span>
              Assumptions <i>- optional</i>
            </span>
          }
          description="Edit assumptions about the system."
        >
          <SpaceBetween direction="vertical" size="xs">
            <SpaceBetween direction="horizontal" size="xs">
              <Textarea
                onChange={({ detail }) => setNewAssumption(detail.value)}
                value={newAssumption}
                placeholder="Add an assumption"
                rows={1}
              />
              <Button onClick={handleAddAssumption} disabled={!newAssumption.trim()}>
                Add
              </Button>
            </SpaceBetween>
            {assumptions.length > 0 && (
              <TokenGroup
                items={assumptions}
                onDismiss={({ detail: { itemIndex } }) => {
                  setAssumptions((prev) => prev.filter((_, i) => i !== itemIndex));
                }}
              />
            )}
          </SpaceBetween>
        </FormField>

        <FormField
          label="Reasoning boost"
          description="Controls the amount of thinking time for the version analysis."
        >
          <Slider
            i18nStrings={I18nProvider}
            onChange={({ detail }) => setReasoning(detail.value)}
            value={reasoning}
            valueFormatter={(value) =>
              REASONING_LABELS.find((item) => item.value === value.toString())?.label || ""
            }
            ariaDescription="From None to Max"
            max={MAX_REASONING}
            min={0}
            referenceValues={REASONING_REFERENCE_VALUES}
            step={1}
          />
        </FormField>

        <FormField label="Mirror options">
          <SpaceBetween direction="vertical" size="xs">
            <Checkbox
              checked={mirrorAttackTrees}
              onChange={({ detail }) => setMirrorAttackTrees(detail.checked)}
            >
              Mirror attack trees for matching threats
            </Checkbox>
            <Checkbox
              checked={mirrorSharing}
              onChange={({ detail }) => setMirrorSharing(detail.checked)}
              description={
                collaboratorCount > 0
                  ? `Shared with ${collaboratorCount} user${collaboratorCount > 1 ? "s" : ""}`
                  : undefined
              }
            >
              Mirror sharing settings
            </Checkbox>
          </SpaceBetween>
        </FormField>
      </SpaceBetween>
    </Modal>
  );
};
