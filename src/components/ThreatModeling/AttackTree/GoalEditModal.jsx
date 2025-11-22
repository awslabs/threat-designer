import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Modal,
  Box,
  SpaceBetween,
  FormField,
  Textarea,
  Button,
} from "@cloudscape-design/components";

/**
 * GoalEditModal - Modal for editing goal node description
 */
const GoalEditModal = ({ visible, nodeData, onSave, onCancel }) => {
  const [label, setLabel] = useState("");
  const [isFormValid, setIsFormValid] = useState(false);

  // Initialize form data when modal opens or nodeData changes
  useEffect(() => {
    if (visible && nodeData) {
      // Handle both direct data and nested data structure
      const data = nodeData.data || nodeData;
      setLabel(data.label || nodeData.label || "");
    }
  }, [visible, nodeData]);

  // Validate form
  useEffect(() => {
    setIsFormValid(label.trim() !== "");
  }, [label]);

  const handleSave = () => {
    if (!isFormValid) return;

    const updatedData = {
      label: label.trim(),
    };

    onSave(nodeData.id, updatedData);
    handleDismiss();
  };

  const handleDismiss = () => {
    // Reset form
    setLabel("");
    onCancel();
  };

  if (!nodeData) return null;

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      header="Edit Goal Node"
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
        <FormField label="Goal Description" description="Describe the ultimate attack objective">
          <Textarea
            value={label}
            onChange={({ detail }) => setLabel(detail.value)}
            placeholder="Enter goal description"
            rows={3}
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
};

GoalEditModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  nodeData: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string,
  }),
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default GoalEditModal;
