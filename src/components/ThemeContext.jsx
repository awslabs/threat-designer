import React, { createContext, useContext } from "react";

const ThemeContext = createContext();

export const ThemeProvider = ({ children, colorMode, effectiveTheme, setThemeMode }) => {
  const value = {
    colorMode, // "system", "light", or "dark"
    effectiveTheme, // The actual theme being used ("light" or "dark")
    setThemeMode, // Function to change the theme
    isDark: effectiveTheme === "dark", // Convenience boolean
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// Custom hook for using the theme
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
