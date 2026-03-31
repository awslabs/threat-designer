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
  const [isVersion, setIsVersion] = useState(false);

  // Reset version mode when navigating to a different threat model
  useEffect(() => {
    setIsVersion(false);
  }, [id]);

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
      VERSION_DIFF: {
        image: thinking,
        text: "Analyzing architecture changes...",
        currentStep: 0,
        version: true,
      },
      VERSION_ASSETS: {
        image: assets,
        text: "Updating assets...",
        currentStep: 1,
        version: true,
      },
      VERSION_FLOWS: {
        image: flows,
        text: "Updating data flows...",
        currentStep: 2,
        version: true,
      },
      VERSION_BOUNDARIES: {
        image: flows,
        text: "Updating trust boundaries...",
        currentStep: 2,
        version: true,
      },
      VERSION_THREATS: {
        image: threats,
        text: "Updating threats...",
        currentStep: 3,
        version: true,
      },
      FINALIZE: {
        image: complete,
        text: "All good! Finalising threat model...",
        currentStep: 5,
      },
    }),
    []
  );

  // Memoize the steps array — different steps for version vs normal
  const steps = useMemo(
    () =>
      isVersion
        ? [
            {
              icon: <Thinking />,
              title: "Processing",
              subtitle: "Analyzing architecture changes",
            },
            {
              icon: <Assets />,
              title: "Assets",
              subtitle: currentStep === 1 && detail ? detail : "Updating assets",
              key: currentStep === 1 ? detail : "default",
            },
            {
              icon: <Flows />,
              title: "Data flows",
              subtitle: currentStep === 2 && detail ? detail : "Updating data flows",
              key: currentStep === 2 ? detail : "default",
            },
            {
              icon: <Threats />,
              title: "Threats",
              subtitle: currentStep === 3 && detail ? detail : "Updating threats",
              key: currentStep === 3 ? detail : "default",
            },
            {
              icon: <Complete />,
              title: "Completing",
              subtitle: "Finalizing threat model",
            },
          ]
        : [
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
              subtitle: currentStep === 3 && detail ? detail : "Identifying data flows",
              key: currentStep === 3 ? detail : "default",
            },
            {
              icon: <Threats />,
              title: `Threats ${iteration !== 0 ? `(${iteration})` : ""}`,
              subtitle: currentStep === 4 && detail ? detail : "Cataloging threats",
              key: currentStep === 4 ? detail : "default",
            },
            {
              icon: <Complete />,
              title: "Completing",
              subtitle: "Finalizing threat model",
            },
          ],
    [isVersion, iteration, currentStep, detail]
  );

  useEffect(() => {
    if (status) {
      const newOption = options[status] || options.START;

      // Track version mode — once set, it stays for the rest of the session
      if (newOption.version) {
        setIsVersion(true);
      }

      setCurrentOption(newOption);
      // For FINALIZE during version, use step 4 (last step in version stepper)
      setCurrentStep(status === "FINALIZE" && isVersion ? 4 : newOption.currentStep);
      setImageVisible(false);

      setTimeout(() => {
        setImageVisible(true);
      }, 50);
    }
  }, [status, options, isVersion]);

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
