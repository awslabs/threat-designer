import React from "react";
import Steps from "@cloudscape-design/components/steps";

export const StepStatusComponent = ({ stepInLoading, iteration }) => {
  const steps = [
    {
      header: "Start Processing",
      statusIconAriaLabel: "Start processing",
      key: "START",
    },
    {
      header: "Generating assets",
      statusIconAriaLabel: "Generating assets",
      key: "ASSETS",
    },
    {
      header: "Identifying data flows",
      statusIconAriaLabel: "Identifying data flows",
      key: "FLOW",
    },
    {
      header: `Cataloging threats ${iteration !== 0 ? `(${iteration})` : ""}`,
      statusIconAriaLabel: `Cataloging threats ${iteration !== 0 ? `(${iteration})` : ""}`,
      key: "THREAT",
    },
    {
      header: "Finalising",
      statusIconAriaLabel: "Finalising",
      key: "FINALIZE",
    },
  ];

  const updatedSteps = steps.map((step) => ({
    ...step,
    status:
      stepInLoading === null
        ? "info"
        : step.key === stepInLoading || (stepInLoading === "THREAT_RETRY" && step.key === "THREAT")
          ? "loading"
          : "info",
  }));

  return <Steps steps={updatedSteps} />;
};
