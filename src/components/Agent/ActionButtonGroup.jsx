import { memo } from "react";

/**
 * Renders a group of action buttons with toggle and dropdown support.
 */
const ActionButtonGroup = memo(function ActionButtonGroup({
  actionButtons,
  toggleStates,
  dropdownStates,
  buttonRefs,
  effectiveTheme,
  disabled,
  isStreaming,
  onToggleButton,
  onDropdownClick,
}) {
  return (
    <div className="optional-buttons">
      {actionButtons.map((button, index) => {
        const isToggled = button.isToggle && toggleStates[button.id];
        const isDropdownOpen = dropdownStates[button.id];
        const isActive = button.alwaysActive || isToggled;

        return (
          <button
            key={button.id || index}
            ref={(el) => (buttonRefs.current[button.id] = el)}
            className={`action-button ${button.isToggle || button.alwaysActive ? "toggle-button" : ""} ${isActive ? "toggled" : ""} ${isDropdownOpen ? "dropdown-open" : ""}`}
            onClick={() => onToggleButton(button)}
            disabled={button.disabled || disabled || isStreaming}
            title={button.title}
            data-theme={effectiveTheme}
          >
            <span className="button-main-content">
              {button.icon && <span className="action-icon">{button.icon}</span>}
              {button.label && <span className="button-label">{button.label}</span>}
            </span>
            {((button.isToggle && isToggled) || button.alwaysActive) && button.showDropdown && (
              <>
                <span className="button-separator"></span>
                <span className="dropdown-arrow" onClick={(e) => onDropdownClick(button, e)}>
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
  );
});

export default ActionButtonGroup;
