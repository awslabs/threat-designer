import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "@cloudscape-design/global-styles/index.css";
import { TopNavigation, Button } from "@cloudscape-design/components";
import { logOut } from "../../services/Auth/auth";
import Shield from "../../components/ThreatModeling/images/shield.png";
import customTheme from "../../customTheme";
import { MonitorCog, Moon, Sun } from "lucide-react";
import { THREAT_CATALOG_ENABLED, BACKEND_MODE, BASE_PATH } from "../../config";
import ConfirmationModal from "./ConfirmationModal";

const getConditionalColor = (checkValue, effectiveTheme, colorMode) => {
  return colorMode === checkValue ? (effectiveTheme === "dark" ? "#42b4ff" : "#006ce0") : undefined;
};

function TopNavigationMFE({ user, setAuthUser, colorMode, setThemeMode, effectiveTheme }) {
  const navigate = useNavigate();
  const navBarRef = useRef(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const i18nStrings = {
    searchIconAriaLabel: "Search",
    searchDismissIconAriaLabel: "Close search",
    overflowMenuTriggerText: "More",
  };

  /**
   * Check if threat modeling data exists in sessionStorage
   */
  const hasThreateningData = () => {
    if (BACKEND_MODE !== "lightning") {
      return false;
    }
    const allJobs = sessionStorage.getItem("tm_all_jobs");
    return allJobs !== null && allJobs !== "[]";
  };

  /**
   * Handle New button click
   */
  const handleNewClick = () => {
    if (hasThreateningData()) {
      // Show confirmation modal if data exists
      setShowConfirmModal(true);
    } else {
      // Navigate directly if no data exists
      navigate("/");
    }
  };

  /**
   * Handle confirmation modal confirm action
   */
  const handleConfirmClear = async () => {
    setShowConfirmModal(false);

    if (BACKEND_MODE === "lightning") {
      try {
        // Import embedded backend functions
        const { interruptJob, getStateManager } = await import(
          "../../services/ThreatDesigner/embeddedBackend.js"
        );
        const stateManager = await getStateManager();

        // Get all active jobs
        const allJobs = stateManager.getAllJobs();

        // Interrupt all active jobs
        if (allJobs && allJobs.length > 0) {
          console.log(`Interrupting ${allJobs.length} active job(s)`);
          for (const job of allJobs) {
            try {
              await interruptJob(job.id);
            } catch (error) {
              console.warn(`Failed to interrupt job ${job.id}:`, error);
            }
          }
        }

        // Clear all threat modeling data except credentials
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          // Clear all tm_ keys EXCEPT credentials
          if (key && key.startsWith("tm_") && key !== "tm_aws_credentials") {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => sessionStorage.removeItem(key));
        console.log("Cleared Lightning Mode threat modeling data (kept credentials)");
      } catch (error) {
        console.error("Error clearing data:", error);
      }
    }

    // Navigate to home
    navigate("/");
  };

  /**
   * Handle confirmation modal cancel action
   */
  const handleCancelClear = () => {
    setShowConfirmModal(false);
  };

  const signOutText = BACKEND_MODE === "lightning" ? "Clear Credentials" : "Sign out";

  const profileActions = [
    { id: "signout", text: signOutText },
    {
      id: "theme",
      text: "Theme",
      type: "menu-dropdown",
      items: [
        {
          id: "system",
          text: (
            <span
              style={{
                color: getConditionalColor("system", effectiveTheme, colorMode),
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <MonitorCog size="16px" /> System
            </span>
          ),
        },
        {
          id: "light",
          text: (
            <span
              style={{
                whiteSpace: "nowrap",
                color: getConditionalColor("light", effectiveTheme, colorMode),
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Sun size="16px" /> Light
            </span>
          ),
        },
        {
          id: "dark",
          text: (
            <span
              style={{
                whiteSpace: "nowrap",
                color: getConditionalColor("dark", effectiveTheme, colorMode),
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Moon size="16px" /> Dark
            </span>
          ),
        },
      ],
    },
  ];

  return (
    <div
      ref={navBarRef}
      id="h"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1002,
        height: "auto !important",
      }}
    >
      {true && (
        <TopNavigation
          i18nStrings={i18nStrings}
          identity={{
            title: (
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginRight: "50px",
                  }}
                >
                  <a href="/" style={{ textDecoration: "none" }}>
                    <img
                      src={Shield}
                      alt="Threat Designer"
                      style={{
                        height: "24px",
                        marginTop: "0px",
                        width: "auto",
                        cursor: "pointer",
                      }}
                    />
                  </a>
                  <div
                    style={{
                      fontSize: "16px",
                      color:
                        effectiveTheme === "dark"
                          ? `${customTheme.contexts["top-navigation"].tokens.colorTextInteractiveActive.dark}`
                          : `${customTheme.contexts["top-navigation"].tokens.colorTextInteractiveActive.light}`,
                    }}
                  >
                    Threat Designer
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0px" }}>
                  <Button variant="link" onClick={handleNewClick}>
                    New
                  </Button>
                  {THREAT_CATALOG_ENABLED && (
                    <Button
                      variant="link"
                      onClick={() => {
                        navigate("/threat-catalog");
                      }}
                    >
                      Threat Catalog
                    </Button>
                  )}
                </div>
              </div>
            ),
          }}
          utilities={[
            {
              type: "menu-dropdown",
              id: "user-menu-dropdown",
              expandableGroups: true,
              text: (
                <div
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: "50px",
                    maxWidth: "200px",
                  }}
                >
                  {`${user?.given_name} ${user?.family_name}`}
                </div>
              ),
              iconName: "user-profile",
              items: profileActions,

              onItemClick: async ({ detail }) => {
                switch (detail.id) {
                  case "signout":
                    if (BACKEND_MODE === "lightning") {
                      // Clear credentials from sessionStorage
                      try {
                        const { clearCredentials } = await import(
                          "../../../embedded-backend/src/config/credentials.js"
                        );
                        clearCredentials();
                        console.log("Cleared AWS credentials from sessionStorage");

                        // Force reload to reset auth state and show login page
                        window.location.href = `${BASE_PATH}/login`;
                      } catch (error) {
                        console.error("Error clearing credentials:", error);
                        // Still try to navigate even if clearing fails
                        window.location.href = `${BASE_PATH}/login`;
                      }
                    } else {
                      // Standard sign-out flow for remote mode
                      logOut().then(() => {
                        setAuthUser(null);
                      });
                    }
                    break;
                  case "light":
                    setThemeMode("LIGHT");
                    break;
                  case "dark":
                    setThemeMode("DARK");
                    break;
                  case "system":
                    setThemeMode("SYSTEM");
                    break;
                  default:
                    console.log("Unhandled menu item:", detail.id);
                }
              },
            },
          ]}
        />
      )}
      <ConfirmationModal
        visible={showConfirmModal}
        onConfirm={handleConfirmClear}
        onCancel={handleCancelClear}
        title="Clear Threat Modeling Data"
        message="All threat modeling data will be lost. This action cannot be undone. Are you sure you want to continue?"
      />
    </div>
  );
}

export default TopNavigationMFE;
