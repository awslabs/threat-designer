import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Modal,
  Box,
  SpaceBetween,
  FormField,
  Textarea,
  Select,
  Button,
} from "@cloudscape-design/components";

/**
 * GateEditModal - Modal for editing gate node type and description
 */
const GateEditModal = ({ visible, nodeData, onSave, onCancel }) => {
  const [label, setLabel] = useState("");
  const [gateType, setGateType] = useState(null);
  const [isFormValid, setIsFormValid] = useState(false);

  const gateTypeOptions = [
    { label: "AND Gate", value: "AND" },
    { label: "OR Gate", value: "OR" },
  ];

  // Initialize form data when modal opens or nodeData changes
  useEffect(() => {
    if (visible && nodeData) {
      // Handle both direct data and nested data structure
      const data = nodeData.data || nodeData;
      setLabel(data.label || nodeData.label || "");
      const selectedGateType = gateTypeOptions.find(
        (opt) => opt.value === (data.gateType || nodeData.gateType)
      );
      setGateType(selectedGateType || null);
    }
  }, [visible, nodeData]);

  // Validate form
  useEffect(() => {
    setIsFormValid(label.trim() !== "" && gateType !== null);
  }, [label, gateType]);

  const handleSave = () => {
    if (!isFormValid) return;

    const updatedData = {
      label: label.trim(),
      gateType: gateType.value,
    };

    onSave(nodeData.id, updatedData);
    handleDismiss();
  };

  const handleDismiss = () => {
    // Reset form
    setLabel("");
    setGateType(null);
    onCancel();
  };

  if (!nodeData) return null;

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      header="Edit Gate Node"
      size="medium"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={handleDismiss} variant="link">
              Cancel
            </Button>
            <Button onClick={handleSave} variant="primary" disabled={!isFormValid}>
              Save
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="l">
        <FormField label="Gate Type" description="Select the logical operation for this gate">
          <Select
            selectedOption={gateType}
            onChange={({ detail }) => setGateType(detail.selectedOption)}
            options={gateTypeOptions}
            placeholder="Select gate type"
          />
        </FormField>

        <FormField
          label="Gate Description"
          description="Describe what this logical gate represents"
        >
          <Textarea
            value={label}
            onChange={({ detail }) => setLabel(detail.value)}
            placeholder="Enter gate description"
            rows={3}
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
};

GateEditModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  nodeData: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string,
    gateType: PropTypes.string,
    data: PropTypes.shape({
      gateType: PropTypes.string,
    }),
  }),
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default GateEditModal;
