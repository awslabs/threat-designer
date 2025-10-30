import React, { useState, useEffect } from "react";
import { AppLayout, SplitPanel } from "@cloudscape-design/components";
import Main from "../../Main";
import "@cloudscape-design/global-styles/index.css";
import { useSplitPanel } from "../../SplitPanelContext";
import { useLocation } from "react-router-dom";
import Agent from "../../pages/Agent/Agent";
import Button from "@cloudscape-design/components/button";
import { useContext } from "react";
import { ChatSessionFunctionsContext } from "../Agent/ChatContext";
import { isSentryEnabled } from "../../config";

const appLayoutLabels = {
  navigation: "Side navigation",
  navigationToggle: "Open side navigation",
  navigationClose: "Close side navigation",
};

function isValidUUID(str) {
  // Regular expression to check if string is a valid UUID
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(str);
}

function AppLayoutMFE({ user }) {
  const [navOpen, setNavOpen] = useState(true);
  const { splitPanelOpen, setSplitPanelOpen, splitPanelContext } = useSplitPanel();
  const location = useLocation();
  const trimmedPath = location.pathname.substring(1);

  const functions = useContext(ChatSessionFunctionsContext);
  const sentryEnabled = isSentryEnabled();

  const handleClearSession = async () => {
    if (isValidUUID(trimmedPath)) {
      await functions.clearSession(trimmedPath);
    }
  };

  if (!isValidUUID(trimmedPath)) {
    functions.setisVisible(false);
  }

  useEffect(() => {
    setSplitPanelOpen(false);
  }, [location.pathname, setSplitPanelOpen]);

  const RenderSplitPanelContent = () => {
    if (splitPanelContext?.content) {
      return splitPanelContext.content;
    } else {
      return <></>;
    }
  };

  const items = sentryEnabled
    ? [
        {
          ariaLabels: {
            closeButton: "Close",
            drawerName: "Assistant",
            triggerButton: "Open Assistant",
            resizeHandle: "Resize Assistant",
          },
          resizable: true,
          defaultSize: 650,
          content: (
            <div
              style={{
                overflowY: "auto",
                minWidth: "600",
                paddingLeft: "10px",
                paddingTop: "10px",
                paddingRight: "24px",
                paddingBottom: "0px",
              }}
            >
              <div
                style={{
                  marginBottom: "0px",
                  marginTop: "6px",
                  paddingRight: "50px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <Button iconName="edit" variant="link" onClick={handleClearSession}>
                  New Chat
                </Button>
              </div>
              <Agent user={user} inTools={true} />
            </div>
          ),
          id: "Assistant",
          trigger: {
            iconName: "gen-ai",
          },
        },
      ]
    : [];

  return (
    <div>
      {user && (
        <AppLayout
          disableContentPaddings={false}
          splitPanelOpen={splitPanelOpen}
          splitPanelPreferences={{ position: "side" }}
          onSplitPanelToggle={(event) => setSplitPanelOpen(event.detail.open)}
          drawers={!splitPanelOpen && functions.visible && sentryEnabled ? items : []}
          splitPanel={
            <SplitPanel
              hidePreferencesButton={true}
              closeBehavior={"hide"}
              header={splitPanelContext?.context || "Details"}
            >
              {<RenderSplitPanelContent />}
            </SplitPanel>
          }
          content={<Main user={user} />}
          navigationHide={true}
          toolsHide
          headerSelector={"#h"}
          ariaLabels={appLayoutLabels}
          navigationOpen={navOpen}
          onNavigationChange={() => setNavOpen(!navOpen)}
        />
      )}
    </div>
  );
}

export default AppLayoutMFE;
