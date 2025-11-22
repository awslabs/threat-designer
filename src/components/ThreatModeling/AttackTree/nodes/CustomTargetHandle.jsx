import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Handle, Position } from "reactflow";
import "./CustomHandles.css";

/**
 * CustomTargetHandle - Enhanced target handle with proximity-based zoom and delete functionality
 *
 * This component provides visual feedback based on mouse proximity to the handle.
 * As the mouse gets closer, the handle grows larger. If connected, it also turns red
 * to indicate it can be clicked to delete the edge.
 *
 * @param {string} nodeId - The ID of the node this handle belongs to
 * @param {Position} position - The position of the handle (typically Position.Left)
 * @param {object} style - Additional inline styles for the handle
 * @param {boolean} isReadOnly - Whether the tree is in read-only mode
 * @param {Array} edges - Array of all edges in the graph
 * @param {Function} onEdgeDelete - Callback function to delete an edge
 */
const CustomTargetHandle = ({ nodeId, position, style, isReadOnly, edges, onEdgeDelete }) => {
  const handleRef = React.useRef(null);
  const [scale, setScale] = useState(1);
  const [isNear, setIsNear] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedEdgeId, setConnectedEdgeId] = useState(null);

  // Listen for handle reset events (triggered on node click or fitView)
  React.useEffect(() => {
    const handleReset = () => {
      setScale(1);
      setIsNear(false);
    };

    window.addEventListener("resetHandleScales", handleReset);
    return () => window.removeEventListener("resetHandleScales", handleReset);
  }, []);

  // Check if this handle has an incoming edge
  useEffect(() => {
    if (edges && edges.length > 0) {
      const incomingEdge = edges.find((edge) => edge.target === nodeId);
      if (incomingEdge) {
        setIsConnected(true);
        setConnectedEdgeId(incomingEdge.id);
      } else {
        setIsConnected(false);
        setConnectedEdgeId(null);
      }
    } else {
      setIsConnected(false);
      setConnectedEdgeId(null);
    }
  }, [edges, nodeId]);

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
        setIsNear(true);
      } else {
        setScale(1);
        setIsNear(false);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [isReadOnly]);

  const handleClick = (e) => {
    e.stopPropagation();

    // Only allow deletion if connected, mouse is near, not read-only, and callback exists
    if (isConnected && isNear && !isReadOnly && connectedEdgeId && onEdgeDelete) {
      onEdgeDelete(connectedEdgeId);
    }
  };

  return (
    <Handle
      ref={handleRef}
      type="target"
      position={position}
      id={`target-${nodeId}`}
      isConnectable={!isReadOnly}
      className={`custom-target-handle ${scale > 1 ? "scaling" : ""} ${isConnected ? "connected" : ""} ${isNear && !isReadOnly ? "hovered" : ""} ${isReadOnly ? "read-only" : ""}`}
      style={{
        ...style,
        transform: `scale(${scale})`,
        transition: "transform 0.15s ease-out",
      }}
      onClick={handleClick}
    />
  );
};

CustomTargetHandle.propTypes = {
  nodeId: PropTypes.string.isRequired,
  position: PropTypes.oneOf([Position.Top, Position.Right, Position.Bottom, Position.Left])
    .isRequired,
  style: PropTypes.object,
  isReadOnly: PropTypes.bool,
  edges: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      source: PropTypes.string.isRequired,
      target: PropTypes.string.isRequired,
    })
  ),
  onEdgeDelete: PropTypes.func,
};

CustomTargetHandle.defaultProps = {
  style: {},
  isReadOnly: false,
  edges: [],
  onEdgeDelete: null,
};

export default CustomTargetHandle;
