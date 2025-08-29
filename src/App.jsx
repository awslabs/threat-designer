import { useEffect, useState } from "react";
import TopNavigationMFE from "./components/TopNavigationMFE/TopNavigationMFE";
import AppLayoutMFE from "./components/AppLayoutMFE/AppLayoutMFE";
import LoginPageInternal from "./pages/Landingpage/Landingpage";
import { Spinner } from "@cloudscape-design/components";
import { getUser } from "./services/Auth/auth";
import { SpaceBetween } from "@cloudscape-design/components";
import { SplitPanelProvider } from "./SplitPanelContext";
import customTheme from "./customTheme";
import "@cloudscape-design/global-styles/index.css";
import { applyMode, Mode } from "@cloudscape-design/global-styles";
import { applyTheme } from "@cloudscape-design/components/theming";
import { ThemeProvider } from "./components/ThemeContext";

const App = () => {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);

  const [colorMode, setColorMode] = useState(() => {
    const savedMode = localStorage.getItem("colorMode");
    return savedMode || "system";
  });

  // Make effectiveTheme a state variable
  const [effectiveTheme, setEffectiveTheme] = useState(() => {
    const getSystemTheme = () => {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };
    const getEffectiveTheme = (mode) => {
      if (mode === "system") {
        return getSystemTheme();
      }
      return mode;
    };
    return getEffectiveTheme(colorMode);
  });

  const getSystemTheme = () => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const getEffectiveTheme = (mode) => {
    if (mode === "system") {
      return getSystemTheme();
    }
    return mode;
  };

  const setThemeMode = (mode) => {
    const validModes = ["SYSTEM", "LIGHT", "DARK"];
    const normalizedMode = mode.toUpperCase();

    if (validModes.includes(normalizedMode)) {
      setColorMode(normalizedMode.toLowerCase());
    } else {
      console.warn(`Invalid theme mode: ${mode}. Valid options are: SYSTEM, LIGHT, DARK`);
    }
  };

  useEffect(() => {
    checkAuthState();
  }, []);

  useEffect(() => {
    const newEffectiveTheme = getEffectiveTheme(colorMode);
    setEffectiveTheme(newEffectiveTheme);
    applyMode(newEffectiveTheme === "light" ? Mode.Light : Mode.Dark);
    localStorage.setItem("colorMode", colorMode);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleSystemThemeChange = () => {
      if (colorMode === "system") {
        const updatedEffectiveTheme = getEffectiveTheme(colorMode);
        setEffectiveTheme(updatedEffectiveTheme); // Update the state
        applyMode(updatedEffectiveTheme === "light" ? Mode.Light : Mode.Dark);
      }
    };

    if (colorMode === "system") {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
    }

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [colorMode]);

  useEffect(() => {
    applyTheme({ theme: customTheme });
  }, []);

  const checkAuthState = async () => {
    setLoading(true);
    try {
      const user = await getUser();
      setAuthUser(user);
    } catch (error) {
      console.log(error);
      setAuthUser(null);
    } finally {
      setTimeout(() => {
        setLoading(false);
      }, 2000);
    }
  };

  return (
    <div>
      {loading ? (
        <SpaceBetween alignItems="center">
          <div style={{ marginTop: "20px" }}>
            <Spinner size="large" />
          </div>
        </SpaceBetween>
      ) : authUser ? (
        <ThemeProvider
          colorMode={colorMode}
          effectiveTheme={effectiveTheme}
          setThemeMode={setThemeMode}
        >
            <SplitPanelProvider>
              <TopNavigationMFE
                user={authUser}
                setAuthUser={checkAuthState}
                colorMode={colorMode}
                setThemeMode={setThemeMode}
                effectiveTheme={effectiveTheme}
              />
              <AppLayoutMFE user={authUser} colorMode={colorMode} setThemeMode={setThemeMode} />
            </SplitPanelProvider>
        </ThemeProvider>
      ) : (
        <LoginPageInternal setAuthUser={checkAuthState} />
      )}
    </div>
  );
};

export default App;
