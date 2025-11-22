import { useState } from "react";

const ALERT_MESSAGES = {
  Info: {
    title: "Threat model has changed",
    msg: "Latest changes have not been saved.",
    button: "Save changes",
  },
  Success: {
    title: "Threat model saved",
    msg: "Latest changes have been saved.",
  },
  Error: {
    title: "Error saving changes",
    msg: "An error occurred while saving the threat model.",
    button: "Retry",
  },
  ErrorThreatModeling: {
    title: "Error processing your request",
    msg: "An error occurred while processing the threat model.",
    button: "Restore previous version",
  },
  LockLost: {
    title: "Edit lock lost",
    msg: "Another user has taken the edit lock. The threat model is now in read-only mode.",
  },
  LockConflict: {
    title: "Threat model is locked",
    msg: "This threat model is currently being edited by another user.",
  },
  Conflict: {
    title: "Conflict detected",
    msg: "The threat model has been modified by another user since you last loaded it.",
    button: "Resolve conflict",
  },
  Unauthorized: {
    title: "Save failed - Unauthorized",
    msg: "You don't have permission to save changes. The threat model may be locked by another user or you may have lost edit access.",
  },
};

export const useAlert = () => {
  const [alert, setAlert] = useState({
    visible: false,
    state: "Info",
    loading: false,
    data: null,
  });

  const showAlert = (state, loading = false, data = null) => {
    setAlert((prev) => ({
      ...prev,
      visible: true,
      state,
      loading,
      data,
    }));
  };

  const hideAlert = () => {
    setAlert({
      state: "Info",
      visible: false,
      loading: false,
      data: null,
    });
  };

  const setLoading = (loading) => {
    setAlert((prev) => ({
      ...prev,
      loading,
    }));
  };

  return {
    alert,
    showAlert,
    hideAlert,
    setLoading,
    alertMessages: ALERT_MESSAGES,
  };
};
