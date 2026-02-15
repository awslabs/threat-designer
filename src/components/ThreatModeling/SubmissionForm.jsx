import React from "react";
import Wizard from "@cloudscape-design/components/wizard";
import StartComponent from "./StartComponent";
import {
  Header,
  FormField,
  Input,
  SpaceBetween,
  Button,
  Select,
  Grid,
  TokenGroup,
  Popover,
  Box,
  Link,
} from "@cloudscape-design/components";
import { I18nProvider } from "@cloudscape-design/components/i18n";
import Slider from "@cloudscape-design/components/slider";
import FileTokenGroup from "@cloudscape-design/components/file-token-group";
import Textarea from "@cloudscape-design/components/textarea";

function convertArrayToObjects(arr) {
  return arr.map((item) => ({
    label: item,
    dismissLabel: `Remove ${item}`,
  }));
}

export const SubmissionComponent = ({
  onBase64Change,
  base64Content,
  iteration,
  setIteration,
  handleStart,
  loading,
  reasoning,
  setReasoning,
}) => {
  const isReasoningEnabled = import.meta.env.VITE_REASONING_ENABLED === "true";
  const isOpenAI = import.meta.env.VITE_MODEL_PROVIDER === "openai";
  const maxReasoning = isOpenAI ? 3 : 4;
  const reasoningLabels = [
    { value: "0", label: "None" },
    { value: "1", label: "Low" },
    { value: "2", label: "Medium" },
    { value: "3", label: "High" },
    ...(!isOpenAI ? [{ value: "4", label: "Max" }] : []),
  ];
  const reasoningReferenceValues = isOpenAI ? [1, 2] : [1, 2, 3];
  const [activeStepIndex, setActiveStepIndex] = React.useState(0);
  const [value, setValue] = React.useState([]);
  const [title, setTitle] = React.useState("");
  const [newAssumption, setNewAssumption] = React.useState("");
  const [assumptions, setAssumptions] = React.useState([]);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState(false);
  const [applicationType, setApplicationType] = React.useState({
    label: "Hybrid",
    value: "hybrid",
  });
  const handleAddAssumption = () => {
    if (newAssumption.trim()) {
      setAssumptions((prev) => [...prev, newAssumption.trim()]);
      setNewAssumption("");
    }
  };

  const handleRemoveAssumption = (index) => {
    setAssumptions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Wizard
      i18nStrings={{
        stepNumberLabel: (stepNumber) => `Step ${stepNumber}`,
        collapsedStepsLabel: (stepNumber, stepsCount) => `Step ${stepNumber} of ${stepsCount}`,
        skipToButtonLabel: (step) => `Skip to ${step.title}`,
        navigationAriaLabel: "Steps",
        previousButton: "Previous",
        nextButton: "Next",
        optional: "optional",
      }}
      onNavigate={({ detail }) => {
        if (detail.reason === "next") {
          if (!value[0] && detail.requestedStepIndex === 2) {
            setError(true);
          } else if (title.length === 0 && detail.requestedStepIndex === 1) {
            setError(true);
          } else {
            setError(false);
            setActiveStepIndex(detail.requestedStepIndex);
          }
        }
        if (detail.reason === "previous") {
          setError(false);
          setActiveStepIndex(detail.requestedStepIndex);
        }
      }}
      activeStepIndex={activeStepIndex}
      submitButtonText="Start threat modeling"
      isLoadingNextStep={loading}
      onSubmit={() => {
        handleStart(title, text, assumptions, applicationType.value);
      }}
      steps={[
        {
          title: "Title",
          description: "Provide a meaningful title for the threat model.",
          content: (
            <div style={{ minHeight: 200 }}>
              <FormField errorText={error ? "Title is required." : null}>
                <Input value={title} onChange={(event) => setTitle(event.detail.value)} />
              </FormField>
            </div>
          ),
        },
        {
          title: "Architecture diagram",
          description: "Only png/jpeg accepted. Maximum image size (8,000 px x 8,000 px) 3.75 MB.",
          content: (
            <div style={{ minHeight: 200 }}>
              <StartComponent
                onBase64Change={onBase64Change}
                base64Content={base64Content}
                value={value}
                setValue={setValue}
                error={error}
                setError={setError}
              />
            </div>
          ),
        },
        {
          title: "Details",
          description: "Provide details about your application to help scope the threat model.",
          content: (
            <div style={{ minHeight: 200 }}>
              <SpaceBetween size="s">
                <FormField
                  label="Application type"
                  info={
                    <Popover
                      header="Application type"
                      content={
                        <SpaceBetween size="s">
                          <Box>
                            <Box variant="h5">Internal</Box>
                            Accessible only within a private network. Reduced external threat
                            exposure, but insider threats and misconfigurations remain relevant.
                          </Box>
                          <Box>
                            <Box variant="h5">Hybrid</Box>
                            Both internal and external-facing components. Public parts get full
                            rigor, internal parts reflect reduced exposure.
                          </Box>
                          <Box>
                            <Box variant="h5">Public facing</Box>
                            Internet-facing, accessible by anonymous users. Subject to constant
                            automated attacks and broad threat actor exposure.
                          </Box>
                        </SpaceBetween>
                      }
                    >
                      <Link variant="info">Info</Link>
                    </Popover>
                  }
                >
                  <Select
                    options={[
                      { label: "Internal", value: "internal" },
                      { label: "Hybrid", value: "hybrid" },
                      { label: "Public facing", value: "public_facing" },
                    ]}
                    selectedOption={applicationType}
                    onChange={({ detail }) => setApplicationType(detail.selectedOption)}
                  />
                </FormField>
                <FormField
                  label="Description"
                  info={
                    <Popover
                      header="Description tips"
                      content={
                        <SpaceBetween size="s">
                          <Box>
                            Use this field to provide context that can't be inferred from the
                            architecture diagram alone. For example:
                          </Box>
                          <Box>
                            <Box variant="h5">Data sensitivity</Box>
                            What types of data does the system handle? (PII, financial records,
                            health data, credentials)
                          </Box>
                          <Box>
                            <Box variant="h5">User base and access</Box>
                            Who uses the system? Internal employees, external customers, third-party
                            partners?
                          </Box>
                          <Box>
                            <Box variant="h5">Compliance requirements</Box>
                            Any regulatory frameworks that apply? (GDPR, HIPAA, PCI-DSS, SOC 2)
                          </Box>
                          <Box>
                            <Box variant="h5">Deployment context</Box>
                            Cloud provider, on-premises, hybrid? Multi-region? Shared tenancy?
                          </Box>
                        </SpaceBetween>
                      }
                    >
                      <Link variant="info">Info</Link>
                    </Popover>
                  }
                >
                  <Textarea
                    onChange={({ detail }) => setText(detail.value)}
                    value={text}
                    placeholder="Add your description"
                  />
                </FormField>
              </SpaceBetween>
            </div>
          ),
          isOptional: true,
        },
        {
          title: "Agent configuration",
          description: "Configure the agent's iteration count and reasoning level.",
          content: (
            <div style={{ minHeight: 200 }}>
              <SpaceBetween size="s">
                <FormField
                  label="Iterations"
                  info={
                    <Popover
                      header="Iterations"
                      content={
                        <Box>
                          Determines the number of runs needed to generate the threat catalog.
                          Increasing the number of runs will result in a more comprehensive and
                          detailed threat catalog. Use "Auto" to let the agent decide.
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
              </SpaceBetween>
            </div>
          ),
          isOptional: true,
        },
        {
          title: "Provide assumptions",
          description:
            "Establish the baseline security context and boundaries that help identify what's in scope for analysis and what potential threats are relevant to consider.",
          content: (
            <div style={{ minHeight: 200 }}>
              <SpaceBetween direction="vertical" size="xs">
                <Grid gridDefinition={[{ colspan: { default: 8 } }, { colspan: { default: 4 } }]}>
                  <Input
                    value={newAssumption}
                    onChange={({ detail }) => setNewAssumption(detail.value)}
                    placeholder="Type new assumption"
                  />
                  <Button
                    onClick={handleAddAssumption}
                    disabled={!newAssumption.trim()}
                    ariaLabel="Add new assumption"
                  >
                    Add
                  </Button>
                </Grid>
                <TokenGroup
                  items={assumptions.map((item) => ({
                    label: item,
                    dismissLabel: `Remove ${item}`,
                    disabled: false,
                  }))}
                  onDismiss={({ detail }) => {
                    handleRemoveAssumption(detail.itemIndex);
                  }}
                />
              </SpaceBetween>
            </div>
          ),
          isOptional: true,
        },
        {
          title: "Review and launch",
          content: (
            <div style={{ minHeight: 250 }}>
              <SpaceBetween size="xl">
                {title.length > 0 && (
                  <SpaceBetween size="xs">
                    <Header
                      variant="h3"
                      actions={
                        <Button onClick={() => setActiveStepIndex(0)} ariaLabel="Edit title">
                          Edit
                        </Button>
                      }
                    >
                      Step 1: Title
                    </Header>
                    <Input
                      onChange={({ detail }) => setTitle(detail.value)}
                      value={title}
                      disabled
                    />
                  </SpaceBetween>
                )}
                {value[0] && (
                  <SpaceBetween size="xs">
                    <Header
                      variant="h3"
                      actions={
                        <Button
                          onClick={() => setActiveStepIndex(1)}
                          ariaLabel="Edit architecture diagram"
                        >
                          Edit
                        </Button>
                      }
                    >
                      Step 2: Architecture diagram
                    </Header>
                    <FileTokenGroup
                      i18nStrings={{
                        removeFileAriaLabel: (e) => `Remove file ${e + 1}`,
                        limitShowFewer: "Show fewer files",
                        limitShowMore: "Show more files",
                        errorIconAriaLabel: "Error",
                        warningIconAriaLabel: "Warning",
                      }}
                      items={[
                        {
                          file: value[0],
                        },
                      ]}
                      readOnly
                      showFileLastModified
                      showFileThumbnail
                      showFileSize
                    />
                  </SpaceBetween>
                )}
                {(text.length > 0 || applicationType) && (
                  <SpaceBetween size="xs">
                    <Header
                      variant="h3"
                      actions={
                        <Button onClick={() => setActiveStepIndex(2)} ariaLabel="Edit details">
                          Edit
                        </Button>
                      }
                    >
                      Step 3: Details
                    </Header>
                    {text.length > 0 && (
                      <Textarea
                        onChange={({ detail }) => setText(detail.value)}
                        value={text}
                        placeholder="Add your description"
                        disabled
                      />
                    )}
                    <FormField label="Application type">
                      <Input value={applicationType.label} disabled />
                    </FormField>
                  </SpaceBetween>
                )}
                {iteration && (
                  <SpaceBetween size="xs">
                    <Header
                      variant="h3"
                      actions={
                        <Button onClick={() => setActiveStepIndex(3)} ariaLabel="Edit iterations">
                          Edit
                        </Button>
                      }
                    >
                      Step 4: Agent configuration
                    </Header>
                    <FormField>
                      <Select
                        disabled
                        options={[
                          { label: "1", value: "1" },
                          { label: "2", value: "2" },
                          { label: "3", value: "3" },
                          { label: "4", value: "4" },
                          { label: "5", value: "5" },
                        ]}
                        selectedOption={iteration}
                        triggerVariant="option"
                        onChange={({ detail }) => setIteration(detail.selectedOption)}
                      />
                    </FormField>
                    <Slider
                      i18nStrings={I18nProvider}
                      readOnly={true}
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
                  </SpaceBetween>
                )}
                {assumptions.length > 0 && (
                  <SpaceBetween size="xs">
                    <Header
                      variant="h3"
                      actions={
                        <Button onClick={() => setActiveStepIndex(4)} ariaLabel="Edit assumptions">
                          Edit
                        </Button>
                      }
                    >
                      Step 5: Assumptions
                    </Header>
                    <FormField>
                      <TokenGroup items={convertArrayToObjects(assumptions)} readOnly />
                    </FormField>
                  </SpaceBetween>
                )}
              </SpaceBetween>
            </div>
          ),
        },
      ]}
    />
  );
};
