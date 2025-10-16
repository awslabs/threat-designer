import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import ScrollToBottomButton from "./ScrollToBottomButton";
import { useScrollToBottom } from "./useScrollToBottom";
import ChatContent from "./ChatContent";
import AgentLogo from "./AgentLogo";
import ErrorContent from "./ErrorContent";
import "./styles.css";
import ChatInput from "./ChatInput";
import { ChatSessionFunctionsContext, ChatSessionDataContext } from "./ChatContext";
import { useContext } from "react";
import ThinkingBudgetWrapper from "./ThinkingBudgetWrapper";
import ToolsConfigWrapper from "./ToolsConfigWrapper";
import { useParams } from "react-router";
import AgentLoader from "./LoadingAgent";

// localStorage keys
const THINKING_ENABLED_KEY = "thinkingEnabled";
const THINKING_BUDGET_KEY = "thinkingBudget";
const TOOLS_CONFIG_KEY = "toolsConfig";

function ChatInterface({ user, inTools }) {
  const chatContainerRef = useRef(null);
  const { showButton, scrollToBottom, setShowButton } = useScrollToBottom(chatContainerRef);

  const isFirstMount = useRef(true);
  const [isFirstMountComplete, setIsFirstMountComplete] = useState(false);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setIsFirstMountComplete(true);
    }
  }, []);

  // Get both contexts
  const functions = useContext(ChatSessionFunctionsContext);
  const data = useContext(ChatSessionDataContext);

  if (!functions || !data) {
    throw new Error("ChatInterface must be used within a ChatSessionProvider");
  }

  // Load preferences from localStorage on mount
  const [budget, setBudget] = useState(() => {
    const savedBudget = localStorage.getItem(THINKING_BUDGET_KEY);
    return savedBudget || "1";
  });

  const [thinkingEnabled, setThinkingEnabled] = useState(() => {
    const savedEnabled = localStorage.getItem(THINKING_ENABLED_KEY);
    if (savedEnabled !== null) {
      return savedEnabled === "true";
    }
    return budget !== "0";
  });

  // State for managing tool items properly
  const [toolItems, setToolItems] = useState([]);
  const [toolsInitialized, setToolsInitialized] = useState(false);

  // Generate stable sessionId - only once on mount
  const sessionId = useParams()["*"];

  // Get the session data from the sessions Map
  const currentSession = data.sessions.get(sessionId);
  const isSessionLoading = data.loadingStates.has(sessionId);

  // Destructure session properties with defaults to prevent errors
  const { chatTurns = [], isStreaming = false, error = null } = currentSession || {};

  useEffect(() => {
    if (chatTurns.length === 0) {
      setShowButton(false);
    }
  }, [chatTurns.length]);

  // Get available tools from functions context
  const { availableTools = [] } = functions;

  // Initialize tool items when availableTools changes
  useEffect(() => {
    if (availableTools && availableTools.length > 0) {
      const toolsKey = availableTools
        .map((tool) => `${tool.id}-${tool.name || tool.content || tool.id}`)
        .join(",");

      setToolItems((prevItems) => {
        const prevToolsKey = prevItems.map((item) => `${item.id}-${item.content}`).join(",");

        if (prevToolsKey === toolsKey && toolsInitialized) {
          return prevItems;
        }

        const savedToolsConfig = localStorage.getItem(TOOLS_CONFIG_KEY);
        let savedTools = {};

        try {
          if (savedToolsConfig) {
            savedTools = JSON.parse(savedToolsConfig);
          }
        } catch (e) {
          console.error("Error parsing saved tools config:", e);
        }

        const newItems = availableTools.map((tool) => ({
          id: tool.id,
          content: tool.name || tool.content || tool.id,
          enabled: savedTools[tool.id] !== undefined ? savedTools[tool.id] : true,
        }));

        setToolsInitialized(true);
        return newItems;
      });
    }
  }, [availableTools, toolsInitialized]);

  // Save budget to localStorage when it changes
  const handleBudgetChange = useCallback((newBudget) => {
    setBudget(newBudget);
    localStorage.setItem(THINKING_BUDGET_KEY, newBudget);

    if (newBudget !== "0") {
      setThinkingEnabled(true);
      localStorage.setItem(THINKING_ENABLED_KEY, "true");
    }
  }, []);

  // Handle thinking toggle
  const handleThinkingToggle = useCallback(
    (isToggled) => {
      setThinkingEnabled(isToggled);
      localStorage.setItem(THINKING_ENABLED_KEY, String(isToggled));

      if (isToggled && budget === "0") {
        const defaultBudget = "1";
        setBudget(defaultBudget);
        localStorage.setItem(THINKING_BUDGET_KEY, defaultBudget);
      }
    },
    [budget]
  );

  // Handle tool items change and save to localStorage
  const handleToolItemsChange = useCallback((newItems) => {
    setToolItems(newItems);

    const toolsConfig = {};
    newItems.forEach((item) => {
      toolsConfig[item.id] = item.enabled;
    });

    localStorage.setItem(TOOLS_CONFIG_KEY, JSON.stringify(toolsConfig));
  }, []);

  // Handle sending messages through the session
  const handleSendMessage = useCallback(
    async ({ message, sessionId }) => {
      await functions.sendMessage(sessionId, message);
    },
    [functions, sessionId, thinkingEnabled, budget, toolItems]
  );

  // Handle stop streaming
  const handleStopStreaming = useCallback(
    ({ sessionId: msgSessionId, timestamp }) => {
      functions.stopStreaming(sessionId);
    },
    [functions, sessionId]
  );

  // Handle dismiss error
  const handleDismissError = useCallback(() => {
    functions.dismissError(sessionId);
  }, [functions, sessionId]);

  // Handle action button clicks
  const handleActionButtonClick = useCallback(
    (actionId, message, sessionId, isToggled) => {
      switch (actionId) {
        case "thinking":
          handleThinkingToggle(isToggled);
          break;
        case "tools":
          functions.sendMessage(sessionId, `Use tools to help with: ${message}`);
          break;
        default:
          functions.sendMessage(sessionId, message);
      }
    },
    [functions, handleThinkingToggle]
  );

  // Memoize actionButtons to prevent recreation on every render
  const actionButtons = useMemo(
    () => [
      {
        id: "think",
        label: "Think",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        ),
        isToggle: true,
        showDropdown: true,
        dropdownContent: () => (
          <ThinkingBudgetWrapper initialBudget={budget} onBudgetChange={handleBudgetChange} />
        ),
        defaultToggled: thinkingEnabled,
        onClick: (message, sessionId, isToggled) => {
          handleActionButtonClick("thinking", message, sessionId, isToggled);
        },
      },
      {
        id: "tools",
        label: "Tools",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        ),
        isToggle: false,
        showDropdown: true,
        dropdownContent: () => (
          <ToolsConfigWrapper items={toolItems} onItemsChange={handleToolItemsChange} />
        ),
        onClick: (message, sessionId) => {},
      },
    ],
    [
      budget,
      thinkingEnabled,
      handleBudgetChange,
      handleActionButtonClick,
      toolItems,
      handleToolItemsChange,
    ]
  );

  // Handle toggle button callbacks
  const handleToggleButton = useCallback(
    (buttonId, isToggled, sessionId) => {
      if (buttonId === "thinking") {
        handleThinkingToggle(isToggled);
      }
    },
    [handleThinkingToggle]
  );

  const handleDropdownClick = useCallback((buttonId, sessionId) => {
    // Handle dropdown opening logic here
  }, []);

  // Show loading state if session is not ready
  if (isSessionLoading) {
    return <AgentLoader />;
  }

  return (
    <div className={inTools ? "tools-main-div" : "main-div"}>
      <div
        style={{
          marginBottom: "10px",
        }}
      ></div>
      <div className="tools-container-wrapper">
        <div className="stick-to-bottom" ref={chatContainerRef}>
          {chatTurns.length === 0 ? (
            <AgentLogo />
          ) : (
            <div className="stick-to-bottom-content">
              <ChatContent
                chatTurns={chatTurns}
                user={user}
                streaming={isStreaming}
                scroll={scrollToBottom}
                isParentFirstMount={!isFirstMountComplete}
              />
            </div>
          )}
        </div>

        {showButton && (
          <ScrollToBottomButton scroll={scrollToBottom} className="scroll-to-bottom-button" />
        )}
      </div>

      <div>
        {error && <ErrorContent message={error} dismiss={handleDismissError} />}

        <div style={{ padding: "5px" }}>
          <ChatInput
            onSendMessage={handleSendMessage}
            onStopStreaming={handleStopStreaming}
            actionButtons={actionButtons}
            placeholder="Ask Sentry..."
            maxHeight={200}
            autoFocus={true}
            isStreaming={isStreaming}
            tools={toolItems}
            thinkingBudget={thinkingEnabled && budget}
            sessionId={sessionId}
            onToggleButton={handleToggleButton}
            onDropdownClick={handleDropdownClick}
          />
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;
