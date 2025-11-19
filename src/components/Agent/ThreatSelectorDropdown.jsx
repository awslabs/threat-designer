import React, { useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import Badge from "@cloudscape-design/components/badge";
import "./ThreatSelector.css";

/**
 * ThreatSelectorDropdown Component
 *
 * Displays a searchable dropdown list of threats when @ is typed in the chat input.
 * Supports keyboard navigation, filtering, and mouse/touch selection.
 * Follows Cloudscape design patterns with theme-appropriate styling.
 */
const ThreatSelectorDropdown = ({
  threats,
  searchText,
  onSelect,
  onClose,
  theme,
  focusedIndex,
  onFocusChange,
}) => {
  const dropdownRef = useRef(null);
  const optionRefs = useRef([]);

  // Filter threats based on search text (case-insensitive)
  const filteredThreats = React.useMemo(() => {
    if (!searchText) return threats;

    const searchLower = searchText.toLowerCase();
    return threats.filter((threat) => threat.name.toLowerCase().includes(searchLower));
  }, [threats, searchText]);

  // Get likelihood badge color based on likelihood value
  const getLikelihoodColor = (likelihood) => {
    if (!likelihood) return "grey";

    const likelihoodLower = likelihood.toLowerCase();
    switch (likelihoodLower) {
      case "high":
        return "severity-high";
      case "medium":
        return "severity-medium";
      case "low":
        return "severity-low";
      default:
        return "grey";
    }
  };

  // Handle threat selection
  const handleSelect = useCallback(
    (threat) => {
      onSelect(threat);
    },
    [onSelect]
  );

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [onClose]);

  // Scroll focused option into view
  useEffect(() => {
    if (focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex].scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [focusedIndex]);

  // Render empty state messages
  if (threats.length === 0) {
    return (
      <div
        ref={dropdownRef}
        className={`threat-selector-dropdown ${theme}`}
        role="listbox"
        aria-label="Threat selector - no threats available"
        aria-live="polite"
      >
        <div className="threat-empty-message" role="status">
          No threats available in this threat model
        </div>
      </div>
    );
  }

  if (filteredThreats.length === 0) {
    return (
      <div
        ref={dropdownRef}
        className={`threat-selector-dropdown ${theme}`}
        role="listbox"
        aria-label="Threat selector - no matching threats"
        aria-live="polite"
      >
        <div className="threat-empty-message" role="status">
          No threats match your search "{searchText}"
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dropdownRef}
      className={`threat-selector-dropdown ${theme}`}
      role="listbox"
      aria-label={`Threat selector with ${filteredThreats.length} threat${filteredThreats.length === 1 ? "" : "s"}`}
      aria-activedescendant={focusedIndex >= 0 ? `threat-option-${focusedIndex}` : undefined}
    >
      <div className="threat-options-container">
        {filteredThreats.map((threat, index) => (
          <div
            key={threat.name || index}
            id={`threat-option-${index}`}
            ref={(el) => (optionRefs.current[index] = el)}
            className={`threat-option ${focusedIndex === index ? "focused" : ""}`}
            role="option"
            aria-selected={focusedIndex === index}
            aria-label={threat.name}
            onClick={() => handleSelect(threat)}
            onMouseEnter={() => onFocusChange(index)}
            tabIndex={-1}
          >
            <div className="threat-name">{threat.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

ThreatSelectorDropdown.propTypes = {
  threats: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      description: PropTypes.string,
      likelihood: PropTypes.string,
      stride_category: PropTypes.string,
      target_asset: PropTypes.string,
      threat_source: PropTypes.string,
    })
  ).isRequired,
  searchText: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  theme: PropTypes.oneOf(["light", "dark"]).isRequired,
  focusedIndex: PropTypes.number,
  onFocusChange: PropTypes.func,
};

ThreatSelectorDropdown.defaultProps = {
  searchText: "",
  focusedIndex: 0,
  onFocusChange: () => {},
};

export default ThreatSelectorDropdown;
