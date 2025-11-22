import { useRef, useEffect } from "react";
import PropTypes from "prop-types";
import Box from "@cloudscape-design/components/box";
import "./AddNodeDropdown.css";

/**
 * AddNodeDropdown Component
 *
 * Animated dropdown menu for selecting node types to add to the attack tree.
 * Provides options for Goal, AND Gate, OR Gate, and Leaf nodes.
 */
const AddNodeDropdown = ({ isOpen, onClose, onSelectNodeType }) => {
  const dropdownRef = useRef(null);

  // Node type options with display names, icons, descriptions, and badge colors
  const nodeOptions = [
    {
      type: "root-goal",
      label: "Goal Node",
      icon: "⊙",
      description: "Root objective of the attack tree",
      badgeColor: "red",
    },
    {
      type: "and-gate",
      label: "AND Gate",
      icon: "⋀",
      description: "All child nodes must succeed",
      badgeColor: "blue",
    },
    {
      type: "or-gate",
      label: "OR Gate",
      icon: "⋁",
      description: "Any child node can succeed",
      badgeColor: "red",
    },
    {
      type: "leaf-attack",
      label: "Leaf Attack",
      icon: "✕",
      description: "Specific attack technique",
      badgeColor: "yellow",
    },
  ];

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside dropdown and not on the add button
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !event.target.closest(".custom-add-button")
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle node type selection
  const handleSelect = (nodeType) => {
    onSelectNodeType(nodeType);
    onClose();
  };

  return (
    <div
      ref={dropdownRef}
      className={`add-node-dropdown ${isOpen ? "open" : ""}`}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: "4px",
        zIndex: 1000,
      }}
      role="menu"
      aria-label="Node type selection menu"
    >
      <Box
        padding="none"
        backgroundColor="background-container-content"
        borderRadius="default"
        className="dropdown-content"
      >
        <div className="dropdown-header">Add Node</div>
        <div className="dropdown-options">
          {nodeOptions.map((option, index) => (
            <div key={option.type}>
              <div
                className="dropdown-option-content"
                onClick={() => handleSelect(option.type)}
                role="menuitem"
                aria-label={`Add ${option.label}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(option.type);
                  }
                }}
              >
                <div className={`dropdown-option-badge badge-${option.badgeColor}`}>
                  {option.icon}
                </div>
                <div className="dropdown-option-text">
                  <div className="dropdown-option-title">{option.label}</div>
                  <div className="dropdown-option-description">{option.description}</div>
                </div>
              </div>
              {index < nodeOptions.length - 1 && <div className="option-divider" />}
            </div>
          ))}
        </div>
      </Box>
    </div>
  );
};

AddNodeDropdown.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelectNodeType: PropTypes.func.isRequired,
};

export default AddNodeDropdown;
