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
} from "@cloudscape-design/components";
import { I18nProvider } from "@cloudscape-design/components/i18n";
import Slider from "@cloudscape-design/components/slider";
import FileTokenGroup from "@cloudscape-design/components/file-token-group";
import Textarea from "@cloudscape-design/components/textarea";

function convertArrayToObjects(arr) {
  return arr.map((item, index) => ({
    label: item,
    dismissLabel: `Remove ${item}`,
  }));
}

export const SubmissionComponent = ({
  onBase64Change,
  base64Content,
  iteration,
  setIteration,
  setVisible,
  handleStart,
  loading,
  reasoning,
  setReasoning,
}) => {
  const isReasoningEnabled = import.meta.env.VITE_REASONING_ENABLED === "true";
  const [activeStepIndex, setActiveStepIndex] = React.useState(0);
  const [value, setValue] = React.useState([]);
  const [title, setTitle] = React.useState("");
  const [newAssumption, setNewAssumption] = React.useState("");
  const [assumptions, setAssumptions] = React.useState([]);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState(false);
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
        skipToButtonLabel: (step, stepNumber) => `Skip to ${step.title}`,
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
        handleStart(title, text, assumptions);
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
          title: "Description",
          description:
            "Provide a clear description of your application/system to help identify potential security concerns and establish the scope of the threat model.",
          content: (
            <div style={{ minHeight: 200 }}>
              <FormField>
                <Textarea
                  onChange={({ detail }) => setText(detail.value)}
                  value={text}
                  placeholder="Add your description"
                />
              </FormField>
            </div>
          ),
          isOptional: true,
        },
        {
          title: "Select iterations",
          description:
            "Determine the number of runs needed to generate the threat catalog. Increasing the number of runs will result in a more comprehensive and detailed threat catalog.",
          content: (
            <div style={{ minHeight: 200 }}>
              <SpaceBetween size="s">
                <FormField>
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
                  <Button onClick={handleAddAssumption} disabled={!newAssumption.trim()}>
                    Add
                  </Button>
                </Grid>
                <TokenGroup
                  items={assumptions.map((item, index) => ({
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
                      actions={<Button onClick={() => setActiveStepIndex(0)}>Edit</Button>}
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
                      actions={<Button onClick={() => setActiveStepIndex(1)}>Edit</Button>}
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
                {text.length > 0 && (
                  <SpaceBetween size="xs">
                    <Header
                      variant="h3"
                      actions={<Button onClick={() => setActiveStepIndex(2)}>Edit</Button>}
                    >
                      Step 3: Description
                    </Header>
                    <Textarea
                      onChange={({ detail }) => setText(detail.value)}
                      value={text}
                      placeholder="Add your description"
                      disabled
                    />
                  </SpaceBetween>
                )}
                {iteration && (
                  <SpaceBetween size="xs">
                    <Header
                      variant="h3"
                      actions={<Button onClick={() => setActiveStepIndex(3)}>Edit</Button>}
                    >
                      Step 4: Iterations
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
                  </SpaceBetween>
                )}
                {assumptions.length > 0 && (
                  <SpaceBetween size="xs">
                    <Header
                      variant="h3"
                      actions={<Button onClick={() => setActiveStepIndex(4)}>Edit</Button>}
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
