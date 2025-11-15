import React, { useState, useEffect } from "react";
import styled from "styled-components";
import debounce from "lodash/debounce";
import "./stepper.css";
import { colorBackgroundLayoutMain } from "@cloudscape-design/design-tokens/index.js";

export const Threats = ({ color = "#ffffff" }) => (
  <svg
    width="64px"
    height="64px"
    viewBox="-2.4 -2.4 28.80 28.80"
    id="Layer_1"
    data-name="Layer 1"
    xmlns="http://www.w3.org/2000/svg"
    fill="#ffffff"
    stroke={color}
  >
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <defs>
        <style>{`.cls-1{
            fill: none;
            stroke: ${color};
            stroke-miterlimit: 10;
            stroke-width: 0.84;
          }`}</style>
      </defs>
      <path className="cls-1" d="M1,13.55A5.89,5.89,0,1,1,3.16,21.6"></path>
      <path className="cls-1" d="M20.84,21.6a5.89,5.89,0,1,1,2.16-8"></path>
      <path className="cls-1" d="M16.17,1.61a5.9,5.9,0,1,1-8.34,0"></path>
      <circle className="cls-1" cx="12" cy="12.74" r="6.43"></circle>
    </g>
  </svg>
);

export const Thinking = ({ color = "#ffffff", width = "64px", height = "64px" }) => (
  <svg
    fill={color}
    version="1.1"
    id="Layer_1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="-3.2 -3.2 38.40 38.40"
    xmlSpace="preserve"
    width={width}
    height={height}
    stroke={color}
    strokeWidth="0.00032"
  >
    <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
    <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path
        id="machine--learning--01_1_"
        d="M12,1.64c-0.002,0-0.004,0-0.006,0c-1.473,0-2.691,0.759-3.239,2h-0.48 c-0.003,0-0.006,0-0.009,0c-1.271,0-2.478,0.425-3.398,1.199C3.892,5.659,3.354,6.79,3.352,8.021 c-0.001,0.995,0.526,2.097,1.025,2.791c-2.223,0.77-3.734,2.633-3.737,4.688c-0.003,2.046,1.507,3.91,3.734,4.687 c-0.506,0.692-1.044,1.788-1.045,2.766c-0.003,2.426,2.215,4.403,4.947,4.408h0.48c0.543,1.238,1.764,1.998,3.244,2 c0.002,0,0.004,0,0.007,0c1.972,0,3.351-1.381,3.354-3.36V5C15.363,3.025,13.982,1.643,12,1.64z M12,18.64 c-0.353,0-0.64-0.287-0.64-0.64s0.287-0.64,0.64-0.64s0.64,0.287,0.64,0.64S12.353,18.64,12,18.64z M14.64,13.64h-2.28V7.305 c0.575-0.159,1-0.681,1-1.305c0-0.75-0.61-1.36-1.36-1.36S10.64,5.25,10.64,6c0,0.625,0.425,1.146,1,1.305v6.335H10 c-0.001,0-0.001,0-0.002,0C9.2,13.64,8.641,14.199,8.64,15v0.64H6.305c-0.159-0.575-0.681-1-1.305-1c-0.75,0-1.36,0.61-1.36,1.36 S4.25,17.36,5,17.36c0.625,0,1.147-0.426,1.305-1H8.64v5.834c-0.575,0.159-1,0.681-1,1.306c0,0.75,0.61,1.36,1.36,1.36 s1.36-0.61,1.36-1.36c0-0.625-0.425-1.147-1-1.306V15c0.001-0.401,0.239-0.641,0.639-0.641H10h4.64v11.639 c-0.003,1.456-0.908,2.46-2.28,2.61v-9.303c0.575-0.159,1-0.681,1-1.306c0-0.75-0.61-1.36-1.36-1.36s-1.36,0.61-1.36,1.36 c0,0.625,0.425,1.147,1,1.306v9.31c-1.103-0.114-1.951-0.742-2.3-1.735C9.289,26.736,9.153,26.64,9,26.64H8.276 c-2.036-0.003-4.23-1.413-4.228-3.686c0.002-0.966,0.714-2.209,1.206-2.699c0.092-0.091,0.127-0.225,0.093-0.35 s-0.132-0.222-0.257-0.254c-2.199-0.566-3.733-2.273-3.73-4.151c0.003-1.876,1.522-3.573,3.695-4.141h2.64 c0.159,0.575,0.681,1,1.305,1c0.75,0,1.36-0.61,1.36-1.36S9.75,9.64,9,9.64c-0.625,0-1.146,0.425-1.305,1H5.162 C4.685,10.099,4.07,8.949,4.071,8.022C4.073,7.006,4.52,6.072,5.332,5.39c0.779-0.655,1.849-1.03,2.936-1.03 c0.002,0,0.005,0,0.008,0H9c0.152,0,0.288-0.096,0.339-0.239c0.392-1.103,1.384-1.761,2.655-1.761c0.002,0,0.003,0,0.005,0 C13.582,2.363,14.643,3.423,14.64,5V13.64z M12,6.64c-0.353,0-0.64-0.287-0.64-0.64S11.647,5.36,12,5.36S12.64,5.647,12.64,6 S12.353,6.64,12,6.64z M9,22.86c0.353,0,0.64,0.287,0.64,0.64S9.353,24.14,9,24.14s-0.64-0.287-0.64-0.64S8.647,22.86,9,22.86z M5.64,16c0,0.353-0.287,0.64-0.64,0.64S4.36,16.353,4.36,16S4.647,15.36,5,15.36S5.64,15.647,5.64,16z M8.36,11 c0-0.353,0.287-0.64,0.64-0.64S9.64,10.647,9.64,11S9.353,11.64,9,11.64S8.36,11.353,8.36,11z M31.36,15.5 c0.002-2.046-1.508-3.909-3.734-4.687c0.507-0.692,1.044-1.788,1.046-2.767c0.002-1.231-0.54-2.365-1.526-3.193 c-0.917-0.77-2.163-1.212-3.421-1.214h-0.48c-0.544-1.238-1.764-1.998-3.243-2c-0.003,0-0.005,0-0.008,0 c-0.972,0-1.808,0.323-2.418,0.933C16.965,3.185,16.642,4.023,16.64,5v20.999c-0.003,1.976,1.378,3.357,3.359,3.361 c0.003,0,0.005,0,0.007,0c1.473,0,2.69-0.76,3.238-2h0.479c0.004,0,0.007,0,0.01,0c1.271,0,2.478-0.426,3.398-1.199 c0.977-0.82,1.515-1.95,1.517-3.182c0.001-0.995-0.526-2.098-1.025-2.791C29.847,19.418,31.357,17.555,31.36,15.5z M20,12.36 c0.353,0,0.64,0.287,0.64,0.64s-0.287,0.64-0.64,0.64s-0.64-0.287-0.64-0.64S19.647,12.36,20,12.36z M26.946,19.64h-2.641 c-0.159-0.575-0.681-1-1.306-1c-0.75,0-1.36,0.61-1.36,1.36s0.61,1.36,1.36,1.36c0.624,0,1.147-0.425,1.306-1h2.533 c0.476,0.541,1.091,1.691,1.089,2.618c-0.001,1.016-0.448,1.95-1.26,2.631c-0.781,0.657-1.865,1.01-2.943,1.03H23 c-0.152,0-0.288,0.097-0.339,0.239c-0.393,1.104-1.385,1.761-2.655,1.761c-0.002,0-0.004,0-0.005,0 c-0.781-0.001-1.445-0.252-1.919-0.725C17.608,27.441,17.358,26.78,17.36,26v-8.64h2.279v6.334c-0.575,0.159-1,0.681-1,1.306 c0,0.75,0.61,1.36,1.36,1.36s1.36-0.61,1.36-1.36c0-0.624-0.425-1.147-1-1.306V17.36h1.639c0.001,0,0.002,0,0.003,0 c0.799,0,1.356-0.559,1.358-1.36v-0.64h2.334c0.159,0.575,0.681,1,1.306,1c0.75,0,1.36-0.61,1.36-1.36s-0.61-1.36-1.36-1.36 c-0.625,0-1.147,0.425-1.306,1H23.36V8.805c0.575-0.159,1-0.681,1-1.305c0-0.75-0.61-1.36-1.36-1.36s-1.36,0.61-1.36,1.36 c0,0.624,0.425,1.146,1,1.305V16c0,0.401-0.238,0.641-0.638,0.641c-0.001,0-0.001,0-0.002,0h-4.64V5 c0.001-0.781,0.252-1.445,0.725-1.918c0.397-0.398,0.933-0.627,1.555-0.693v9.305c-0.575,0.159-1,0.681-1,1.305 c0,0.75,0.61,1.36,1.36,1.36s1.36-0.61,1.36-1.36c0-0.624-0.425-1.146-1-1.305v-9.31c1.103,0.115,1.951,0.742,2.3,1.736 c0.051,0.144,0.188,0.24,0.34,0.24h0.724c1.092,0.001,2.17,0.383,2.959,1.045c0.82,0.689,1.271,1.626,1.269,2.641 c-0.001,0.966-0.714,2.209-1.205,2.699c-0.092,0.091-0.127,0.225-0.094,0.35c0.034,0.125,0.133,0.222,0.258,0.254 c2.198,0.567,3.732,2.274,3.729,4.151C30.638,17.374,29.12,19.07,26.946,19.64z M23.64,20c0,0.353-0.287,0.64-0.64,0.64 s-0.64-0.287-0.64-0.64s0.287-0.64,0.64-0.64S23.64,19.647,23.64,20z M20,24.36c0.353,0,0.64,0.287,0.64,0.64s-0.287,0.64-0.64,0.64 s-0.64-0.287-0.64-0.64S19.647,24.36,20,24.36z M23,8.14c-0.353,0-0.64-0.287-0.64-0.64S22.647,6.86,23,6.86s0.64,0.287,0.64,0.64 S23.353,8.14,23,8.14z M26.36,15c0-0.353,0.287-0.64,0.64-0.64s0.64,0.287,0.64,0.64s-0.287,0.64-0.64,0.64S26.36,15.353,26.36,15z"
      ></path>
      <rect id="_Transparent_Rectangle" style={{ fill: "none" }} width="32" height="32"></rect>
    </g>
  </svg>
);

export const Assets = ({ color = "#ffffff" }) => (
  <svg
    width="64px"
    height="64px"
    viewBox="-2.16 -2.16 28.32 28.32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke={color}
  >
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      {" "}
      <path
        d="M8 13H14M8 17H16M13 3H5V21H19V9M13 3H14L19 8V9M13 3V7C13 8 14 9 15 9H19"
        stroke={color}
        stroke-width="0.8399999999999999"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></path>{" "}
    </g>
  </svg>
);

export const Flows = ({ color = "#ffffff" }) => (
  <svg
    width="64px"
    height="64px"
    viewBox="-2.4 -2.4 28.80 28.80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke={color}
  >
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      {" "}
      <path
        d="M4 15.9999L17 15.9999M17 15.9999L14 12.9999M17 15.9999L13.9999 19M5 7.99994L21 7.99994M21 7.99994L18.0001 5M21 7.99994L18.0001 10.9999"
        stroke={color}
        stroke-width="0.8160000000000001"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></path>{" "}
    </g>
  </svg>
);

export const Complete = ({ color = "#ffffff" }) => (
  <svg
    width="64px"
    height="64px"
    viewBox="-2.4 -2.4 28.80 28.80"
    xmlns="http://www.w3.org/2000/svg"
    fill="#ffffff"
    stroke={color}
  >
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      {" "}
      <title></title>{" "}
      <g id="Complete">
        {" "}
        <g id="tick">
          {" "}
          <polyline
            fill="none"
            points="3.7 14.3 9.6 19 20.3 5"
            stroke={color}
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="0.8399999999999999"
          ></polyline>{" "}
        </g>{" "}
      </g>{" "}
    </g>
  </svg>
);

export const AnimatedSubtitle = styled.div`
  @keyframes fadeSlideIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  animation: fadeSlideIn 0.4s ease-out forwards;
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`;

const SpinnerContainer = styled.div`
  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  animation: rotate 2s linear infinite;
  width: 64px;
  height: 64px;
  cursor: ${(props) => (props.clickable ? "pointer" : "default")};
`;

const Text = styled.div`
  color: #666;
  text-align: center;
`;

export const LoadingSpinner = ({ color = "#006ce0", clickable }) => {
  return (
    <Container>
      <SpinnerContainer clickable={clickable}>
        <svg
          width="64px"
          height="64px"
          viewBox="-358.4 -358.4 1740.80 1740.80"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(115, 0, 229, 1)" />
              <stop offset="10%" stopColor="rgba(115, 0, 229, 1)" />
              <stop offset="24%" stopColor="rgba(115, 0, 229, 1)" />
              <stop offset="50%" stopColor="rgba(115, 0, 229, 1)" />
              <stop offset="76%" stopColor="rgba(115, 0, 229, 1)" />
              <stop offset="90%" stopColor="rgba(115, 0, 229, 1)" />
              <stop offset="100%" stopColor="rgba(115, 0, 229, 1)" />
            </linearGradient>
          </defs>
          <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
          <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
          <g id="SVGRepo_iconCarrier">
            <path
              d="M512 1024c-69.1 0-136.2-13.5-199.3-40.2C251.7 958 197 921 150 874c-47-47-84-101.7-109.8-162.7C13.5 648.2 0 581.1 0 512c0-19.9 16.1-36 36-36s36 16.1 36 36c0 59.4 11.6 117 34.6 171.3 22.2 52.4 53.9 99.5 94.3 139.9 40.4 40.4 87.5 72.2 139.9 94.3C395 940.4 452.6 952 512 952c59.4 0 117-11.6 171.3-34.6 52.4-22.2 99.5-53.9 139.9-94.3 40.4-40.4 72.2-87.5 94.3-139.9C940.4 629 952 571.4 952 512c0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 0 0-94.3-139.9 437.71 437.71 0 0 0-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.2C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3s-13.5 136.2-40.2 199.3C958 772.3 921 827 874 874c-47 47-101.8 83.9-162.7 109.7-63.1 26.8-130.2 40.3-199.3 40.3z"
              fill="url(#spinnerGradient)"
              fillRule="evenodd"
              strokeWidth="2"
            />
          </g>
        </svg>
      </SpinnerContainer>
    </Container>
  );
};

const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: undefined,
    height: undefined,
  });

  useEffect(() => {
    const handleResize = debounce(() => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }, 250);

    window.addEventListener("resize", handleResize);

    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      handleResize.cancel();
    };
  }, []);

  return windowSize;
};

export const Stepper = ({ steps, currentStep = 0, onViewportChange }) => {
  const { width } = useWindowSize();
  const isMobile = width < 480;
  const isTablet = width >= 480 && width < 768;

  useEffect(() => {
    if (onViewportChange) {
      onViewportChange({ isMobile, isTablet });
    }
  }, [isMobile, isTablet, onViewportChange]);

  if (isMobile) {
    const activeStep = steps[currentStep];
    return (
      <div className="stepper-container" style={{ width: "100%" }}>
        <div className="stepper-row">
          <div className="step-column">
            <div
              className="step-icon active"
              style={{
                background:
                  "radial-gradient(circle farthest-corner at top right, #b8e7ff 0%, #0099ff 25%, #5c7fff 40% , #8575ff 60%, #962eff 80%)",
                color: "white",
              }}
            >
              {React.cloneElement(activeStep.icon, {
                color: "#f9f9fa",
              })}
            </div>
            <div className="step-text">
              <div className="step-title">{activeStep.title}</div>
              <AnimatedSubtitle
                key={activeStep.key || activeStep.subtitle}
                className="step-subtitle"
              >
                {activeStep.subtitle}
              </AnimatedSubtitle>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stepper-container" style={{ width: isTablet ? "100%" : undefined }}>
      <div className="stepper-row">
        {steps.map((step, index) => {
          const isClickable =
            step.title.includes("Threats") ||
            step.title.includes("Assets") ||
            step.title.includes("Data flows");

          return (
            <div className="step-column" key={index}>
              <div
                className={`step-icon ${index <= currentStep ? "active" : ""}`}
                style={
                  currentStep === index
                    ? {
                        backgroundColor: colorBackgroundLayoutMain,
                        color: "#006ce0",
                      }
                    : {
                        background:
                          index > currentStep
                            ? "#b4b4bb"
                            : "radial-gradient(circle farthest-corner at top right, #b8e7ff 0%, #0099ff 25%, #5c7fff 40% , #8575ff 60%, #962eff 80%)",
                        color: "white",
                      }
                }
              >
                {currentStep === index ? (
                  <LoadingSpinner color={"#006ce0"} clickable={false} />
                ) : (
                  React.cloneElement(step.icon, {
                    color: index < currentStep ? "#f9f9fa" : "#656871",
                  })
                )}
              </div>
              {!isTablet && (
                <div className="step-text">
                  <div className="step-title">{step.title}</div>
                  <AnimatedSubtitle key={step.key || step.subtitle} className="step-subtitle">
                    {step.subtitle}
                  </AnimatedSubtitle>
                </div>
              )}
              {index !== steps.length - 1 && (
                <div
                  className="step-connector"
                  style={{
                    background: index >= currentStep ? "#b4b4bb" : "rgba(115, 0, 229, 1)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
