import React from "react";
import PropTypes from "prop-types";
import { Handle, Position } from "reactflow";
import { Badge, Box } from "@cloudscape-design/components";
import "./NodeStyles.css";

const ANDGateNode = ({ data, selected }) => {
  const isFocused = data.isFocused || false;

  return (
    <div
      className={`custom-node gate-node and-gate-node ${selected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="node-handle"
        style={{ top: "19px" }}
      />

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

      <Handle
        type="source"
        position={Position.Right}
        className="node-handle"
        style={{ top: "19px" }}
      />
    </div>
  );
};

ANDGateNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    gateType: PropTypes.string,
  }).isRequired,
  selected: PropTypes.bool,
};

export default ANDGateNode;
