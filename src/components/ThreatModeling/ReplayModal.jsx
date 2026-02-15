import React, { useState } from "react";
import Modal from "@cloudscape-design/components/modal";
import {
  Button,
  SpaceBetween,
  FormField,
  Select,
  Box,
  Popover,
  Link,
} from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";
import { I18nProvider } from "@cloudscape-design/components/i18n";
import Slider from "@cloudscape-design/components/slider";
import Textarea from "@cloudscape-design/components/textarea";

export const ReplayModalComponent = ({
  handleReplay,
  visible,
  setVisible,
  setSplitPanelOpen,
  currentApplicationType = "hybrid",
}) => {
  const [iteration, setIteration] = useState({ label: "Auto", value: 0 });
  const [reasoning, setReasoning] = useState("0");
  const [text, setText] = useState(null);
  const [applicationType, setApplicationType] = useState(null);
  const isReasoningEnabled = import.meta.env.VITE_REASONING_ENABLED === "true";
  const isOpenAI = import.meta.env.VITE_MODEL_PROVIDER === "openai";
  const maxReasoning = isOpenAI ? 3 : 4;

  const applicationTypeOptions = [
    { label: "Internal", value: "internal" },
    { label: "Hybrid", value: "hybrid" },
    { label: "Public facing", value: "public_facing" },
  ];

  const effectiveApplicationType =
    applicationType ||
    applicationTypeOptions.find((o) => o.value === currentApplicationType) ||
    applicationTypeOptions[1];

  const reasoningLabels = [
    { value: "0", label: "None" },
    { value: "1", label: "Low" },
    { value: "2", label: "Medium" },
    { value: "3", label: "High" },
    ...(!isOpenAI ? [{ value: "4", label: "Max" }] : []),
  ];
  const reasoningReferenceValues = isOpenAI ? [1, 2] : [1, 2, 3];

  return (
    <Modal
      onDismiss={() => setVisible(false)}
      visible={visible}
      header={"Replay threat cataloging"}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              onClick={() => {
                setSplitPanelOpen(false);
                handleReplay(iteration?.value, reasoning, text, effectiveApplicationType.value);
              }}
              variant="primary"
              ariaLabel="Start threat catalog replay"
            >
              Replay
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="xl">
        <Alert>
          Please ensure you have saved your local changes. The threat catalog replay uses the latest
          saved data.
        </Alert>
        <SpaceBetween direction="vertical" size="s">
          <FormField
            label="Iterations"
            info={
              <Popover
                header="Iterations"
                content={
                  <Box>
                    Determines the number of runs needed to generate the threat catalog. Increasing
                    the number of runs will result in a more comprehensive and detailed threat
                    catalog. Use "Auto" to let the agent decide.
                  </Box>
                }
              >
                <Link variant="info">Info</Link>
              </Popover>
            }
            description="Number of threat cataloging runs."
          >
            <Select
              options={[
                { label: "Auto", value: 0 },
                { label: "1", value: 1 },
                { label: "2", value: 2 },
                { label: "3", value: 3 },
                { label: "5", value: 5 },
                { label: "7", value: 7 },
                { label: "10", value: 10 },
              ]}
              selectedOption={iteration}
              triggerVariant="option"
              onChange={({ detail }) => setIteration(detail.selectedOption)}
            />
          </FormField>
          <FormField
            label="Reasoning boost"
            description="Controls the amount of time the model spends thinking before responding."
          >
            <Slider
              i18nStrings={I18nProvider}
              disabled={!isReasoningEnabled}
              onChange={({ detail }) => setReasoning(detail.value)}
              value={reasoning}
              valueFormatter={(value) =>
                reasoningLabels.find((item) => item.value === value.toString())?.label || ""
              }
              ariaDescription={isOpenAI ? "From None to High" : "From None to Max"}
              max={maxReasoning}
              min={0}
              referenceValues={reasoningReferenceValues}
              step={1}
            />
          </FormField>
          <FormField
            label="Application type"
            info={
              <Popover
                header="Application type"
                content={
                  <SpaceBetween size="s">
                    <Box>
                      <Box variant="h5">Internal</Box>
                      Accessible only within a private network. Reduced external threat exposure,
                      but insider threats and misconfigurations remain relevant.
                    </Box>
                    <Box>
                      <Box variant="h5">Hybrid</Box>
                      Both internal and external-facing components. Public parts get full rigor,
                      internal parts reflect reduced exposure.
                    </Box>
                    <Box>
                      <Box variant="h5">Public facing</Box>
                      Internet-facing, accessible by anonymous users. Subject to constant automated
                      attacks and broad threat actor exposure.
                    </Box>
                  </SpaceBetween>
                }
              >
                <Link variant="info">Info</Link>
              </Popover>
            }
          >
            <Select
              options={applicationTypeOptions}
              selectedOption={effectiveApplicationType}
              onChange={({ detail }) => setApplicationType(detail.selectedOption)}
            />
          </FormField>
          {/* <div style={{ minHeight: 200 }}> */}
          <FormField
            label={
              <span>
                Additional instructions <i>- optional</i>{" "}
              </span>
            }
            description="Provide additional instructions to instruct the agent."
          >
            <Textarea
              onChange={({ detail }) => setText(detail.value)}
              value={text}
              placeholder="Add your instructions"
            />
          </FormField>
          {/* </div> */}
        </SpaceBetween>
      </SpaceBetween>
    </Modal>
  );
};
