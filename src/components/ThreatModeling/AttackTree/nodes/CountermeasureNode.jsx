import React from "react";
import PropTypes from "prop-types";
import { Handle, Position } from "reactflow";
import Box from "@cloudscape-design/components/box";
import Badge from "@cloudscape-design/components/badge";
import Icon from "@cloudscape-design/components/icon";
import "./NodeStyles.css";

const CountermeasureNode = ({ data, selected }) => {
  return (
    <div className={`custom-node countermeasure-node ${selected ? "selected" : ""}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="node-handle"
        style={{ top: "19px" }}
      />

      <div className="node-header">
        <Icon name="security" size="medium" variant="success" />
        <Badge color="green">COUNTERMEASURE</Badge>
      </div>

      <div className="node-content">
        <Box variant="strong" fontSize="body-m">
          {data.label}
        </Box>

        {data.effectiveness !== undefined && (
          <div className="effectiveness-bar">
            <Box variant="small" color="text-body-secondary">
              Effectiveness: {data.effectiveness}%
            </Box>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${data.effectiveness}%` }} />
            </div>
          </div>
        )}

        {data.implemented !== undefined && (
          <div className="implementation-status">
            <Box
              variant="small"
              color={data.implemented ? "text-status-success" : "text-status-inactive"}
            >
              {data.implemented ? "✓ Implemented" : "Not Implemented"}
            </Box>
          </div>
        )}
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

CountermeasureNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    effectiveness: PropTypes.number,
    implemented: PropTypes.bool,
  }).isRequired,
  selected: PropTypes.bool,
};

export default CountermeasureNode;
