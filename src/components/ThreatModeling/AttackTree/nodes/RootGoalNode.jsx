import React from "react";
import PropTypes from "prop-types";
import { Position } from "reactflow";
import { Button, SpaceBetween } from "@cloudscape-design/components";
import CustomSourceHandle from "./CustomSourceHandle";
import "./NodeStyles.css";
import "./NodeActionButtons.css";

const RootGoalNode = ({ data, selected, id }) => {
  const handleEdit = (e) => {
    e.stopPropagation();
    // Trigger custom event that will be caught by the viewer
    const event = new CustomEvent("node-edit", { detail: { nodeId: id }, bubbles: true });
    document.dispatchEvent(event);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    // Trigger custom event that will be caught by the viewer
    const event = new CustomEvent("node-delete", { detail: { nodeId: id }, bubbles: true });
    document.dispatchEvent(event);
  };

  return (
    <div className={`custom-node gate-node root-goal-node ${selected ? "selected" : ""}`}>
      {/* Action Buttons - Only edit, no delete for root goal */}
      {!data.isReadOnly && (
        <div className="node-action-buttons">
          <Button iconName="edit" variant="icon" onClick={handleEdit} ariaLabel="Edit goal node" />
        </div>
      )}

      <CustomSourceHandle
        nodeId={id}
        position={Position.Right}
        style={{ top: "19px" }}
        isReadOnly={data.isReadOnly}
      />

      <div className="gate-node-header">
        <div className="gate-icon root-goal-icon"></div>
        <div className="gate-type">GOAL</div>
      </div>

      <div className="gate-node-body">
        <div className="gate-description">{data.label}</div>
      </div>
    </div>
  );
};

RootGoalNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    isReadOnly: PropTypes.bool,
    edges: PropTypes.array,
    onEdgeDelete: PropTypes.func,
  }).isRequired,
  selected: PropTypes.bool,
  id: PropTypes.string.isRequired,
};

export default RootGoalNode;
