import React from "react";
import { Modal, Box, SpaceBetween, Button } from "@cloudscape-design/components";

/**
 * ConfirmationModal component for confirming data clearing actions
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Whether the modal is visible
 * @param {Function} props.onConfirm - Callback when user confirms
 * @param {Function} props.onCancel - Callback when user cancels
 * @param {string} props.title - Modal title
 * @param {string} props.message - Modal message
 */
function ConfirmationModal({ visible, onConfirm, onCancel, title, message }) {
  return (
    <Modal
      visible={visible}
      onDismiss={onCancel}
      header={title}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onConfirm}>
              Confirm
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      {message}
    </Modal>
  );
}

export default ConfirmationModal;
