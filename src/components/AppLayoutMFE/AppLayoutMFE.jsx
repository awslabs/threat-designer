import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout, SplitPanel } from "@cloudscape-design/components";
import Main from "../../Main";
import "@cloudscape-design/global-styles/index.css";
import "./AppLayoutMFE.css";
import "./AppLayoutMFE.css";
import { useSplitPanel } from "../../SplitPanelContext";
import { useLocation } from "react-router-dom";
import Agent from "../../pages/Agent/Agent";
import Button from "@cloudscape-design/components/button";
import { useContext } from "react";
import { ChatSessionFunctionsContext } from "../Agent/ChatContext";
import { isSentryEnabled } from "../../config";
import { useTheme } from "../ThemeContext";

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
  const { effectiveTheme } = useTheme();

  // State management for drawer width
  const defaultWidth = 600;
  const minWidth = 400;
  const maxWidthPercent = 0.9; // 90% of window width
  const [drawerWidth, setDrawerWidth] = useState(defaultWidth);

  // Calculate split panel width based on content type
  // Check if it's an attack tree by looking at the context (string or React element with Attack Tree text)
  const isAttackTree =
    (typeof splitPanelContext?.context === "string" &&
      splitPanelContext.context.includes("Attack Tree")) ||
    splitPanelContext?.isAttackTree === true;

  // Calculate width based on content type
  // Attack Tree: 70% of window width (fixed)
  // Other content: user-set width or default 500px, clamped to min/max constraints
  const maxWidth = Math.floor(window.innerWidth * maxWidthPercent);
  const clampedDrawerWidth = Math.max(minWidth, Math.min(drawerWidth, maxWidth));
  const splitPanelWidth = isAttackTree ? Math.floor(window.innerWidth * 0.7) : clampedDrawerWidth;

  // Handle resize events for non-Attack Tree content
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
            iconSvg: (
              <svg
                width="40"
                height="40"
                viewBox="0 0 422 582"
                xmlns="http://www.w3.org/2000/svg"
                xmlnsXlink="http://www.w3.org/1999/xlink"
              >
                <g transform="translate(-1370 -339)">
                  <path
                    d="M1396.92 571.242 1395.89 573.668 1396.92 574.096ZM1541.06 343.052 1541.06 552.678 1427.07 501.513 1427.07 586.635 1541.06 634.036 1541.06 890.87 1373 777.21 1373 777.21 1373 777.21 1373 524.87 1373.81 524.87 1373 518C1373 431.754 1444.64 359.796 1539.88 343.154ZM1622.33 343 1624.12 343.154C1719.36 359.796 1791 431.754 1791 518L1790.19 524.87 1791 524.87 1791 777.21 1790.98 777.21 1622.33 888.793 1622.33 634.898 1739.54 584.353 1738.51 505.603 1622.33 551.917Z"
                    fill="white"
                    fillRule="evenodd"
                  />
                </g>
              </svg>
            ),
          },
        },
      ]
    : [];

  return (
    <div className="app-layout-container">
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
          ariaLabels={appLayoutLabels}
          navigationOpen={navOpen}
          onNavigationChange={() => setNavOpen(!navOpen)}
        />
      )}
    </div>
  );
}

export default AppLayoutMFE;
