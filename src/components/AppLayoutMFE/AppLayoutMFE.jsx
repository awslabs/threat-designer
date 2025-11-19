import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout, SplitPanel } from "@cloudscape-design/components";
import Main from "../../Main";
import "@cloudscape-design/global-styles/index.css";
import "./AppLayoutMFE.css";
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

  // State management for drawer width (Requirements 1.4, 1.5, 2.1)
  const defaultWidth = 500;
  const minWidth = 300;
  const maxWidthPercent = 0.9; // 90% of window width
  const [drawerWidth, setDrawerWidth] = useState(defaultWidth);

  // Calculate split panel width based on content type
  // Check if it's an attack tree by looking at the context (string or React element with Attack Tree text)
  const isAttackTree =
    (typeof splitPanelContext?.context === "string" &&
      splitPanelContext.context.includes("Attack Tree")) ||
    splitPanelContext?.isAttackTree === true;

  // Calculate width based on content type (Requirement 2.1)
  // Attack Tree: 70% of window width (fixed)
  // Other content: user-set width or default 500px, clamped to min/max constraints
  const maxWidth = Math.floor(window.innerWidth * maxWidthPercent);
  const clampedDrawerWidth = Math.max(minWidth, Math.min(drawerWidth, maxWidth));
  const splitPanelWidth = isAttackTree ? Math.floor(window.innerWidth * 0.7) : clampedDrawerWidth;

  // Handle resize events for non-Attack Tree content (Requirements 1.1, 1.2)
  // Memoize to prevent unnecessary re-renders
  const handleSplitPanelResize = useCallback(
    (event) => {
      // Only update width for non-Attack Tree content
      if (!isAttackTree) {
        // Clamp the width to min/max constraints (300px to 90% of window)
        const newWidth = event.detail.size;
        const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
        setDrawerWidth(clampedWidth);
      }
    },
    [isAttackTree, minWidth, maxWidth]
  );

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

  // Memoize the split panel content to prevent unnecessary re-renders
  // This is critical for preventing AttackTreeViewer from unmounting on theme changes
  const RenderSplitPanelContent = useCallback(() => {
    if (splitPanelContext?.content) {
      return splitPanelContext.content;
    } else {
      return <></>;
    }
  }, [splitPanelContext?.content]);

  // Memoize i18nStrings to prevent SplitPanel re-renders on theme changes
  const splitPanelI18nStrings = useMemo(
    () => ({
      preferencesTitle: "Split panel preferences",
      preferencesPositionLabel: "Split panel position",
      preferencesPositionDescription: "Choose the default split panel position for the service.",
      preferencesPositionSide: "Side",
      preferencesPositionBottom: "Bottom",
      preferencesConfirm: "Confirm",
      preferencesCancel: "Cancel",
      closeButtonAriaLabel: "Close drawer panel",
      openButtonAriaLabel: "Open drawer panel",
      resizeHandleAriaLabel: isAttackTree
        ? "Resize disabled for Attack Tree view"
        : "Resize drawer panel. Minimum width 300 pixels, maximum width 90 percent of window",
    }),
    [isAttackTree]
  );

  // Memoize conditional resize props to prevent SplitPanel re-renders
  const splitPanelResizeProps = useMemo(
    () => (!isAttackTree ? { onSplitPanelResize: handleSplitPanelResize } : {}),
    [isAttackTree, handleSplitPanelResize]
  );

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
          splitPanelSize={splitPanelWidth}
          onSplitPanelToggle={(event) => setSplitPanelOpen(event.detail.open)}
          drawers={!splitPanelOpen && functions.visible && sentryEnabled ? items : []}
          splitPanel={
            <SplitPanel
              hidePreferencesButton={true}
              closeBehavior={"hide"}
              header={splitPanelContext?.context || "Details"}
              i18nStrings={splitPanelI18nStrings}
              {...splitPanelResizeProps}
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
