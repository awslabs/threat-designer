import { useEffect, useState, useCallback } from "react";
import AppLayoutMFE from "./components/AppLayoutMFE/AppLayoutMFE";
import LoginPageInternal from "./pages/Landingpage/Landingpage";
import { Spinner } from "@cloudscape-design/components";
import { getUser, logOut } from "./services/Auth/auth";
import { SpaceBetween } from "@cloudscape-design/components";
import { SplitPanelProvider } from "./SplitPanelContext";
import customTheme from "./customTheme";
import "@cloudscape-design/global-styles/index.css";
import { applyMode, Mode } from "@cloudscape-design/global-styles";
import { applyTheme } from "@cloudscape-design/components/theming";
import { ChatSessionProvider } from "./components/Agent/ChatContext";
import { ThemeProvider } from "./components/ThemeContext";
import AppRefreshManager from "./AppRefreshManager";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";
import { AppSidebar } from "./components/Sidebar";

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

    // Apply dark class to document for shadcn/ui sidebar theming
    if (newEffectiveTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleSystemThemeChange = () => {
      if (colorMode === "system") {
        const updatedEffectiveTheme = getEffectiveTheme(colorMode);
        setEffectiveTheme(updatedEffectiveTheme); // Update the state
        applyMode(updatedEffectiveTheme === "light" ? Mode.Light : Mode.Dark);

        // Update dark class for shadcn/ui sidebar theming
        if (updatedEffectiveTheme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
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
      // Auth check failed - user not logged in
      setAuthUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = useCallback(async () => {
    setLoading(true);
    try {
      await logOut();
      setAuthUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      <ThemeProvider
        colorMode={colorMode}
        effectiveTheme={effectiveTheme}
        setThemeMode={setThemeMode}
      >
        {loading ? (
          <SpaceBetween alignItems="center">
            <div style={{ marginTop: "20px" }}>
              <Spinner size="large" />
            </div>
          </SpaceBetween>
        ) : authUser ? (
          <AppRefreshManager>
            <ChatSessionProvider>
              <SplitPanelProvider>
                <SidebarProvider defaultOpen={false}>
                  <AppSidebar
                    user={authUser}
                    colorMode={colorMode}
                    effectiveTheme={effectiveTheme}
                    setThemeMode={setThemeMode}
                    onLogout={handleLogout}
                  />
                  <SidebarInset>
                    <AppLayoutMFE
                      user={authUser}
                      colorMode={colorMode}
                      setThemeMode={setThemeMode}
                    />
                  </SidebarInset>
                </SidebarProvider>
              </SplitPanelProvider>
            </ChatSessionProvider>
          </AppRefreshManager>
        ) : (
          <LoginPageInternal setAuthUser={checkAuthState} />
        )}
      </ThemeProvider>
    </div>
  );
};

export default App;
