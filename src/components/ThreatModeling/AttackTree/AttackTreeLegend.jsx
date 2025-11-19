import React from "react";
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Icon from "@cloudscape-design/components/icon";
import "./AttackTreeLegend.css";

const AttackTreeLegend = () => {
  const legendItems = [
    {
      type: "Root Goal",
      color: "#d13212",
      description: "Primary attack objective",
      icon: null,
    },
    {
      type: "AND Gate",
      color: "#7d3c98",
      description: "All children must succeed",
      icon: null,
    },
    {
      type: "OR Gate",
      color: "#0972d3",
      description: "Any child can succeed",
      icon: null,
    },
    {
      type: "Attack Vector",
      color: null,
      description: "Individual attack methods",
      icon: null,
      severityColors: [
        { label: "Low", color: "#037f0c" },
        { label: "Medium", color: "#f89256" },
        { label: "High", color: "#ff9900" },
        { label: "Critical", color: "#d13212" },
      ],
    },
    {
      type: "Countermeasure",
      color: "#037f0c",
      description: "Defensive controls",
      icon: "security",
    },
  ];

  return (
    <div className="attack-tree-legend">
      <Container
        header={
          <Box variant="h3" fontSize="heading-s">
            Legend
          </Box>
        }
      >
        <SpaceBetween size="s">
          {legendItems.map((item, index) => (
            <div key={index} className="legend-item">
              {item.severityColors ? (
                <div className="legend-item-content">
                  <Box variant="strong" fontSize="body-s">
                    {item.type}
                  </Box>
                  <Box variant="small" color="text-body-secondary">
                    {item.description}
                  </Box>
                  <div className="severity-colors">
                    {item.severityColors.map((severity, idx) => (
                      <div key={idx} className="severity-item">
                        <div
                          className="legend-color-box"
                          style={{ backgroundColor: severity.color }}
                        />
                        <Box variant="small" fontSize="body-xs">
                          {severity.label}
                        </Box>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="legend-item-content">
                  <div className="legend-item-header">
                    <div className="legend-color-box" style={{ backgroundColor: item.color }} />
                    {item.icon && <Icon name={item.icon} size="small" variant="success" />}
                    <Box variant="strong" fontSize="body-s">
                      {item.type}
                    </Box>
                  </div>
                  <Box variant="small" color="text-body-secondary">
                    {item.description}
                  </Box>
                </div>
              )}
            </div>
          ))}
        </SpaceBetween>
      </Container>
    </div>
  );
};

export default AttackTreeLegend;
