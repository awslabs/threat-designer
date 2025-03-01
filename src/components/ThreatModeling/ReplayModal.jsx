import React, { useState } from "react";
import Modal from "@cloudscape-design/components/modal";
import {
  Button,
  SpaceBetween,
  FormField,
  Select,
  Box,
  Toggle,
} from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";

export const ReplayModalComponent = ({ handleReplay, visible, setVisible }) => {
  const [iteration, setIteration] = useState({ label: "Auto", value: 0 });
  const [reasoning, setReasoning] = useState(false);
  const isReasoningEnabled = import.meta.env.VITE_REASONING_ENABLED === "true"

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
                handleReplay(iteration?.value, reasoning);
              }}
              variant="link"
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
                { label: "4", value: 4 },
                { label: "5", value: 5 },
                { label: "10", value: 10 },
                { label: "15", value: 15 },
              ]}
              selectedOption={iteration}
              triggerVariant="option"
              onChange={({ detail }) => setIteration(detail.selectedOption)}
            />
          </FormField>
          <Toggle onChange={({ detail }) => setReasoning(detail.checked)} checked={reasoning} disabled={!isReasoningEnabled}>
            Reasoning boost
          </Toggle>
        </SpaceBetween>
      </SpaceBetween>
    </Modal>
  );
};
