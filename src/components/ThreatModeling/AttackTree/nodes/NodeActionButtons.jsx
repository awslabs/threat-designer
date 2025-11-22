import React from "react";
import PropTypes from "prop-types";
import { Button, SpaceBetween } from "@cloudscape-design/components";
import "./NodeActionButtons.css";

/**
 * NodeActionButtons Component
 *
 * Action buttons (edit/delete) that appear on hover within each node.
 * Positioned absolutely above the node content.
 */
const NodeActionButtons = ({ nodeId, nodeType, onEdit, onDelete, isReadOnly }) => {
  if (isReadOnly) {
    return null;
  }

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit(nodeId);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(nodeId);
  };

  return (
    <div className="node-action-buttons">
      <SpaceBetween direction="horizontal" size="xs">
        <Button
          iconName="edit"
          variant="icon"
          onClick={handleEdit}
          ariaLabel={`Edit ${nodeType} node`}
        />
        <Button
          iconName="remove"
          variant="icon"
          onClick={handleDelete}
          ariaLabel={`Delete ${nodeType} node`}
        />
      </SpaceBetween>
    </div>
  );
};

NodeActionButtons.propTypes = {
  nodeId: PropTypes.string.isRequired,
  nodeType: PropTypes.string.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  isReadOnly: PropTypes.bool,
};

export default NodeActionButtons;
