import React, { useEffect } from "react";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import Button from "@cloudscape-design/components/button";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import TokenGroup from "@cloudscape-design/components/token-group";
import Grid from "@cloudscape-design/components/grid";
import ColumnLayout from "@cloudscape-design/components/column-layout";

export const ModalComponent = ({
  headers,
  data,
  index,
  updateData,
  visible,
  setVisible,
  action,
  type,
  hasColumn = false,
  columnConfig = null, // { left: ['field1', 'field2'], right: ['field3', 'field4'] }
}) => {
  const [formData, setFormData] = React.useState({
    ...data,
    mitigations: data.mitigations || [],
    prerequisites: data.prerequisites || [],
  });
  const [tempFormData, setTempFormData] = React.useState({
    ...data,
    mitigations: data.mitigations || [],
    prerequisites: data.prerequisites || [],
  });
  const [newMitigation, setNewMitigation] = React.useState("");
  const [newPrerequisite, setNewPrerequisite] = React.useState("");
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

  const validateForm = (formData) => {
    return headers.every((header) => {
      const key = header.toLowerCase();
      if (key === "mitigations") {
        return formData.mitigations && formData.mitigations.length > 0;
      }
      if (key === "prerequisites") {
        return formData.prerequisites && formData.prerequisites.length > 0;
      }
      return formData[key] && formData[key].trim() !== "";
    });
  };

  useEffect(() => {
    setIsFormValid(validateForm(tempFormData));
  }, [tempFormData]);

  const handleSave = () => {
    const updatedData = {
      ...tempFormData,
      mitigations: tempFormData.mitigations || [],
      prerequisites: tempFormData.prerequisites || [],
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
    setTempFormData(formData);
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

  const handleAddPrerequisite = () => {
    if (newPrerequisite.trim()) {
      const updatedPrerequisites = [...(tempFormData.prerequisites || []), newPrerequisite];
      setTempFormData((prev) => ({
        ...prev,
        prerequisites: updatedPrerequisites,
      }));
      setNewPrerequisite("");
    }
  };

  const handleRemovePrerequisite = (indexToRemove) => {
    const updatedPrerequisites = tempFormData.prerequisites.filter((_, i) => i !== indexToRemove);
    setTempFormData((prev) => ({
      ...prev,
      prerequisites: updatedPrerequisites,
    }));
  };

  useEffect(() => {
    setFormData({
      ...data,
      mitigations: data.mitigations || [],
      prerequisites: data.prerequisites || [],
    });
    setTempFormData({
      ...data,
      mitigations: data.mitigations || [],
      prerequisites: data.prerequisites || [],
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

    if (key === "prerequisites") {
      return (
        <FormField key={key} label={label}>
          <SpaceBetween direction="vertical" size="xs">
            <Grid gridDefinition={[{ colspan: { default: 8 } }, { colspan: { default: 4 } }]}>
              <Input
                value={newPrerequisite}
                onChange={({ detail }) => setNewPrerequisite(detail.value)}
                placeholder="Type new prerequisite"
              />
              <Button onClick={handleAddPrerequisite} disabled={!newPrerequisite.trim()}>
                Add
              </Button>
            </Grid>
            <TokenGroup
              items={(tempFormData.prerequisites || []).map((item, index) => ({
                label: item,
                dismissLabel: `Remove ${item}`,
                disabled: false,
              }))}
              onDismiss={({ detail }) => {
                handleRemovePrerequisite(detail.itemIndex);
              }}
            />
          </SpaceBetween>
        </FormField>
      );
    }

    // Special handling for description field - use Textarea
    if (key === "description") {
      return (
        <FormField key={key} label={label}>
          <Textarea
            onChange={({ detail }) => handleInputChange(key, detail.value)}
            value={tempFormData[key] || ""}
            placeholder={`Enter ${label.toLowerCase()}`}
            rows={3}
          />
        </FormField>
      );
    }

    // Special handling for example field - use Textarea
    if (key === "example") {
      return (
        <FormField key={key} label={label}>
          <Textarea
            onChange={({ detail }) => handleInputChange(key, detail.value)}
            value={tempFormData[key] || ""}
            placeholder={`Enter ${label.toLowerCase()}`}
            rows={3}
          />
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

  const renderContent = () => {
    if (hasColumn && columnConfig) {
      // Custom field distribution - specify exactly which fields go where
      const leftFields = columnConfig.left
        .map((headerName) => headers.find((h) => h.toLowerCase() === headerName.toLowerCase()))
        .filter(Boolean) // Remove any undefined values if field name doesn't exist
        .map((header) => renderField(header));

      const rightFields = columnConfig.right
        .map((headerName) => headers.find((h) => h.toLowerCase() === headerName.toLowerCase()))
        .filter(Boolean) // Remove any undefined values if field name doesn't exist
        .map((header) => renderField(header));

      return (
        <ColumnLayout borders="vertical" columns={2}>
          <SpaceBetween size="l">{leftFields}</SpaceBetween>
          <SpaceBetween size="l">{rightFields}</SpaceBetween>
        </ColumnLayout>
      );
    }

    if (hasColumn) {
      // Default even split when hasColumn is true but no columnConfig provided
      const fields = headers.map((header) => renderField(header));
      const midpoint = Math.ceil(fields.length / 2);
      const firstColumnFields = fields.slice(0, midpoint);
      const secondColumnFields = fields.slice(midpoint);

      return (
        <ColumnLayout borders="vertical" columns={2}>
          <SpaceBetween size="l">{firstColumnFields}</SpaceBetween>
          <SpaceBetween size="l">{secondColumnFields}</SpaceBetween>
        </ColumnLayout>
      );
    }

    // Default single column layout
    return <SpaceBetween size="xxl">{headers.map((header) => renderField(header))}</SpaceBetween>;
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={visible}
      size={hasColumn ? "large" : "medium"}
      header={`${action === "edit" ? "Edit" : "Add"} item`}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={handleSave} variant="primary" disabled={!isFormValid}>
              Save
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      {renderContent()}
    </Modal>
  );
};
