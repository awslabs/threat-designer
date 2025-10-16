import React from "react";
import "./ScrollButton.css";
import { useTheme } from "../ThemeContext";

export const ScrollButton = React.memo(({ onClick, direction }) => {
  const { effectiveTheme } = useTheme();
  return (
    <button
      className={`scroll-button ${effectiveTheme}`}
      onClick={onClick}
      aria-label={`Scroll to ${direction}`}
    >
      {direction === "top" ? "↑" : "↓"}
    </button>
  );
});
