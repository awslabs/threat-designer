import { useState, useCallback, useMemo, useEffect, useContext } from "react";
import { ChatSessionFunctionsContext } from "../ChatContext";

/**
 * Custom hook for managing threat selector state and logic.
 * Handles threat filtering, selection, keyboard navigation, and screen reader announcements.
 */
export function useThreatSelector({ sessionId, textareaRef, onHeightChange }) {
  const functions = useContext(ChatSessionFunctionsContext);

  const [selectedThreat, setSelectedThreat] = useState(null);
  const [showThreatSelector, setShowThreatSelector] = useState(false);
  const [threatSearchText, setThreatSearchText] = useState("");
  const [focusedThreatIndex, setFocusedThreatIndex] = useState(0);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState("");

  // Get available threats from session context
  const getAvailableThreats = useCallback(() => {
    try {
      const context = functions.getSessionContext(sessionId);
      if (!context?.threatModel) return [];
      return context.threatModel.threats || [];
    } catch (error) {
      console.error("Error getting available threats:", error);
      return [];
    }
  }, [functions, sessionId]);

  const availableThreats = getAvailableThreats();

  // Filter threats based on search text
  const filteredThreats = useMemo(() => {
    if (!threatSearchText) return availableThreats;
    const searchLower = threatSearchText.toLowerCase();
    return availableThreats.filter((threat) => threat.name.toLowerCase().includes(searchLower));
  }, [availableThreats, threatSearchText]);

  // Handle threat selection
  const handleThreatSelect = useCallback(
    (threat, message, setMessage) => {
      setSelectedThreat(threat);
      setShowThreatSelector(false);
      setThreatSearchText("");

      setScreenReaderAnnouncement(`Threat selected: ${threat.name}`);
      setTimeout(() => setScreenReaderAnnouncement(""), 1000);

      const textarea = textareaRef?.current;
      if (textarea && message.startsWith("@")) {
        const cursorPos = textarea.selectionStart;
        const newMessage = message.substring(cursorPos).trim();
        setMessage(newMessage);

        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(0, 0);
          onHeightChange?.();
        }, 0);
      } else {
        setTimeout(() => onHeightChange?.(), 0);
      }
    },
    [textareaRef, onHeightChange]
  );

  // Handle threat dismissal
  const handleThreatDismiss = useCallback(() => {
    const threatName = selectedThreat?.name;
    setSelectedThreat(null);

    if (threatName) {
      setScreenReaderAnnouncement(`Threat removed: ${threatName}`);
      setTimeout(() => setScreenReaderAnnouncement(""), 1000);
    }

    setTimeout(() => {
      textareaRef?.current?.focus();
      onHeightChange?.();
    }, 0);
  }, [selectedThreat, textareaRef, onHeightChange]);

  // Check for @ trigger in input
  const checkForThreatTrigger = useCallback(
    (value, cursorPos) => {
      const textBeforeCursor = value.substring(0, cursorPos);

      if (textBeforeCursor.startsWith("@")) {
        const context = functions.getSessionContext(sessionId);
        if (!context?.threatModel) {
          setShowThreatSelector(false);
          return false;
        }

        const textAfterAt = textBeforeCursor.substring(1);
        setThreatSearchText(textAfterAt);
        setShowThreatSelector(true);
        setFocusedThreatIndex(0);
        return true;
      }

      setShowThreatSelector(false);
      return false;
    },
    [functions, sessionId]
  );

  // Handle keyboard navigation
  const handleThreatKeyDown = useCallback(
    (e, onSelect, message, setMessage) => {
      if (!showThreatSelector) return false;

      if (e.key === "Escape") {
        e.preventDefault();
        setShowThreatSelector(false);
        setThreatSearchText("");
        return true;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedThreatIndex((prev) => Math.min(prev + 1, filteredThreats.length - 1));
        return true;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedThreatIndex((prev) => Math.max(prev - 1, 0));
        return true;
      }

      if (e.key === "Enter" && filteredThreats.length > 0) {
        e.preventDefault();
        handleThreatSelect(filteredThreats[focusedThreatIndex], message, setMessage);
        return true;
      }

      return false;
    },
    [showThreatSelector, filteredThreats, focusedThreatIndex, handleThreatSelect]
  );

  // Clear threat context when session is cleared
  useEffect(() => {
    const context = functions.getSessionContext(sessionId);
    if (context && !context.diagram && !context.threatModel && selectedThreat) {
      setSelectedThreat(null);
      setShowThreatSelector(false);
      setThreatSearchText("");
    }
  }, [functions, sessionId, selectedThreat]);

  const closeThreatSelector = useCallback(() => {
    setShowThreatSelector(false);
    setThreatSearchText("");
  }, []);

  return {
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
  };
}

export default useThreatSelector;
