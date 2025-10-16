import React, { useState, useRef, useEffect, useCallback } from "react";
import "./ChatInput.css";
import { useTheme } from "../ThemeContext";
import { ChatSessionFunctionsContext } from "./ChatContext";
import { useContext } from "react";

const ChatInput = ({
  onSendMessage,
  onStopStreaming,
  actionButtons = [],
  placeholder = "Ask anything...",
  maxHeight = 200,
  autoFocus = true,
  disabled = false,
  isStreaming = false,
  sessionId = null,
  tools = [],
  thinkingBudget = 0,
  onToggleButton = () => {},
  onDropdownClick = () => {},
}) => {
  const [message, setMessage] = useState("");
  const [toggleStates, setToggleStates] = useState({});
  const [dropdownStates, setDropdownStates] = useState({});
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [visibleDropdown, setVisibleDropdown] = useState(null);
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const dropdownRefs = useRef({});
  const buttonRefs = useRef({});
  const debounceTimerRef = useRef(null);
  const prevMessageRef = useRef("");
  const preparingRef = useRef(false);
  const { effectiveTheme } = useTheme();
  const functions = useContext(ChatSessionFunctionsContext);
  const context = functions.getSessionContext(sessionId);

  const [currentSessionId] = useState(() => {
    if (sessionId) return sessionId;

    const generateSessionId = () => {
      const uuid = crypto.randomUUID();
      const timestamp = Date.now().toString(36);
      const randomSuffix = Math.random().toString(36).substring(2);
      return `${uuid}-${timestamp}-${randomSuffix}`;
    };

    return generateSessionId();
  });

  // Convert thinkingBudget value
  const processedThinkingBudget = thinkingBudget === false ? 0 : thinkingBudget;

  // JSON-only parsing function
  const parseToolString = (toolString) => {
    try {
      return JSON.parse(toolString);
    } catch (error) {
      console.error("Invalid JSON tool string:", toolString, error);
      return null;
    }
  };

  // Function to close dropdown with animation
  const closeDropdown = useCallback((buttonId, immediate = false) => {
    if (immediate) {
      // Immediate close without animation
      setDropdownStates((prev) => ({
        ...prev,
        [buttonId]: false,
      }));
      // Only clear active/visible if it's the button being closed
      setActiveDropdown((current) => (current === buttonId ? null : current));
      setVisibleDropdown((current) => (current === buttonId ? null : current));
      setIsClosing(false);
    } else {
      // Animated close
      setIsClosing(true);

      setTimeout(() => {
        setDropdownStates((prev) => ({
          ...prev,
          [buttonId]: false,
        }));
        // Only clear active/visible if it's still the same button
        setActiveDropdown((current) => (current === buttonId ? null : current));
        setVisibleDropdown((current) => (current === buttonId ? null : current));
        setIsClosing(false);
      }, 200);
    }
  }, []);

  // Function to prepare session
  const prepareSession = useCallback(async () => {
    // If already preparing, skip this call
    if (preparingRef.current) {
      return;
    }

    preparingRef.current = true;

    try {
      // Parse and filter tools to get only enabled tool IDs
      const enabledToolIds =
        tools
          ?.map((tool) => {
            // Handle both string and object formats
            if (typeof tool === "string") {
              // Only parse valid JSON strings
              return parseToolString(tool);
            } else if (typeof tool === "object" && tool !== null) {
              // If it's already an object
              return tool;
            }
            return null;
          })
          .filter((tool) => tool !== null && tool.enabled === true)
          .map((tool) => tool.id) || [];

      await functions.prepareSession(
        currentSessionId,
        enabledToolIds,
        context?.threatModel,
        context?.diagram,
        processedThinkingBudget
      );
    } catch (error) {
      console.error("Error preparing session:", error);
    } finally {
      // Always reset the flag when done (success or error)
      preparingRef.current = false;
    }
  }, [
    functions,
    currentSessionId,
    tools,
    context?.threatModel,
    context?.diagram,
    processedThinkingBudget,
  ]);

  // Call prepareSession when main parameters change
  useEffect(() => {
    prepareSession();
  }, [prepareSession]);

  useEffect(() => {
    prepareSession();
  }, []);

  // Debounced prepareSession call when user is typing
  useEffect(() => {
    const currentMessage = message.trim();
    const prevMessage = prevMessageRef.current.trim();

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (currentMessage) {
      if (!prevMessage) {
        // Message went from empty to non-empty - first time typing, call immediately
        prepareSession();
      } else {
        // Message was already non-empty and still is - use debounce
        debounceTimerRef.current = setTimeout(() => {
          prepareSession();
        }, 500);
      }
    }

    // Update previous message for next comparison
    prevMessageRef.current = message;

    // Cleanup function
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [message, prepareSession]);

  // Run prepareSession every 300 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      prepareSession();
    }, 300000);

    return () => clearInterval(interval);
  }, [prepareSession]);

  // Initialize toggle states
  useEffect(() => {
    const initialStates = {};
    const initialDropdownStates = {};
    actionButtons.forEach((button) => {
      if (button.isToggle) {
        initialStates[button.id] = button.defaultToggled || false;
      }
      // Initialize dropdown states for all buttons with showDropdown
      if (button.showDropdown) {
        initialDropdownStates[button.id] = false;
      }
    });
    setToggleStates(initialStates);
    setDropdownStates(initialDropdownStates);
  }, [actionButtons]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!activeDropdown) return;

      const dropdownElement = dropdownRefs.current[activeDropdown];
      const buttonElement = buttonRefs.current[activeDropdown];

      // Get the actual content element
      const contentElement = dropdownElement?.querySelector(".dropdown-content");

      // Check if click is outside the actual content (not just the container)
      const isOutsideContent = contentElement ? !contentElement.contains(event.target) : true;
      const isOutsideButton = buttonElement ? !buttonElement.contains(event.target) : true;

      if (isOutsideContent && isOutsideButton) {
        closeDropdown(activeDropdown);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [activeDropdown, closeDropdown]);

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message, maxHeight]);

  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        handleStopStreaming();
      } else {
        handleSend();
      }
    }
  };

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && onSendMessage && !disabled && !isStreaming) {
      onSendMessage({
        message: trimmedMessage,
        sessionId: currentSessionId,
        timestamp: new Date().toISOString(),
        toggleStates: { ...toggleStates },
      });
      setMessage("");
    }
  };

  const handleStopStreaming = () => {
    if (onStopStreaming && isStreaming) {
      onStopStreaming({
        sessionId: currentSessionId,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleToggleButton = (button) => {
    // Handle dropdown for non-toggle buttons - entire button click toggles dropdown
    if (!button.isToggle && button.showDropdown) {
      const isCurrentlyActive = activeDropdown === button.id;
      const isCurrentlyOpen = dropdownStates[button.id];

      if (isCurrentlyActive && isCurrentlyOpen) {
        // Clicking the same button that's open - close it
        closeDropdown(button.id, false);
      } else {
        // Either clicking a different button or reopening the same button
        // Reset all states first to avoid conflicts
        setIsClosing(false);

        // Update all states atomically
        setDropdownStates((prev) => {
          const newStates = {};
          Object.keys(prev).forEach((key) => {
            newStates[key] = key === button.id;
          });
          return newStates;
        });

        setActiveDropdown(button.id);
        setVisibleDropdown(button.id);
      }

      if (button.onClick) {
        button.onClick(message, currentSessionId);
      }
      return;
    }

    // Toggle button logic - ONLY handles toggle, NOT dropdown
    if (button.isToggle) {
      const newState = !toggleStates[button.id];
      setToggleStates((prev) => ({
        ...prev,
        [button.id]: newState,
      }));

      // If toggling off, close dropdown with animation
      if (!newState && dropdownStates[button.id]) {
        closeDropdown(button.id, false);
      } else if (newState && button.showDropdown) {
        // Just set up the button as active, but don't open dropdown
        // The arrow click will handle the dropdown
        setActiveDropdown(button.id);
        // Don't set visibleDropdown here - let the arrow handle it
      } else if (!newState) {
        // When toggling off, clean up dropdown states
        setActiveDropdown(null);
        setVisibleDropdown(null);
      }

      onToggleButton(button.id, newState, currentSessionId);

      if (button.onClick) {
        button.onClick(message, currentSessionId, newState);
      }
    } else {
      // Non-toggle button without dropdown
      if (button.onClick) {
        button.onClick(message, currentSessionId);
      }
    }
  };

  const handleDropdownClick = (button, event) => {
    event.stopPropagation();

    const isCurrentlyOpen = dropdownStates[button.id];

    if (!isCurrentlyOpen) {
      // Opening this dropdown
      // If another dropdown is open, close it without animation for smooth transition
      if (visibleDropdown && visibleDropdown !== button.id) {
        setDropdownStates((prev) => ({
          ...prev,
          [visibleDropdown]: false,
        }));
      }

      // Open the new dropdown
      setIsClosing(false);
      setDropdownStates((prev) => ({
        ...prev,
        [button.id]: true,
      }));
      setActiveDropdown(button.id);
      setVisibleDropdown(button.id);
    } else {
      // Closing dropdown - use animation
      closeDropdown(button.id, false);
    }

    onDropdownClick(button.id, currentSessionId, !isCurrentlyOpen);
  };

  useEffect(() => {
    if (autoFocus && textareaRef.current && !isStreaming) {
      textareaRef.current.focus();
    }
  }, [autoFocus, isStreaming]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const canSend = message.trim().length > 0 && !disabled && !isStreaming;
  const canStop = isStreaming && !disabled;

  // Get the active dropdown component using visibleDropdown
  const activeDropdownButton = actionButtons.find((button) => button.id === visibleDropdown);

  return (
    <div className={`chat-input-wrapper ${effectiveTheme}`} ref={containerRef}>
      {/* Dropdown Content Area */}
      {activeDropdownButton && activeDropdownButton.dropdownContent && (
        <div
          className={`dropdown-content-container ${isClosing ? "closing" : ""}`}
          ref={(el) => (dropdownRefs.current[activeDropdownButton.id] = el)}
        >
          <div className="dropdown-content">
            {typeof activeDropdownButton.dropdownContent === "function"
              ? activeDropdownButton.dropdownContent({
                  message,
                  sessionId: currentSessionId,
                  isToggled: toggleStates[activeDropdownButton.id] || false,
                  onClose: () => closeDropdown(activeDropdownButton.id),
                })
              : activeDropdownButton.dropdownContent}
          </div>
        </div>
      )}

      {/* Main Chat Input */}
      <div className={`chat-input-container ${effectiveTheme}`}>
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={isStreaming ? "Streaming response..." : placeholder}
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          rows={1}
        />
        <div className="button-row">
          <div className="optional-buttons">
            {actionButtons.map((button, index) => {
              const isToggled = button.isToggle && toggleStates[button.id];
              const isDropdownOpen = dropdownStates[button.id];

              return (
                <button
                  key={button.id || index}
                  ref={(el) => (buttonRefs.current[button.id] = el)}
                  className={`action-button ${button.isToggle ? "toggle-button" : ""} ${isToggled ? "toggled" : ""} ${isDropdownOpen ? "dropdown-open" : ""}`}
                  onClick={() => handleToggleButton(button)}
                  disabled={button.disabled || disabled || isStreaming}
                  title={button.title}
                  data-theme={effectiveTheme}
                >
                  <span className="button-main-content">
                    {button.icon && <span className="action-icon">{button.icon}</span>}
                    {button.label && <span className="button-label">{button.label}</span>}
                  </span>
                  {button.isToggle && isToggled && button.showDropdown && (
                    <>
                      <span className="button-separator"></span>
                      <span
                        className="dropdown-arrow"
                        onClick={(e) => handleDropdownClick(button, e)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: isDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s ease",
                          }}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {isStreaming ? (
            <button
              className="stop-button"
              onClick={handleStopStreaming}
              disabled={!canStop}
              aria-label="Stop streaming"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              className="send-button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
