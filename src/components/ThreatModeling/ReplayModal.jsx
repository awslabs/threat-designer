import React, { useState } from "react";
import Modal from "@cloudscape-design/components/modal";
import { Button, SpaceBetween, FormField, Select, Box } from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";
import { I18nProvider } from "@cloudscape-design/components/i18n";
import Slider from "@cloudscape-design/components/slider";
import Textarea from "@cloudscape-design/components/textarea";

export const ReplayModalComponent = ({ handleReplay, visible, setVisible, setSplitPanelOpen }) => {
  const [iteration, setIteration] = useState({ label: "Auto", value: 0 });
  const [reasoning, setReasoning] = useState("0");
  const [text, setText] = useState(null);
  const isReasoningEnabled = import.meta.env.VITE_REASONING_ENABLED === "true";

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
                handleReplay(iteration?.value, reasoning, text);
              }}
              variant="primary"
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
            description="Determine the number of runs needed to generate the threat catalog. Increasing the number of runs will result in a more comprehensive and detailed threat catalog."
            label="Iterations"
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
                [
                  { value: "0", label: "None" },
                  { value: "1", label: "Low" },
                  { value: "2", label: "Medium" },
                  { value: "3", label: "High" },
                ].find((item) => item.value === value.toString())?.label || ""
              }
              ariaDescription="From None to High"
              max={3}
              min={0}
              referenceValues={[1, 2]}
              step={1}
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
