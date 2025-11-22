import React from "react";
import Modal from "@cloudscape-design/components/modal";
import { Button, SpaceBetween, Box } from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";
import PropTypes from "prop-types";

/**
 * NodeDeleteConfirmationModal Component
 *
 * Displays a confirmation dialog before deleting a node from the attack tree.
 */
const NodeDeleteConfirmationModal = ({ visible, onConfirm, onCancel, nodeData }) => {
  // Get node type label for display
  const getNodeTypeLabel = (nodeType) => {
    const labels = {
      "root-goal": "Goal",
      "and-gate": "AND Gate",
      "or-gate": "OR Gate",
      "leaf-attack": "Leaf Attack",
    };
    return labels[nodeType] || "Node";
  };

  const nodeTypeLabel = nodeData ? getNodeTypeLabel(nodeData.type) : "Node";
  const nodeLabel = nodeData?.data?.label || "Unnamed";

  return (
    <Modal
      onDismiss={onCancel}
      visible={visible}
      header="Delete node"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onConfirm} variant="primary">
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="m">
        <Alert type="warning" header="This action cannot be undone">
          Deleting this node will also remove all connections to and from it.
        </Alert>
        <div style={{ fontSize: "14px" }}>
          Are you sure you want to delete this {nodeTypeLabel}?
          <div style={{ marginTop: "8px", fontWeight: "bold" }}>{nodeLabel}</div>
        </div>
      </SpaceBetween>
    </Modal>
  );
};

NodeDeleteConfirmationModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  nodeData: PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    data: PropTypes.shape({
      label: PropTypes.string,
    }),
  }),
};

export default NodeDeleteConfirmationModal;
