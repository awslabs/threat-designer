import React, { useEffect } from "react";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import Button from "@cloudscape-design/components/button";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import TokenGroup from "@cloudscape-design/components/token-group";
import Grid from "@cloudscape-design/components/grid";

export const ModalComponent = ({
  headers,
  data,
  index,
  updateData,
  visible,
  setVisible,
  action,
  type,
}) => {
  const [formData, setFormData] = React.useState({
    ...data,
    mitigations: data.mitigations || [],
  });
  const [tempFormData, setTempFormData] = React.useState({
    ...data,
    mitigations: data.mitigations || [],
  });
  const [newMitigation, setNewMitigation] = React.useState("");
  const [isFormValid, setIsFormValid] = React.useState(false);

  const EnumOptions = {
    type: [
      { label: "Asset", value: "Asset" },
      { label: "Entity", value: "Entity" },
    ],
    likelihood: [
      { label: "High", value: "High" },
      { label: "Medium", value: "Medium" },
      { label: "Low", value: "Low" },
    ],
  };

  const handleInputChange = (key, value) => {
    setTempFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Add this validation function
  const validateForm = (formData) => {
    // Check if all headers have corresponding non-empty values
    return headers.every((header) => {
      const key = header.toLowerCase();
      if (key === "mitigations") {
        return formData.mitigations && formData.mitigations.length > 0;
      }
      return formData[key] && formData[key].trim() !== "";
    });
  };

  // Add useEffect to check form validity whenever tempFormData changes
  useEffect(() => {
    setIsFormValid(validateForm(tempFormData));
  }, [tempFormData]);

  const handleSave = () => {
    const updatedData = {
      ...tempFormData,
      mitigations: tempFormData.mitigations || [],
    };
    setFormData(updatedData);
    if (action === "edit") {
      updateData(type, index, updatedData);
    }
    if (action === "add") {
      updateData(type, -1, updatedData);
    }
    setVisible(false);
  };

  const handleDismiss = () => {
    setTempFormData(formData); // Reset to original data
    setVisible(false);
  };

  const handleAddMitigation = () => {
    if (newMitigation.trim()) {
      const updatedMitigations = [...(tempFormData.mitigations || []), newMitigation];
      setTempFormData((prev) => ({
        ...prev,
        mitigations: updatedMitigations,
      }));
      setNewMitigation("");
    }
  };

  const handleRemoveMitigation = (indexToRemove) => {
    const updatedMitigations = tempFormData.mitigations.filter((_, i) => i !== indexToRemove);
    setTempFormData((prev) => ({
      ...prev,
      mitigations: updatedMitigations,
    }));
  };

  useEffect(() => {
    setFormData({
      ...data,
      mitigations: data.mitigations || [],
    });
    setTempFormData({
      ...data,
      mitigations: data.mitigations || [],
    });
  }, [data]);

  const renderField = (header) => {
    const key = header.toLowerCase();
    const label = header
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    if (key === "mitigations") {
      return (
        <FormField key={key} label={label}>
          <SpaceBetween direction="vertical" size="xs">
            <Grid gridDefinition={[{ colspan: { default: 8 } }, { colspan: { default: 4 } }]}>
              <Input
                value={newMitigation}
                onChange={({ detail }) => setNewMitigation(detail.value)}
                placeholder="Type new mitigation"
              />
              <Button onClick={handleAddMitigation} disabled={!newMitigation.trim()}>
                Add
              </Button>
            </Grid>
            <TokenGroup
              items={(tempFormData.mitigations || []).map((item, index) => ({
                label: item,
                dismissLabel: `Remove ${item}`,
                disabled: false,
              }))}
              onDismiss={({ detail }) => {
                handleRemoveMitigation(detail.itemIndex);
              }}
            />
          </SpaceBetween>
        </FormField>
      );
    }

    if (key in EnumOptions) {
      return (
        <FormField key={key} label={label}>
          <Select
            selectedOption={
              tempFormData[key]
                ? EnumOptions[key].find((opt) => opt.value === tempFormData[key])
                : null
            }
            onChange={({ detail }) => handleInputChange(key, detail.selectedOption.value)}
            options={EnumOptions[key]}
          />
        </FormField>
      );
    }

    return (
      <FormField key={key} label={label}>
        <Input
          onChange={({ detail }) => handleInputChange(key, detail.value)}
          value={tempFormData[key] || ""}
        />
      </FormField>
    );
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={visible}
      size="medium"
      header={`${action === "edit" ? "Edit" : "Add"} item`}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={handleSave} variant="link" disabled={!isFormValid}>
              Save
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="xxl">{headers.map((header) => renderField(header))}</SpaceBetween>
    </Modal>
  );
};
