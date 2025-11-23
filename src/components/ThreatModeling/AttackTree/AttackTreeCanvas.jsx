import { useMemo } from "react";
import PropTypes from "prop-types";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";
import { nodeTypes } from "./nodes";

/**
 * AttackTreeCanvas Component
 *
 * Renders the React Flow visualization for the attack tree.
 * This component is a pure presentation component that accepts nodes, edges,
 * and event handlers as props and renders the React Flow canvas.
 *
 * @param {Object} props - Component props
 * @param {Array} props.nodes - Array of React Flow nodes
 * @param {Array} props.edges - Array of React Flow edges
 * @param {Function} props.onNodesChange - Handler for node changes (drag, select, etc.)
 * @param {Function} props.onEdgesChange - Handler for edge changes
 * @param {Function} props.onNodeClick - Handler for node click events
 * @param {Function} props.onConnect - Handler for creating new connections
 * @param {Function} props.isValidConnection - Validator for connection attempts
 * @param {Function} props.onEdgeDelete - Handler for edge deletion
 * @param {boolean} props.isReadOnly - Whether the tree is in read-only mode
 * @param {boolean} props.isDark - Whether dark theme is active (for Background styling)
 */
const AttackTreeCanvas = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  onConnect,
  isValidConnection,
  onEdgeDelete,
  isReadOnly = false,
  isDark = false,
}) => {
  // Memoize node types to prevent re-renders
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  // Enhance nodes with read-only flag, edge deletion handler, and z-index
  const enhancedNodes = useMemo(
    () =>
      nodes.map((node) => {
        // Check if node is unconnected (no incoming or outgoing edges)
        const hasConnection = edges.some(
          (edge) => edge.source === node.id || edge.target === node.id
        );

        // Unconnected nodes get higher z-index to appear on top when dragging
        const zIndex = hasConnection ? 1 : 1000;

        return {
          ...node,
          zIndex,
          data: {
            ...node.data,
            isReadOnly,
            edges,
            onEdgeDelete,
          },
        };
      }),
    [nodes, isReadOnly, edges, onEdgeDelete]
  );

  return (
    <ReactFlow
      nodes={enhancedNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      nodeTypes={memoizedNodeTypes}
      nodesDraggable={!isReadOnly}
      nodesConnectable={!isReadOnly}
      elementsSelectable={true}
      fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 1.5 }}
      defaultEdgeOptions={{
        type: "smoothstep",
        animated: true,
        markerEnd: undefined,
        style: {
          stroke: "#b1b1b7",
          strokeWidth: 2,
          strokeDasharray: "5, 5",
        },
      }}
      minZoom={0.5}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      elevateNodesOnSelect={false}
      selectNodesOnDrag={false}
      selectionOnDrag={false}
      connectionMode="loose"
    >
      <Background color={isDark ? "#555" : "#aaa"} gap={32} size={3} />
      <Controls showInteractive={false} position="top-left" style={{ display: "none" }} />
    </ReactFlow>
  );
};

AttackTreeCanvas.propTypes = {
  nodes: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
      position: PropTypes.shape({
        x: PropTypes.number.isRequired,
        y: PropTypes.number.isRequired,
      }).isRequired,
      data: PropTypes.object.isRequired,
    })
  ).isRequired,
  edges: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      source: PropTypes.string.isRequired,
      target: PropTypes.string.isRequired,
      type: PropTypes.string,
      style: PropTypes.object,
    })
  ).isRequired,
  onNodesChange: PropTypes.func.isRequired,
  onEdgesChange: PropTypes.func.isRequired,
  onNodeClick: PropTypes.func.isRequired,
  onConnect: PropTypes.func.isRequired,
  isValidConnection: PropTypes.func.isRequired,
  onEdgeDelete: PropTypes.func.isRequired,
  isReadOnly: PropTypes.bool,
  isDark: PropTypes.bool,
};

export default AttackTreeCanvas;
