import React, { useEffect, useState, useMemo } from "react";
import "./ThreatModeling.css";
import threats from "./images/threats.svg";
import assets from "./images/assets.svg";
import flows from "./images/flows.svg";
import thinking from "./images/thinking.svg";
import complete from "./images/complete.svg";
import { Assets, Flows, Threats, Thinking, Complete, Stepper } from "./CustomIcons";

export default function Processing({ status, iteration }) {
  const [viewport, setViewport] = useState({
    isMobile: false,
    isTablet: false,
  });
  const [loading, setLoading] = useState(false);
  const [imageVisible, setImageVisible] = useState(false);
  const [textVisible, setTextVisible] = useState(false);
  const [currentOption, setCurrentOption] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const handleViewportChange = ({ isMobile, isTablet }) => {
    setViewport({ isMobile, isTablet });
  };

  const options = useMemo(
    () => ({
      UPLOAD: { image: thinking, text: "Uploading diagram...", currentStep: 0 },
      START: {
        image: thinking,
        text: "Processing your request...",
        currentStep: 0,
      },
      ASSETS: { image: assets, text: "Generating assets...", currentStep: 1 },
      THREAT: { image: threats, text: "Cataloging threats...", currentStep: 3 },
      FLOW: { image: flows, text: "Identifying data flows...", currentStep: 2 },
      EVALUATION: { image: thinking, text: "Evaluating threat catalog..." },
      THREAT_RETRY: {
        image: threats,
        text: "Improving threat catalog...",
        currentStep: 3,
      },
      FINALIZE: {
        image: complete,
        text: "All good! Finalising threat model...",
        currentStep: 4,
      },
    }),
    []
  );

  const steps = [
    {
      icon: <Thinking />,
      title: "Processing",
      subtitle: "Initiating threat modeling",
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
      subtitle: "Cataloging threats",
    },
    {
      icon: <Complete />,
      title: "Completing",
      subtitle: "Finalizing threat model",
    },
  ];

  useEffect(() => {
    if (!loading && status) {
      const newOption = options[status] || options.START;
      setCurrentOption(newOption);
      setCurrentStep(newOption.currentStep);
      setImageVisible(false);
      setTextVisible(false);

      setTimeout(() => {
        setImageVisible(true);
        setTextVisible(true);
      }, 50);
    }
  }, [status, loading, options]);

  return (
    <>
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
              <img src={currentOption.image} alt={currentOption.text} className="welcome-tm-icon" />
            </div>
          </React.Fragment>
        </div>
      )}
      <div
        style={{
          width: "100%",
        }}
      >
        <Stepper steps={steps} currentStep={currentStep} onViewportChange={handleViewportChange} />
      </div>
    </>
  );
}
