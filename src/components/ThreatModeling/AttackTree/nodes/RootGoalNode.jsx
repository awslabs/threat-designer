import React from "react";
import PropTypes from "prop-types";
import { Handle, Position } from "reactflow";
import { Badge } from "@cloudscape-design/components";
import "./NodeStyles.css";

const RootGoalNode = ({ data, selected }) => {
  return (
    <div className={`custom-node gate-node root-goal-node ${selected ? "selected" : ""}`}>
      <Handle
        type="source"
        position={Position.Right}
        className="node-handle"
        style={{ top: "19px" }}
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
  }).isRequired,
  selected: PropTypes.bool,
};

export default RootGoalNode;
