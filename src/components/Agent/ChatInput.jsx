import { useState, useRef, useEffect, useCallback } from "react";
import "./ChatInput.css";
import "./ThreatSelector.css";
import { useTheme } from "../ThemeContext";
import ThreatContextToken from "./ThreatContextToken";
import ThreatSelectorDropdown from "./ThreatSelectorDropdown";
import ActionButtonGroup from "./ActionButtonGroup";
import { useSessionPreparation } from "./hooks/useSessionPreparation";
import { useThreatSelector } from "./hooks/useThreatSelector";
import { useActionButtons } from "./hooks/useActionButtons";

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
  onHeightChange = () => {},
}) => {
  const [message, setMessage] = useState("");
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const { effectiveTheme } = useTheme();

  // Custom hooks for separated concerns
  const { currentSessionId, prepareSessionOnTyping } = useSessionPreparation({
    sessionId,
    tools,
    thinkingBudget,
  });

  const {
    selectedThreat,
    showThreatSelector,
    threatSearchText,
    focusedThreatIndex,
    setFocusedThreatIndex,
    screenReaderAnnouncement,
    availableThreats,
    filteredThreats,
    handleThreatSelect,
    handleThreatDismiss,
    checkForThreatTrigger,
    handleThreatKeyDown,
    closeThreatSelector,
  } = useThreatSelector({
    sessionId,
    textareaRef,
    onHeightChange,
  });

  const {
    toggleStates,
    dropdownStates,
    isClosing,
    dropdownRefs,
    buttonRefs,
    activeDropdownButton,
    closeDropdown,
    handleToggleButton,
    handleDropdownClick,
  } = useActionButtons({
    actionButtons,
    onToggleButton,
    onDropdownClick,
  });

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      onHeightChange();
    }
  }, [maxHeight, onHeightChange]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [message, adjustTextareaHeight]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current && !isStreaming) {
      textareaRef.current.focus();
    }
  }, [autoFocus, isStreaming]);

  const handleInputChange = useCallback(
    (e) => {
      const value = e.target.value;
      setMessage(value);
      prepareSessionOnTyping(value);

      const textarea = textareaRef.current;
      if (textarea) {
        const cursorPos = textarea.selectionStart;
        checkForThreatTrigger(value, cursorPos);
      }
    },
    [prepareSessionOnTyping, checkForThreatTrigger]
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

      if (selectedThreat) {
        // Strip notes from threat_in_focus to reduce payload
        const { notes, ...threatWithoutNotes } = selectedThreat;
        messageData.context = {
          threat_in_focus: threatWithoutNotes,
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
      onStopStreaming();
    }
  }, [onStopStreaming, isStreaming]);

  const handleKeyDown = useCallback(
    (e) => {
      // Handle threat selector keyboard navigation first
      if (handleThreatKeyDown(e, handleThreatSelect, message, setMessage)) {
        return;
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
    [handleThreatKeyDown, handleThreatSelect, message, isStreaming, handleStopStreaming, handleSend]
  );

  const onButtonToggle = useCallback(
    (button) => {
      handleToggleButton(button, message, currentSessionId);
    },
    [handleToggleButton, message, currentSessionId]
  );

  const canSend = message.trim().length > 0 && !disabled && !isStreaming;
  const canStop = isStreaming && !disabled;

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
          onSelect={(threat) => handleThreatSelect(threat, message, setMessage)}
          onClose={closeThreatSelector}
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
            <ThreatContextToken threat={selectedThreat} onDismiss={handleThreatDismiss} />
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
          aria-haspopup={availableThreats.length > 0 ? "listbox" : undefined}
          aria-expanded={showThreatSelector}
          aria-controls={showThreatSelector ? "threat-selector-dropdown" : undefined}
          aria-autocomplete={availableThreats.length > 0 ? "list" : undefined}
        />
        <div className="button-row">
          <ActionButtonGroup
            actionButtons={actionButtons}
            toggleStates={toggleStates}
            dropdownStates={dropdownStates}
            buttonRefs={buttonRefs}
            effectiveTheme={effectiveTheme}
            disabled={disabled}
            isStreaming={isStreaming}
            onToggleButton={onButtonToggle}
            onDropdownClick={handleDropdownClick}
          />

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
