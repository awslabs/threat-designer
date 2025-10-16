import React from "react";
import Alert from "@cloudscape-design/components/alert";

const ErrorContent = ({ message, dismiss }) => {
  return (
    <div style={{ marginBottom: 5 }}>
      <Alert
        type="error"
        dismissible
        onDismiss={() => dismiss()}
        header={message || "An unexpected error occurred"}
      ></Alert>
    </div>
  );
};
export default ErrorContent;
