import React from "react";
import PropTypes from "prop-types";
import { Position } from "reactflow";
import { Badge, Button, SpaceBetween } from "@cloudscape-design/components";
import CustomSourceHandle from "./CustomSourceHandle";
import CustomTargetHandle from "./CustomTargetHandle";
import "./NodeStyles.css";
import "./NodeActionButtons.css";

const ANDGateNode = ({ data, selected, id }) => {
  const isFocused = data.isFocused || false;

  const handleEdit = (e) => {
    e.stopPropagation();
    const event = new CustomEvent("node-edit", { detail: { nodeId: id }, bubbles: true });
    document.dispatchEvent(event);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    const event = new CustomEvent("node-delete", { detail: { nodeId: id }, bubbles: true });
    document.dispatchEvent(event);
  };

  return (
    <div
      className={`custom-node gate-node and-gate-node ${selected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
    >
      {/* Action Buttons - Hidden when node is focused */}
      {!data.isReadOnly && !isFocused && (
        <div className="node-action-buttons">
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              iconName="edit"
              variant="icon"
              onClick={handleEdit}
              ariaLabel="Edit AND gate node"
            />
            <Button
              iconName="remove"
              variant="icon"
              onClick={handleDelete}
              ariaLabel="Delete AND gate node"
            />
          </SpaceBetween>
        </div>
      )}

      {!isFocused && (
        <CustomTargetHandle
          nodeId={id}
          position={Position.Left}
          style={{ top: "19px" }}
          isReadOnly={data.isReadOnly}
          edges={data.edges || []}
          onEdgeDelete={data.onEdgeDelete}
        />
      )}

      <div className="gate-node-header">
        <div className="gate-icon">⋀</div>
        <div className="gate-type">AND</div>
        <div className="gate-badge-wrapper">
          <Badge color="grey">Logic Gate</Badge>
        </div>
      </div>

      <div className="gate-node-body">
        <div className="gate-description">{data.label}</div>
      </div>

      <CustomSourceHandle
        nodeId={id}
        position={Position.Right}
        style={{ top: "19px" }}
        isReadOnly={data.isReadOnly}
      />
    </div>
  );
};

ANDGateNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    gateType: PropTypes.string,
    isReadOnly: PropTypes.bool,
    edges: PropTypes.array,
    onEdgeDelete: PropTypes.func,
  }).isRequired,
  selected: PropTypes.bool,
  id: PropTypes.string.isRequired,
};

export default ANDGateNode;
