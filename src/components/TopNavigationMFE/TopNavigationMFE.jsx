import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";
import "@cloudscape-design/global-styles/index.css";
import { TopNavigation, Button } from "@cloudscape-design/components";
import { logOut } from "../../services/Auth/auth";
import Shield from "../../components/ThreatModeling/images/shield.png";

function TopNavigationMFE({ user, setAuthUser }) {
  const navigate = useNavigate();
  const navBarRef = useRef(null);
  const i18nStrings = {
    searchIconAriaLabel: "Search",
    searchDismissIconAriaLabel: "Close search",
    overflowMenuTriggerText: "More",
  };

  const profileActions = [
    {
      id: "support-group",
      text: "Support",
      items: [],
    },
    { id: "signout", text: "Sign out" },
  ];

  const handleSelect = (directTo) => {
    if (directTo) {
      navigate(directTo);
    }
  };

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
                    gap: "12px",
                    marginRight: "60px", // Increased margin to create more separation
                  }}
                >
                  <a href="/" style={{ textDecoration: "none" }}>
                    <img
                      src={Shield}
                      alt="Security Center"
                      style={{
                        height: "40px",
                        marginTop: "5px",
                        width: "auto",
                        cursor: "pointer",
                      }}
                    />
                  </a>
                  <div style={{ fontSize: "18px", marginTop: "2px", color: "white" }}>
                    Threat Designer
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
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

              // In the TopNavigation component
              onItemClick: ({ detail }) => {
                switch (detail.id) {
                  case "signout":
                    logOut().then(() => {
                      setAuthUser(null); // Update the auth state after logout
                    });
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
