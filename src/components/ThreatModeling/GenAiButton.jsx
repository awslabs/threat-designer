import React from "react";
import styled from "@emotion/styled";

const BoldSpan = styled.span`
  font-weight: bold;
`;

const GenAiButton = ({ children, onClick, className = "", loading = false, disabled = false }) => {
  const buttonStyle = {
    background:
      loading || disabled
        ? "linear-gradient(90deg, #700080 0%, #3d1ab3 50%, #002baf 100%)"
        : "radial-gradient(circle farthest-corner at top right, #b8e7ff 0%, #0099ff 25%, #5c7fff 40% , #8575ff 60%, #962eff 80%)",
    padding: "4px 20px 4px 20px",
    border: "none",
    borderRadius: "10px",
    color: "white",
    cursor: loading || disabled ? "not-allowed" : "pointer",
    position: "relative",
    isolation: "isolate",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    opacity: disabled ? "0.6" : "1",
  };

  const overlayStyle = {
    position: "absolute",
    inset: 0,
    background: loading || disabled ? "rgba(0,0,0,0.4)" : "transparent",
    transition: "background-color 0.2s",
    borderRadius: "10px",
    pointerEvents: "none",
  };

  const spinnerStyle = {
    width: "16px",
    height: "16px",
    border: "2px solid #ffffff",
    borderTop: "2px solid transparent",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  };

  return (
    <>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <button
        className={className}
        style={buttonStyle}
        onClick={loading || disabled ? undefined : onClick}
        onMouseOver={(e) =>
          !loading &&
          !disabled &&
          (e.currentTarget.querySelector(".overlay").style.backgroundColor = "rgba(0,0,0,0.4)")
        }
        onMouseOut={(e) =>
          !loading &&
          !disabled &&
          (e.currentTarget.querySelector(".overlay").style.backgroundColor = "transparent")
        }
        disabled={loading || disabled}
      >
        <div className="overlay" style={overlayStyle}></div>
        {loading && <div style={spinnerStyle} />}
        <BoldSpan style={{ position: "relative" }}>{children}</BoldSpan>
      </button>
    </>
  );
};

export default GenAiButton;
