import React, { useState } from "react";
import PropTypes from "prop-types";
import { Handle, Position } from "reactflow";
import { Modal, Box, SpaceBetween, ColumnLayout, Badge } from "@cloudscape-design/components";
import "./NodeStyles.css";

const getSeverityBadgeColor = (severity) => {
  const colorMap = {
    low: "severity-low",
    medium: "severity-medium",
    high: "severity-high",
    critical: "severity-critical",
  };
  return colorMap[severity] || "grey";
};

const LeafAttackNode = ({ data, selected }) => {
  const [showModal, setShowModal] = useState(false);

  const handleNodeClick = (e) => {
    e.stopPropagation();
    setShowModal(true);
  };

  return (
    <>
      <div
        className={`custom-node leaf-attack-node ${selected ? "selected" : ""}`}
        onClick={handleNodeClick}
        style={{
          cursor: "pointer",
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="node-handle"
          style={{ top: "19px", left: "-5px" }}
        />

        <div className="leaf-node-header">
          <Badge color={getSeverityBadgeColor(data.impactSeverity)}>
            {data.impactSeverity || "Impact"}
          </Badge>
          <div className="leaf-attack-phase">{data.attackChainPhase}</div>
        </div>

        <div className="leaf-node-body">
          <div className="leaf-node-description">{data.label}</div>
        </div>
      </div>

      <Modal
        visible={showModal}
        onDismiss={() => setShowModal(false)}
        header={data.label}
        size="large"
      >
        <SpaceBetween size="l">
          {data.description && (
            <div>
              <Box variant="awsui-key-label">Attack Description</Box>
              <Box>{data.description}</Box>
            </div>
          )}

          <ColumnLayout columns={3} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">Impact Severity</Box>
              <Badge color={getSeverityBadgeColor(data.impactSeverity)}>
                {data.impactSeverity}
              </Badge>
            </div>
            {data.likelihood && (
              <div>
                <Box variant="awsui-key-label">Likelihood</Box>
                <Badge color={getSeverityBadgeColor(data.likelihood)}>{data.likelihood}</Badge>
              </div>
            )}
            <div>
              <Box variant="awsui-key-label">Attack Chain Phase</Box>
              <Box>{data.attackChainPhase}</Box>
            </div>
          </ColumnLayout>

          {data.prerequisites && data.prerequisites.length > 0 && (
            <div>
              <Box variant="awsui-key-label">Prerequisites</Box>
              <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
                {data.prerequisites.map((prereq, idx) => (
                  <li key={idx} style={{ marginBottom: "4px" }}>
                    {prereq}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.techniques && data.techniques.length > 0 && (
            <div>
              <Box variant="awsui-key-label">Attack Techniques</Box>
              <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
                {data.techniques.map((tech, idx) => (
                  <li key={idx} style={{ marginBottom: "4px" }}>
                    {tech}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.skillLevel && (
            <div>
              <Box variant="awsui-key-label">Skill Level Required</Box>
              <Box style={{ textTransform: "capitalize" }}>{data.skillLevel}</Box>
            </div>
          )}

          {data.tools && data.tools.length > 0 && (
            <div>
              <Box variant="awsui-key-label">Tools Required</Box>
              <Box>{data.tools.join(", ")}</Box>
            </div>
          )}

          <ColumnLayout columns={2} variant="text-grid">
            {data.timeRequired && (
              <div>
                <Box variant="awsui-key-label">Time Required</Box>
                <Box>{data.timeRequired}</Box>
              </div>
            )}
            {data.cost && (
              <div>
                <Box variant="awsui-key-label">Cost</Box>
                <Box>{data.cost}</Box>
              </div>
            )}
          </ColumnLayout>

          {data.detectionProbability !== undefined && (
            <div>
              <Box variant="awsui-key-label">Detection Probability</Box>
              <Box>{(data.detectionProbability * 100).toFixed(0)}%</Box>
            </div>
          )}

          {data.cvssScore !== undefined && (
            <div>
              <Box variant="awsui-key-label">CVSS Score</Box>
              <Box>{data.cvssScore}</Box>
            </div>
          )}
        </SpaceBetween>
      </Modal>
    </>
  );
};

LeafAttackNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
    attackChainPhase: PropTypes.oneOf([
      "Reconnaissance",
      "Resource Development",
      "Initial Access",
      "Execution",
      "Persistence",
      "Privilege Escalation",
      "Defense Evasion",
      "Credential Access",
      "Discovery",
      "Lateral Movement",
      "Collection",
      "Command and Control",
      "Exfiltration",
      "Impact",
    ]).isRequired,
    feasibility: PropTypes.number,
    skillLevel: PropTypes.oneOf(["novice", "intermediate", "expert"]),
    impactSeverity: PropTypes.oneOf(["low", "medium", "high", "critical"]),
    likelihood: PropTypes.oneOf(["low", "medium", "high", "critical"]),
    mitreAttack: PropTypes.string,
    techniques: PropTypes.arrayOf(PropTypes.string),
    prerequisites: PropTypes.arrayOf(PropTypes.string),
    tools: PropTypes.arrayOf(PropTypes.string),
    timeRequired: PropTypes.string,
    detectionProbability: PropTypes.number,
    cost: PropTypes.string,
    cvssScore: PropTypes.number,
  }).isRequired,
  selected: PropTypes.bool,
};

export default React.memo(LeafAttackNode);
