import React, { useState } from "react";

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
};

export const useAlert = () => {
  const [alert, setAlert] = useState({
    visible: false,
    state: "Info",
    loading: false,
  });

  const showAlert = (state, loading = false) => {
    setAlert((prev) => ({
      ...prev,
      visible: true,
      state,
      loading,
    }));
  };

  const hideAlert = () => {
    setAlert({
      state: "Info",
      visible: false,
      loading: false,
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
