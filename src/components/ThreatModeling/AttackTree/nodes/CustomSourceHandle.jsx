import React, { useState } from "react";
import PropTypes from "prop-types";
import { Handle, Position } from "reactflow";
import "./CustomHandles.css";

/**
 * CustomSourceHandle - Enhanced source handle with proximity-based zoom
 *
 * This component provides visual feedback based on mouse proximity to the handle.
 * As the mouse gets closer, the handle grows larger, making it easier to target.
 *
 * @param {string} nodeId - The ID of the node this handle belongs to
 * @param {Position} position - The position of the handle (typically Position.Right)
 * @param {object} style - Additional inline styles for the handle
 * @param {boolean} isReadOnly - Whether the tree is in read-only mode
 */
const CustomSourceHandle = ({ nodeId, position, style, isReadOnly }) => {
  const handleRef = React.useRef(null);
  const [scale, setScale] = useState(1);

  // Listen for handle reset events (triggered on node click or fitView)
  React.useEffect(() => {
    const handleReset = () => {
      setScale(1);
    };

    window.addEventListener("resetHandleScales", handleReset);
    return () => window.removeEventListener("resetHandleScales", handleReset);
  }, []);

  React.useEffect(() => {
    if (isReadOnly) return;

    const handleMouseMove = (e) => {
      if (!handleRef.current) return;

      const rect = handleRef.current.getBoundingClientRect();
      const handleCenterX = rect.left + rect.width / 2;
      const handleCenterY = rect.top + rect.height / 2;

      const distance = Math.sqrt(
        Math.pow(e.clientX - handleCenterX, 2) + Math.pow(e.clientY - handleCenterY, 2)
      );

      // Proximity threshold: 100px = no zoom, 0px = max zoom (2x)
      const maxDistance = 100;
      const maxScale = 2;

      if (distance < maxDistance) {
        const proximityFactor = 1 - distance / maxDistance;
        const newScale = 1 + proximityFactor * (maxScale - 1);
        setScale(newScale);
      } else {
        setScale(1);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [isReadOnly]);

  return (
    <Handle
      ref={handleRef}
      type="source"
      position={position}
      id={`source-${nodeId}`}
      className={`custom-source-handle ${scale > 1 ? "scaling" : ""} ${isReadOnly ? "read-only" : ""}`}
      style={{
        ...style,
        transform: `scale(${scale})`,
        transition: "transform 0.15s ease-out",
      }}
    />
  );
};

CustomSourceHandle.propTypes = {
  nodeId: PropTypes.string.isRequired,
  position: PropTypes.oneOf([Position.Top, Position.Right, Position.Bottom, Position.Left])
    .isRequired,
  style: PropTypes.object,
  isReadOnly: PropTypes.bool,
};

CustomSourceHandle.defaultProps = {
  style: {},
  isReadOnly: false,
};

export default CustomSourceHandle;
