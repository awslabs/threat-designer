import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import "./ChatInput.css";
import "./ThreatSelector.css";
import { useTheme } from "../ThemeContext";
import { ChatSessionFunctionsContext } from "./ChatContext";
import { useContext } from "react";
import ThreatContextToken from "./ThreatContextToken";
import ThreatSelectorDropdown from "./ThreatSelectorDropdown";

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
  const [selectedThreat, setSelectedThreat] = useState(null);
  const [showThreatSelector, setShowThreatSelector] = useState(false);
  const [threatSearchText, setThreatSearchText] = useState("");
  const [focusedThreatIndex, setFocusedThreatIndex] = useState(0);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState("");
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const dropdownRefs = useRef({});
  const buttonRefs = useRef({});
  const debounceTimerRef = useRef(null);
  const prevMessageRef = useRef("");
  const preparingRef = useRef(false);
  const isFirstMount = useRef(true);
  const { effectiveTheme } = useTheme();
  const functions = useContext(ChatSessionFunctionsContext);

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

  // Get available threats from session context
  // Note: We don't use useMemo here because the context can change without dependencies changing
  // (e.g., when navigating between threat models with the same sessionId)
  const getAvailableThreats = useCallback(() => {
    try {
      const context = functions.getSessionContext(sessionId);

      // Check if threat model exists in context
      if (!context?.threatModel) {
        return [];
      }

      // The threat model structure is: context.threatModel.threats (array)
      const threats = context.threatModel.threats || [];
      return threats;
    } catch (error) {
      console.error("Error getting available threats:", error);
      return [];
    }
  }, [functions, sessionId]);

  // Get threats on every render to ensure we have the latest context
  const availableThreats = getAvailableThreats();

  // Filter threats based on search text with memoization
  const filteredThreats = useMemo(() => {
    if (!threatSearchText) return availableThreats;

    const searchLower = threatSearchText.toLowerCase();
    return availableThreats.filter((threat) => threat.name.toLowerCase().includes(searchLower));
  }, [availableThreats, threatSearchText]);

  // Handle threat selection
  const handleThreatSelect = useCallback(
    (threat) => {
      setSelectedThreat(threat);
      setShowThreatSelector(false);
      setThreatSearchText("");

      // Announce selection to screen readers
      setScreenReaderAnnouncement(`Threat selected: ${threat.name}`);
      setTimeout(() => setScreenReaderAnnouncement(""), 1000);

      // Remove @ and search text from the beginning of message
      const textarea = textareaRef.current;
      if (textarea && message.startsWith("@")) {
        const cursorPos = textarea.selectionStart;
        // Remove everything from @ to cursor position
        const newMessage = message.substring(cursorPos).trim();
        setMessage(newMessage);

        // Keep focus on textarea after selection
        setTimeout(() => {
          textarea.focus();
          // Set cursor to beginning
          textarea.setSelectionRange(0, 0);
        }, 0);
      }
    },
    [message]
  );

  // Handle threat dismissal
  const handleThreatDismiss = useCallback(() => {
    const threatName = selectedThreat?.name;
    setSelectedThreat(null);

    // Announce removal to screen readers
    if (threatName) {
      setScreenReaderAnnouncement(`Threat removed: ${threatName}`);
      setTimeout(() => setScreenReaderAnnouncement(""), 1000);
    }

    // Keep focus on textarea after dismissal
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 0);
  }, [selectedThreat]);

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
      // Get the full context including selectedThreat
      const fullContext = functions.getSessionContext(sessionId);

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

      // Call prepareSession with full context including selectedThreat
      await functions.prepareSession(
        currentSessionId,
        enabledToolIds,
        fullContext,
        fullContext?.diagram,
        processedThinkingBudget
      );
    } catch (error) {
      // Log error to console but don't block UI
      console.error("Error preparing session:", error);
      // Don't throw - allow UI to continue functioning
    } finally {
      // Always reset the flag when done (success or error)
      preparingRef.current = false;
    }
  }, [functions, currentSessionId, sessionId, tools, processedThinkingBudget]);

  useEffect(() => {
    if (isFirstMount.current) {
      const timer = setTimeout(() => {
        isFirstMount.current = false;
      }, 2000);

      return () => clearTimeout(timer);
    }
    prepareSession();
  }, [prepareSession]);

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

  // Handle click outside to close dropdowns and threat selector
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Handle action button dropdowns
      if (activeDropdown) {
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
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [maxHeight]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [message, adjustTextareaHeight]);

  const handleInputChange = useCallback(
    (e) => {
      const value = e.target.value;
      setMessage(value);

      // Check for @ symbol to show threat selector - ONLY at the beginning of input
      const textarea = textareaRef.current;
      if (textarea) {
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = value.substring(0, cursorPos);

        // Only trigger if @ is at the very beginning (position 0)
        if (textBeforeCursor.startsWith("@")) {
          const textAfterAt = textBeforeCursor.substring(1);

          // Check if threat model exists in context (silent failure if not)
          const context = functions.getSessionContext(sessionId);
          if (!context?.threatModel) {
            // Treat @ as regular character when no threat model exists
            setShowThreatSelector(false);
            return;
          }

          // Show dropdown - allow spaces in search text for multi-word threat names
          setThreatSearchText(textAfterAt);
          setShowThreatSelector(true);
          setFocusedThreatIndex(0);
          return;
        }
      }

      setShowThreatSelector(false);
    },
    [functions, sessionId]
  );

  const handleKeyDown = useCallback(
    (e) => {
      // Handle threat selector keyboard navigation
      if (showThreatSelector) {
        if (e.key === "Escape") {
          e.preventDefault();
          setShowThreatSelector(false);
          setThreatSearchText("");
          return;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedThreatIndex((prev) => Math.min(prev + 1, filteredThreats.length - 1));
          return;
        }

        if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedThreatIndex((prev) => Math.max(prev - 1, 0));
          return;
        }

        if (e.key === "Enter" && filteredThreats.length > 0) {
          e.preventDefault();
          handleThreatSelect(filteredThreats[focusedThreatIndex]);
          return;
        }
      }

      // Original Enter key handling
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) {
          handleStopStreaming();
        } else {
          handleSend();
        }
      }
    },
    [showThreatSelector, filteredThreats, focusedThreatIndex, handleThreatSelect, isStreaming]
  );

  const handleSend = useCallback(() => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && onSendMessage && !disabled && !isStreaming) {
      const messageData = {
        message: trimmedMessage,
        sessionId: currentSessionId,
        timestamp: new Date().toISOString(),
        toggleStates: { ...toggleStates },
      };

      // Add threat context if a threat is selected
      if (selectedThreat) {
        messageData.context = {
          threat_in_focus: selectedThreat,
        };
      }

      onSendMessage(messageData);
      setMessage("");
    }
  }, [
    message,
    onSendMessage,
    disabled,
    isStreaming,
    currentSessionId,
    toggleStates,
    selectedThreat,
  ]);

  const handleStopStreaming = useCallback(() => {
    if (onStopStreaming && isStreaming) {
      onStopStreaming({
        sessionId: currentSessionId,
        timestamp: new Date().toISOString(),
      });
    }
  }, [onStopStreaming, isStreaming, currentSessionId]);

  const handleToggleButton = useCallback(
    (button) => {
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
    },
    [
      activeDropdown,
      dropdownStates,
      closeDropdown,
      toggleStates,
      onToggleButton,
      message,
      currentSessionId,
    ]
  );

  const handleDropdownClick = useCallback(
    (button, event) => {
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
    },
    [dropdownStates, visibleDropdown, closeDropdown, onDropdownClick, currentSessionId]
  );

  useEffect(() => {
    if (autoFocus && textareaRef.current && !isStreaming) {
      textareaRef.current.focus();
    }
  }, [autoFocus, isStreaming]);

  // Clear threat context when session is cleared
  useEffect(() => {
    const context = functions.getSessionContext(sessionId);

    // If context is cleared (both diagram and threatModel are null), clear selected threat
    if (context && !context.diagram && !context.threatModel && selectedThreat) {
      setSelectedThreat(null);
      setShowThreatSelector(false);
      setThreatSearchText("");
    }
  }, [functions, sessionId, selectedThreat]);

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
      {/* Screen Reader Announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {screenReaderAnnouncement}
      </div>

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

      {/* Threat Selector Dropdown */}
      {showThreatSelector && (
        <ThreatSelectorDropdown
          threats={filteredThreats}
          searchText={threatSearchText}
          onSelect={handleThreatSelect}
          onClose={() => {
            setShowThreatSelector(false);
            setThreatSearchText("");
          }}
          theme={effectiveTheme}
          focusedIndex={focusedThreatIndex}
          onFocusChange={setFocusedThreatIndex}
        />
      )}

      {/* Main Chat Input */}
      <div className={`chat-input-container ${effectiveTheme}`}>
        {/* Threat Context Token Row */}
        {selectedThreat && (
          <div className="threat-context-row">
            <ThreatContextToken
              threat={selectedThreat}
              onDismiss={handleThreatDismiss}
              theme={effectiveTheme}
            />
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={isStreaming ? "Streaming response..." : placeholder}
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          rows={1}
          aria-label="Chat message input"
          aria-describedby={selectedThreat ? "threat-context-label" : undefined}
          aria-expanded={showThreatSelector}
          aria-controls={showThreatSelector ? "threat-selector-dropdown" : undefined}
          aria-autocomplete="list"
          role="combobox"
        />
        <div className="button-row">
          <div className="optional-buttons">
            {actionButtons.map((button, index) => {
              const isToggled = button.isToggle && toggleStates[button.id];
              const isDropdownOpen = dropdownStates[button.id];
              // For alwaysActive buttons, treat them as always toggled
              const isActive = button.alwaysActive || isToggled;

              return (
                <button
                  key={button.id || index}
                  ref={(el) => (buttonRefs.current[button.id] = el)}
                  className={`action-button ${button.isToggle || button.alwaysActive ? "toggle-button" : ""} ${isActive ? "toggled" : ""} ${isDropdownOpen ? "dropdown-open" : ""}`}
                  onClick={() => handleToggleButton(button)}
                  disabled={button.disabled || disabled || isStreaming}
                  title={button.title}
                  data-theme={effectiveTheme}
                >
                  <span className="button-main-content">
                    {button.icon && <span className="action-icon">{button.icon}</span>}
                    {button.label && <span className="button-label">{button.label}</span>}
                  </span>
                  {((button.isToggle && isToggled) || button.alwaysActive) &&
                    button.showDropdown && (
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
