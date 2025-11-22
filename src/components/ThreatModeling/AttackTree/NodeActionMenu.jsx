import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Button, SpaceBetween } from "@cloudscape-design/components";
import "./NodeActionMenu.css";

/**
 * NodeActionMenu Component
 *
 * Displays a hover menu above nodes with edit and delete buttons.
 * Implements debounced hover detection to prevent flickering.
 */
const NodeActionMenu = ({ nodeId, nodeType, position, onEdit, onDelete, visible }) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);

  // Debounce visibility changes to prevent flickering
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (visible) {
      // Show immediately when hovering
      setIsVisible(true);
    } else {
      // Delay hiding to allow moving mouse to menu
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 150);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [visible]);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // Calculate menu position above the node
  // Offset: -60px from node top for more space, centered horizontally
  const menuStyle = {
    position: "absolute",
    left: `${position.x}px`,
    top: `${position.y - 60}px`,
    transform: "translateX(-50%)",
    zIndex: 1000,
    pointerEvents: "auto",
  };

  // Handle edit button click
  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit(nodeId);
  };

  // Handle delete button click
  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(nodeId);
  };

  return (
    <div
      className="node-action-menu"
      style={menuStyle}
      role="toolbar"
      aria-label={`Actions for ${nodeType} node`}
    >
      <SpaceBetween direction="horizontal" size="xs">
        <Button
          iconName="edit"
          variant="icon"
          onClick={handleEdit}
          ariaLabel={`Edit ${nodeType} node`}
          title={`Edit this ${nodeType} node`}
        />
        <Button
          iconName="remove"
          variant="icon"
          onClick={handleDelete}
          ariaLabel={`Delete ${nodeType} node`}
          title={`Delete this ${nodeType} node`}
        />
      </SpaceBetween>
    </div>
  );
};

NodeActionMenu.propTypes = {
  nodeId: PropTypes.string.isRequired,
  nodeType: PropTypes.string.isRequired,
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
  }).isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  visible: PropTypes.bool.isRequired,
};

export default NodeActionMenu;
