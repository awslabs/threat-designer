import React from "react";
import Modal from "@cloudscape-design/components/modal";
import { Button, SpaceBetween, Box } from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";

const DeleteModalComponent = ({ handleDelete, title, visible, setVisible }) => {
  return (
    <Modal
      onDismiss={() => setVisible(false)}
      visible={visible}
      header={"Delete threat model"}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="link"
              onClick={() => {
                setVisible(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleDelete();
                setVisible(false);
              }}
              variant="primary"
            >
              Confirm
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="xl">
        <Alert header="Warning">This action is destructive and irreversible</Alert>
        <div style={{ fontSize: "16px" }}>
          Are you sure you want to delete threat model: <b>{title}</b>?
        </div>
      </SpaceBetween>
    </Modal>
  );
};

export default DeleteModalComponent;
