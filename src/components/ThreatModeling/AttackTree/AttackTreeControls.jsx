import React from "react";
import PropTypes from "prop-types";
import Button from "@cloudscape-design/components/button";
import ButtonGroup from "@cloudscape-design/components/button-group";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ToggleButton from "@cloudscape-design/components/toggle-button";
import Box from "@cloudscape-design/components/box";
import { useReactFlow } from "reactflow";

/**
 * AttackTreeControls Component
 *
 * Provides interactive controls for the attack tree visualization including:
 * - Layout direction toggle (vertical/horizontal)
 * - Zoom controls (in/out)
 * - Fit view button
 */
const AttackTreeControls = ({ layoutDirection, onLayoutChange }) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const handleZoomIn = () => {
    zoomIn({ duration: 300 });
  };

  const handleZoomOut = () => {
    zoomOut({ duration: 300 });
  };

  const handleFitView = () => {
    fitView({ padding: 0.2, duration: 300 });
  };

  const handleLayoutToggle = (detail) => {
    const newDirection = detail.pressed ? "LR" : "TB";
    onLayoutChange(newDirection);
  };

  return (
    <Box padding="s" backgroundColor="background-container-content" borderRadius="default">
      <SpaceBetween size="s" direction="vertical">
        {/* Layout Direction Toggle */}
        <Box>
          <Box variant="awsui-key-label" fontSize="body-s" padding={{ bottom: "xxxs" }}>
            Layout
          </Box>
          <ToggleButton
            pressed={layoutDirection === "LR"}
            onChange={({ detail }) => handleLayoutToggle(detail)}
            iconName="view-horizontal"
            pressedIconName="view-vertical"
          >
            {layoutDirection === "LR" ? "Horizontal" : "Vertical"}
          </ToggleButton>
        </Box>

        {/* Zoom Controls */}
        <Box>
          <Box variant="awsui-key-label" fontSize="body-s" padding={{ bottom: "xxxs" }}>
            Zoom
          </Box>
          <ButtonGroup>
            <Button iconName="zoom-in" onClick={handleZoomIn} ariaLabel="Zoom in" />
            <Button iconName="zoom-out" onClick={handleZoomOut} ariaLabel="Zoom out" />
          </ButtonGroup>
        </Box>

        {/* Fit View Button */}
        <Box>
          <Button
            iconName="fit-to-width"
            onClick={handleFitView}
            ariaLabel="Fit view to screen"
            fullWidth
          >
            Fit View
          </Button>
        </Box>
      </SpaceBetween>
    </Box>
  );
};

AttackTreeControls.propTypes = {
  layoutDirection: PropTypes.oneOf(["TB", "LR"]).isRequired,
  onLayoutChange: PropTypes.func.isRequired,
};

export default AttackTreeControls;
