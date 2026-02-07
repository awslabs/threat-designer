import { useRef, useCallback, useEffect, useMemo } from "react";
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
import { useAgentState } from "./useAgentState";
import { ClockFading, ToolCase } from "lucide-react";

// localStorage keys
const TOOLS_CONFIG_KEY = "toolsConfig";

function ChatInterface({ user, inTools }) {
  const chatContainerRef = useRef(null);
  const { showButton, scrollToBottom, setShowButton, checkScrollPosition } =
    useScrollToBottom(chatContainerRef);

  const isFirstMount = useRef(true);

  // Use consolidated agent state hook
  const {
    state: { budget, thinkingEnabled, toolItems, toolsInitialized, isFirstMountComplete },
    setBudget,
    setThinkingEnabled,
    setToolItems,
    setFirstMountComplete,
  } = useAgentState();

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setFirstMountComplete();
    }
  }, [setFirstMountComplete]);

  // Get both contexts
  const functions = useContext(ChatSessionFunctionsContext);
  const data = useContext(ChatSessionDataContext);

  if (!functions || !data) {
    throw new Error("ChatInterface must be used within a ChatSessionProvider");
  }

  // Check if using OpenAI provider
  const isOpenAI = import.meta.env.VITE_MODEL_PROVIDER === "openai";

  // State for managing tool items properly - now handled by useAgentState

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
  }, [chatTurns.length, setShowButton]);

  // Get available tools from functions context
  const { availableTools = [] } = functions;

  // Initialize tool items when availableTools changes
  useEffect(() => {
    if (availableTools && availableTools.length > 0) {
      const toolsKey = availableTools
        .map((tool) => `${tool.id}-${tool.name || tool.content || tool.id}`)
        .join(",");

      const prevToolsKey = toolItems.map((item) => `${item.id}-${item.content}`).join(",");

      if (prevToolsKey === toolsKey && toolsInitialized) {
        return;
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

      setToolItems(newItems);
    }
  }, [availableTools, toolsInitialized, toolItems, setToolItems]);

  // Save budget to localStorage when it changes
  const handleBudgetChange = useCallback(
    (newBudget) => {
      // For OpenAI, prevent setting budget to "0"
      if (isOpenAI && newBudget === "0") {
        return;
      }

      setBudget(newBudget);
    },
    [isOpenAI, setBudget]
  );

  // Handle thinking toggle
  const handleThinkingToggle = useCallback(
    (isToggled) => {
      // For OpenAI, reasoning cannot be disabled
      // if (isOpenAI && !isToggled) {
      //   return;
      // }

      setThinkingEnabled(isToggled);

      if (isToggled && budget === "0") {
        const defaultBudget = "1";
        setBudget(defaultBudget);
      }
    },
    [budget, setThinkingEnabled, setBudget]
  );

  // Handle tool items change and save to localStorage
  const handleToolItemsChange = useCallback(
    (newItems) => {
      setToolItems(newItems);
    },
    [setToolItems]
  );

  // Handle sending messages through the session
  const handleSendMessage = useCallback(
    async ({ message, sessionId, context }) => {
      // sendMessage signature: (sessionId, userMessage, interrupt, interruptResponse, context)
      // Note: ChatMessage component handles scrolling via its useEffect when isLast changes
      // We don't need to call scrollToBottom here as it would race with ChatMessage's scroll
      functions.sendMessage(sessionId, message, false, null, context);
    },
    [functions]
  );

  // Handle stop streaming
  const handleStopStreaming = useCallback(() => {
    functions.stopStreaming(sessionId);
  }, [functions, sessionId]);

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
        icon: <ClockFading size={18} />,
        // For OpenAI, make it non-toggleable (always active)
        isToggle: true, //!isOpenAI,
        showDropdown: true,
        dropdownContent: () => (
          <ThinkingBudgetWrapper initialBudget={budget} onBudgetChange={handleBudgetChange} />
        ),
        defaultToggled: thinkingEnabled,
        // For OpenAI, make it always appear active
        alwaysActive: false, //isOpenAI,
        onClick: (message, sessionId, isToggled) => {
          handleActionButtonClick("thinking", message, sessionId, isToggled);
        },
      },
      {
        id: "tools",
        label: "Tools",
        icon: <ToolCase size={18} />,
        isToggle: false,
        showDropdown: true,
        dropdownContent: () => (
          <ToolsConfigWrapper items={toolItems} onItemsChange={handleToolItemsChange} />
        ),
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
    (buttonId, isToggled) => {
      if (buttonId === "thinking") {
        handleThinkingToggle(isToggled);
      }
    },
    [handleThinkingToggle]
  );

  const handleDropdownClick = useCallback(() => {
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
          marginBottom: "4px",
        }}
      ></div>
      <div className="tools-container-wrapper">
        <div className="stick-to-bottom" ref={chatContainerRef}>
          {chatTurns.length === 0 ? (
            <AgentLogo />
          ) : (
            <div
              className="stick-to-bottom-content"
              style={{ padding: "8px" }}
              aria-live={isStreaming ? "polite" : "off"}
              aria-atomic="false"
              aria-relevant="additions"
            >
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

        {/* Fade overlay at bottom of chat */}
        {chatTurns.length > 0 && <div className="stick-to-bottom-fade" />}

        {showButton && (
          <ScrollToBottomButton
            scroll={() => scrollToBottom(true)}
            className="scroll-to-bottom-button"
          />
        )}
      </div>

      <div>
        {error && <ErrorContent message={error} dismiss={handleDismissError} />}

        <div style={{ paddingBottom: "5px" }}>
          <ChatInput
            onSendMessage={handleSendMessage}
            onStopStreaming={handleStopStreaming}
            actionButtons={actionButtons}
            placeholder="Ask Sentry a question. Use @ to focus on a threat"
            maxHeight={200}
            autoFocus={true}
            isStreaming={isStreaming}
            tools={toolItems}
            thinkingBudget={thinkingEnabled && budget}
            sessionId={sessionId}
            onToggleButton={handleToggleButton}
            onDropdownClick={handleDropdownClick}
            onHeightChange={checkScrollPosition}
          />
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;
