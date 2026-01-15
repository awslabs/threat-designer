import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Custom hook for managing action button states and dropdown logic.
 * Handles toggle states, dropdown visibility, and click-outside behavior.
 */
export function useActionButtons({ actionButtons, onToggleButton, onDropdownClick }) {
  const [toggleStates, setToggleStates] = useState({});
  const [dropdownStates, setDropdownStates] = useState({});
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [visibleDropdown, setVisibleDropdown] = useState(null);

  const dropdownRefs = useRef({});
  const buttonRefs = useRef({});

  // Initialize toggle states
  useEffect(() => {
    const initialStates = {};
    const initialDropdownStates = {};
    actionButtons.forEach((button) => {
      if (button.isToggle) {
        initialStates[button.id] = button.defaultToggled || false;
      }
      if (button.showDropdown) {
        initialDropdownStates[button.id] = false;
      }
    });
    setToggleStates(initialStates);
    setDropdownStates(initialDropdownStates);
  }, [actionButtons]);

  // Close dropdown with animation
  const closeDropdown = useCallback((buttonId, immediate = false) => {
    if (immediate) {
      setDropdownStates((prev) => ({ ...prev, [buttonId]: false }));
      setActiveDropdown((current) => (current === buttonId ? null : current));
      setVisibleDropdown((current) => (current === buttonId ? null : current));
      setIsClosing(false);
    } else {
      setIsClosing(true);
      setTimeout(() => {
        setDropdownStates((prev) => ({ ...prev, [buttonId]: false }));
        setActiveDropdown((current) => (current === buttonId ? null : current));
        setVisibleDropdown((current) => (current === buttonId ? null : current));
        setIsClosing(false);
      }, 200);
    }
  }, []);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeDropdown) {
        const dropdownElement = dropdownRefs.current[activeDropdown];
        const buttonElement = buttonRefs.current[activeDropdown];
        const contentElement = dropdownElement?.querySelector(".dropdown-content");

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

  // Handle toggle button click
  const handleToggleButton = useCallback(
    (button, message, currentSessionId) => {
      // Handle dropdown for non-toggle buttons
      if (!button.isToggle && button.showDropdown) {
        const isCurrentlyActive = activeDropdown === button.id;
        const isCurrentlyOpen = dropdownStates[button.id];

        if (isCurrentlyActive && isCurrentlyOpen) {
          closeDropdown(button.id, false);
        } else {
          setIsClosing(false);
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

        button.onClick?.(message, currentSessionId);
        return;
      }

      // Toggle button logic
      if (button.isToggle) {
        const newState = !toggleStates[button.id];
        setToggleStates((prev) => ({ ...prev, [button.id]: newState }));

        if (!newState && dropdownStates[button.id]) {
          closeDropdown(button.id, false);
        } else if (newState && button.showDropdown) {
          setActiveDropdown(button.id);
        } else if (!newState) {
          setActiveDropdown(null);
          setVisibleDropdown(null);
        }

        onToggleButton?.(button.id, newState);
        button.onClick?.(message, currentSessionId, newState);
      } else {
        button.onClick?.(message, currentSessionId);
      }
    },
    [activeDropdown, dropdownStates, closeDropdown, toggleStates, onToggleButton]
  );

  // Handle dropdown arrow click
  const handleDropdownClick = useCallback(
    (button, event) => {
      event.stopPropagation();

      const isCurrentlyOpen = dropdownStates[button.id];

      if (!isCurrentlyOpen) {
        if (visibleDropdown && visibleDropdown !== button.id) {
          setDropdownStates((prev) => ({ ...prev, [visibleDropdown]: false }));
        }

        setIsClosing(false);
        setDropdownStates((prev) => ({ ...prev, [button.id]: true }));
        setActiveDropdown(button.id);
        setVisibleDropdown(button.id);
      } else {
        closeDropdown(button.id, false);
      }

      onDropdownClick?.();
    },
    [dropdownStates, visibleDropdown, closeDropdown, onDropdownClick]
  );

  // Get active dropdown button
  const activeDropdownButton = actionButtons.find((button) => button.id === visibleDropdown);

  return {
    toggleStates,
    dropdownStates,
    isClosing,
    visibleDropdown,
    dropdownRefs,
    buttonRefs,
    activeDropdownButton,
    closeDropdown,
    handleToggleButton,
    handleDropdownClick,
  };
}

export default useActionButtons;
