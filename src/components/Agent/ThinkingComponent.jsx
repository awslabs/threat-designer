import React, { useState, useEffect, useRef } from "react";
import "./styles.css";
import { useTheme } from "../ThemeContext";

export const ReasoningComponent = ({ loading, onClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hasFinishedThinking, setHasFinishedThinking] = useState(false);
  const [wasEverLoading, setWasEverLoading] = useState(loading);
  const { effectiveTheme } = useTheme();
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (loading) {
      setWasEverLoading(true);
    }

    if (loading && !startTimeRef.current) {
      // Start timing when loading begins
      startTimeRef.current = Date.now();
      setHasFinishedThinking(false);
    } else if (!loading && startTimeRef.current && !hasFinishedThinking && wasEverLoading) {
      // Loading just finished, calculate duration
      const endTime = Date.now();
      const calculatedDuration = Math.round((endTime - startTimeRef.current) / 1000);
      setDuration(calculatedDuration);
      setHasFinishedThinking(true);
    }
  }, [loading, hasFinishedThinking, wasEverLoading]);

  const handleClick = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    if (onClick) {
      onClick(newState);
    }
  };

  const getTextColor = () => {
    return effectiveTheme === "light" ? "#706D6C" : "#8b8b8c";
  };

  const getDisplayText = () => {
    if (loading) {
      return "Thinking";
    } else if (hasFinishedThinking) {
      // Always show duration once thinking is finished
      return `Thought for ${duration}s`;
    }
    return "Thinking";
  };

  const containerStyle = {
    display: "flex",
    alignItems: "center",
    paddingTop: "16px",
    justifyContent: "flex-start",
    fontFamily: "Arial, sans-serif",
    color: getTextColor(),
  };

  const textStyle = {
    cursor: "pointer", // Always show pointer cursor
  };

  const getTextClassName = () => {
    if (loading) {
      return effectiveTheme === "light" ? "text-reveal-light" : "text-reveal";
    }
    return "";
  };

  return (
    <div style={containerStyle}>
      <span style={textStyle} className={getTextClassName()} onClick={handleClick}>
        {getDisplayText()}
      </span>
    </div>
  );
};

export default ReasoningComponent;
