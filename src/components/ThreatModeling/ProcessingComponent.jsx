import React, { useEffect, useState, useMemo, useCallback } from "react";
import "./ThreatModeling.css";
import threats from "./images/threats.svg";
import assets from "./images/assets.svg";
import flows from "./images/flows.svg";
import thinking from "./images/thinking.svg";
import complete from "./images/complete.svg";
import { Assets, Flows, Threats, Thinking, Complete, Stepper, SpaceContext } from "./CustomIcons";

export default function Processing({ status, iteration, id, detail }) {
  const [viewport, setViewport] = useState({
    isMobile: false,
    isTablet: false,
  });
  const [imageVisible, setImageVisible] = useState(false);
  const [currentOption, setCurrentOption] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Memoize the handleViewportChange function
  const handleViewportChange = useCallback(({ isMobile, isTablet }) => {
    setViewport({ isMobile, isTablet });
  }, []);

  const options = useMemo(
    () => ({
      UPLOAD: { image: thinking, text: "Uploading diagram...", currentStep: 0 },
      START: {
        image: thinking,
        text: "Processing your request...",
        currentStep: 0,
      },
      SPACE_CONTEXT: {
        component: <SpaceContext color="#656871" width="120px" height="120px" />,
        text: "Querying knowledge base...",
        currentStep: 1,
      },
      ASSETS: { image: assets, text: "Generating assets...", currentStep: 2 },
      THREAT: { image: threats, text: "Cataloging threats...", currentStep: 4 },
      FLOW: { image: flows, text: "Identifying data flows...", currentStep: 3 },
      EVALUATION: { image: thinking, text: "Evaluating threat catalog..." },
      THREAT_RETRY: {
        image: threats,
        text: "Improving threat catalog...",
        currentStep: 4,
      },
      FINALIZE: {
        image: complete,
        text: "All good! Finalising threat model...",
        currentStep: 5,
      },
    }),
    []
  );

  // Memoize the steps array
  const steps = useMemo(
    () => [
      {
        icon: <Thinking />,
        title: "Processing",
        subtitle: "Initiating threat modeling",
      },
      {
        icon: <SpaceContext />,
        title: "Context",
        subtitle: currentStep === 1 && detail ? detail : "Querying context",
        key: currentStep === 1 ? detail : "default",
      },
      {
        icon: <Assets />,
        title: "Assets",
        subtitle: "Identifying assets",
      },
      {
        icon: <Flows />,
        title: "Data flows",
        subtitle: "Identifying data flows",
      },
      {
        icon: <Threats />,
        title: `Threats ${iteration !== 0 ? `(${iteration})` : ""}`,
        // Use detail if current step is Threats (step 4), otherwise default to "Cataloging threats"
        subtitle: currentStep === 4 && detail ? detail : "Cataloging threats",
        key: currentStep === 4 ? detail : "default", // Add key to trigger transition on detail change
      },
      {
        icon: <Complete />,
        title: "Completing",
        subtitle: "Finalizing threat model",
      },
    ],
    [iteration, currentStep, detail]
  ); // Include iteration, currentStep, and detail as dependencies

  useEffect(() => {
    if (status) {
      const newOption = options[status] || options.START;
      setCurrentOption(newOption);
      setCurrentStep(newOption.currentStep);
      setImageVisible(false);

      setTimeout(() => {
        setImageVisible(true);
      }, 50);
    }
  }, [status, options]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {currentOption && !viewport.isMobile && !viewport.isTablet && (
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <React.Fragment key={status}>
            <div className={`fade-transition ${imageVisible ? "visible" : ""}`}>
              {currentOption.component ? (
                currentOption.component
              ) : (
                <img
                  src={currentOption.image}
                  alt={currentOption.text}
                  className="welcome-tm-icon"
                />
              )}
            </div>
          </React.Fragment>
        </div>
      )}
      <div
        style={{
          width: "100%",
        }}
      >
        <Stepper
          steps={steps}
          currentStep={currentStep}
          onViewportChange={handleViewportChange}
          id={id}
        />
      </div>
    </div>
  );
}
