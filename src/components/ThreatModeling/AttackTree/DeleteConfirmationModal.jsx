import React from "react";
import Modal from "@cloudscape-design/components/modal";
import { Button, SpaceBetween, Box } from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";

const DeleteConfirmationModal = ({ visible, onConfirm, onCancel, threatName }) => {
  return (
    <Modal
      onDismiss={onCancel}
      visible={visible}
      header="Delete attack tree"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onConfirm} variant="primary">
              Confirm
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="xl">
        <Alert header="Warning">This action is destructive and irreversible</Alert>
        <div style={{ fontSize: "16px" }}>
          Are you sure you want to delete the attack tree for threat: <b>{threatName}</b>?
        </div>
      </SpaceBetween>
    </Modal>
  );
};

export default DeleteConfirmationModal;
