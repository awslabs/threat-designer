import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";
import "@cloudscape-design/global-styles/index.css";
import { TopNavigation, Button } from "@cloudscape-design/components";
import { logOut } from "../../services/Auth/auth";
import Shield from "../../components/ThreatModeling/images/shield.png";
import customTheme from "../../customTheme";
import { MonitorCog, Moon, Sun } from 'lucide-react';

const getConditionalColor = (checkValue, effectiveTheme, colorMode) => {
  return colorMode === checkValue 
    ? (effectiveTheme === "dark" 
        ? "#42b4ff" 
        : "#006ce0")
    : undefined;
};

function TopNavigationMFE({ user, setAuthUser, colorMode, setThemeMode, effectiveTheme }) {
  const navigate = useNavigate();
  const navBarRef = useRef(null);
  const i18nStrings = {
    searchIconAriaLabel: "Search",
    searchDismissIconAriaLabel: "Close search",
    overflowMenuTriggerText: "More",
  };


  const profileActions = [
    { id: "signout", text: "Sign out" },
     {id: "theme", text: "Theme", type:"menu-dropdown", items:
       [
        {
        id: "system", text: <span style={{ 
          color: getConditionalColor("system", effectiveTheme, colorMode), 
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px"
        }}>
          <MonitorCog size="16px" /> System
        </span>
        },
        {
          id: "light", text: <span style={{ 
            whiteSpace: "nowrap",
            color: getConditionalColor("light", effectiveTheme, colorMode),
            display: "inline-flex",
            alignItems: "center",
            gap: "4px"
          }}>
            <Sun size="16px" /> Light
          </span>
          },
          {
            id: "dark", text: <span style={{ 
              whiteSpace: "nowrap",
              color: getConditionalColor("dark", effectiveTheme, colorMode),
              display: "inline-flex",
              alignItems: "center",
              gap: "4px"
            }}>
              <Moon size="16px" /> Dark
            </span>
            },
      ]
    }];

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
                      alt="Security Center"
                      style={{
                        height: "24px",
                        marginTop: "0px",
                        width: "auto",
                        cursor: "pointer",
                      }}
                    />
                  </a>
                  <div style={{ fontSize: "16px", color: effectiveTheme === "dark" ? `${customTheme.contexts["top-navigation"].tokens.colorTextInteractiveActive.dark}` :  `${customTheme.contexts["top-navigation"].tokens.colorTextInteractiveActive.light}`}}>
                    Threat Designer
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0px" }}>
                  <Button
                    variant="link"
                    onClick={() => {
                      navigate("/");
                    }}
                  >
                    New
                  </Button>
                  <Button
                    variant="link"
                    onClick={() => {
                      navigate("/threat-catalog");
                    }}
                  >
                    Threat Catalog
                  </Button>
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

              onItemClick: ({ detail }) => {
                switch (detail.id) {
                  case "signout":
                    logOut().then(() => {
                      setAuthUser(null);
                    });
                    break;
                  case "light":
                    setThemeMode("LIGHT")
                    break;
                  case "dark":
                    setThemeMode("DARK")
                    break;
                  case "system":
                    setThemeMode("SYSTEM")
                    break;
                  default:
                    console.log("Unhandled menu item:", detail.id);
                }
              },
            },
          ]}
        />
      )}
    </div>
  );
}

export default TopNavigationMFE;
