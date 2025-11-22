import React from "react";
import PropTypes from "prop-types";
import "./ThreatSelector.css";

/**
 * ThreatContextToken Component
 *
 * Displays a selected threat as a removable token above the chat input field.
 * Follows Cloudscape design patterns with theme-appropriate styling.
 */
const ThreatContextToken = ({ threat, onDismiss }) => {
  if (!threat) return null;

  return (
    <div className="threat-context-token">
      <span className="threat-context-token-label" id="threat-context-label">
        {threat.name}
      </span>
      <button
        className="threat-context-token-dismiss"
        onClick={onDismiss}
        aria-label={`Remove ${threat.name} from context`}
        aria-describedby="threat-context-label"
        title="Remove threat from context"
        type="button"
      >
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
};

ThreatContextToken.propTypes = {
  threat: PropTypes.shape({
    name: PropTypes.string.isRequired,
    likelihood: PropTypes.string,
    stride_category: PropTypes.string,
  }).isRequired,
  onDismiss: PropTypes.func.isRequired,
};

export default ThreatContextToken;
