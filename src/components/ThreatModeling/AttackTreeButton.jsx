import React from "react";
import PropTypes from "prop-types";
import Button from "@cloudscape-design/components/button";

/**
 * AttackTreeButton component
 *
 * Renders an icon button that triggers the attack tree visualization
 * for a specific threat. The button is displayed in the threat container
 * header and opens the attack tree in a side drawer when clicked.
 *
 * Accessible to all users (owner, editor, readonly) for viewing.
 * Create/delete operations are restricted within the viewer.
 */
const AttackTreeButton = ({ threatId, threatName, onOpenAttackTree, disabled = false }) => {
  const handleClick = () => {
    if (!disabled && onOpenAttackTree) {
      onOpenAttackTree(threatId, threatName);
    }
  };

  return (
    <Button
      variant="icon"
      iconName="share"
      ariaLabel={`View attack tree for ${threatName}`}
      onClick={handleClick}
      disabled={disabled}
    />
  );
};

AttackTreeButton.propTypes = {
  threatId: PropTypes.string.isRequired,
  threatName: PropTypes.string.isRequired,
  onOpenAttackTree: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default AttackTreeButton;
