import { useState, useCallback } from "react";
import { useNodesState, useEdgesState } from "reactflow";

/**
 * Custom hook for managing attack tree node and edge CRUD operations
 *
 * Handles all node and edge operations including:
 * - Add, edit, delete nodes
 * - Add, delete edges
 * - Connection validation
 * - History tracking for undo/redo
 * - Dual state management (display state and stored state for focus mode)
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.historyManager - History manager instance for undo/redo
 * @param {Array} params.initialNodes - Initial nodes array
 * @param {Array} params.initialEdges - Initial edges array
 * @param {Function} params.setConnectionError - Function to set connection error message
 * @param {Function} params.setFocusedNodeId - Function to set focused node ID
 * @param {string|null} params.focusedNodeId - Currently focused node ID
 * @param {Object} params.connectionErrorTimeoutRef - Ref for connection error timeout
 * @param {Object} params.lastConnectionErrorRef - Ref for last connection error message
 *
 * @returns {Object} Operations interface
 */
export const useAttackTreeOperations = ({
  historyManager,
  initialNodes = [],
  initialEdges = [],
  setConnectionError,
  setFocusedNodeId,
  focusedNodeId,
  connectionErrorTimeoutRef,
  lastConnectionErrorRef,
  reactFlowInstance,
}) => {
  // Display state - what's currently shown in React Flow
  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Stored state - complete graph for focus mode
  const [allNodes, setAllNodes] = useState(initialNodes);
  const [allEdges, setAllEdges] = useState(initialEdges);

  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Wrap onNodesChange to sync position changes to allNodes
  const onNodesChange = useCallback(
    (changes) => {
      onNodesChangeBase(changes);

      // Sync position changes to allNodes
      changes.forEach((change) => {
        if (change.type === "position" && change.dragging === false && change.position) {
          // Node drag ended, update allNodes with new position
          setAllNodes((prevAllNodes) =>
            prevAllNodes.map((node) =>
              node.id === change.id ? { ...node, position: change.position } : node
            )
          );
          setHasUnsavedChanges(true);
        }
      });
    },
    [onNodesChangeBase]
  );

  /**
   * Get default data for a new node based on type
   *
   * @param {string} nodeType - Type of node to create
   * @returns {Object} Default node data
   */
  const getDefaultNodeData = useCallback((nodeType) => {
    switch (nodeType) {
      case "root-goal":
        return { label: "New Goal" };
      case "and-gate":
        return { label: "AND Gate", gateType: "AND" };
      case "or-gate":
        return { label: "OR Gate", gateType: "OR" };
      case "leaf-attack":
        return {
          label: "New Attack",
          description: "",
          attackChainPhase: "",
          impactSeverity: "medium",
          likelihood: "medium",
          skillLevel: "intermediate",
          prerequisites: [],
          techniques: [],
          tools: [],
          timeRequired: "",
          cost: "",
          detectionProbability: 0,
          cvssScore: 0,
        };
      default:
        return { label: "New Node" };
    }
  }, []);

  /**
   * Add a new node to the attack tree
   *
   * @param {string} nodeType - Type of node to add
   * @param {Object} position - Position {x, y} for the new node
   * @returns {Object} The newly created node
   */
  const handleAddNode = useCallback(
    (nodeType, position) => {
      // Create new node with unique ID
      const newNode = {
        id: `node-${Date.now()}`,
        type: nodeType,
        position,
        data: getDefaultNodeData(nodeType),
      };

      // Add to display state
      setNodes((nds) => [...nds, newNode]);

      // Add to stored state
      setAllNodes((nds) => [...nds, newNode]);

      // Mark as having unsaved changes
      setHasUnsavedChanges(true);

      // Track change in history
      historyManager.pushChange({
        type: "add-node",
        timestamp: Date.now(),
        before: null,
        after: newNode,
      });

      return newNode;
    },
    [getDefaultNodeData, setNodes, historyManager, reactFlowInstance]
  );

  /**
   * Prepare a node for editing
   *
   * @param {string} nodeId - ID of node to edit
   * @returns {Object|null} The node to edit, or null if not found
   */
  const handleEditNode = useCallback(
    (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      return node || null;
    },
    [nodes]
  );

  /**
   * Save node edit changes
   *
   * @param {string} nodeId - ID of node to update
   * @param {Object} updatedData - Updated node data
   */
  const handleSaveNodeEdit = useCallback(
    (nodeId, updatedData) => {
      const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex === -1) return;

      const oldNode = nodes[nodeIndex];

      // For gate nodes, if gateType changes, update the node type as well
      let newNodeType = oldNode.type;
      if (updatedData.gateType) {
        if (updatedData.gateType === "AND") {
          newNodeType = "and-gate";
        } else if (updatedData.gateType === "OR") {
          newNodeType = "or-gate";
        }
      }

      const newNode = {
        ...oldNode,
        type: newNodeType,
        data: {
          ...oldNode.data,
          ...updatedData,
        },
      };

      // Update display state
      const newNodes = [...nodes];
      newNodes[nodeIndex] = newNode;
      setNodes(newNodes);

      // Update stored state, preserving original position
      const allNodeIndex = allNodes.findIndex((n) => n.id === nodeId);
      if (allNodeIndex !== -1) {
        const newAllNodes = [...allNodes];
        const originalNode = allNodes[allNodeIndex];
        newAllNodes[allNodeIndex] = {
          ...newNode,
          position: originalNode.position,
          width: originalNode.width,
          height: originalNode.height,
        };
        setAllNodes(newAllNodes);
      }

      // If gate type changed, update edge colors for all edges from this node
      if (updatedData.gateType && updatedData.gateType !== oldNode.data.gateType) {
        const edgeColor = updatedData.gateType === "AND" ? "#7eb3d5" : "#c97a9e";

        // Update display edges
        const updatedEdges = edges.map((edge) => {
          if (edge.source === nodeId) {
            return {
              ...edge,
              style: {
                ...edge.style,
                stroke: edgeColor,
              },
              markerEnd: edge.markerEnd
                ? {
                    ...edge.markerEnd,
                    color: edgeColor,
                  }
                : undefined,
            };
          }
          return edge;
        });

        setEdges(updatedEdges);

        // Update stored edges
        const updatedAllEdges = allEdges.map((edge) => {
          if (edge.source === nodeId) {
            return {
              ...edge,
              style: {
                ...edge.style,
                stroke: edgeColor,
              },
              markerEnd: edge.markerEnd
                ? {
                    ...edge.markerEnd,
                    color: edgeColor,
                  }
                : undefined,
            };
          }
          return edge;
        });

        setAllEdges(updatedAllEdges);
      }

      // Mark as having unsaved changes
      setHasUnsavedChanges(true);

      // Track change in history
      historyManager.pushChange({
        type: "edit-node",
        timestamp: Date.now(),
        before: oldNode,
        after: newNode,
      });
    },
    [nodes, allNodes, edges, allEdges, setNodes, setEdges, historyManager]
  );

  /**
   * Prepare a node for deletion
   *
   * @param {string} nodeId - ID of node to delete
   * @returns {Object|null} The node to delete, or null if not found
   */
  const handleDeleteNode = useCallback(
    (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      return node || null;
    },
    [nodes]
  );

  /**
   * Confirm and execute node deletion
   *
   * @param {string} nodeId - ID of node to delete
   */
  const handleConfirmDeleteNode = useCallback(
    (nodeId) => {
      if (!nodeId) return;

      const nodeToDelete = nodes.find((n) => n.id === nodeId);
      if (!nodeToDelete) return;

      // Find all edges connected to this node
      const connectedEdges = edges.filter(
        (edge) => edge.source === nodeId || edge.target === nodeId
      );

      // Store the old state for history
      const oldNode = nodeToDelete;
      const oldEdges = connectedEdges;

      // Remove the node from display state
      const newNodes = nodes.filter((n) => n.id !== nodeId);
      setNodes(newNodes);

      // Remove the node from stored state
      const newAllNodes = allNodes.filter((n) => n.id !== nodeId);
      setAllNodes(newAllNodes);

      // Remove all connected edges from display state
      const newEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
      setEdges(newEdges);

      // Remove from stored edges
      const newAllEdges = allEdges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      );
      setAllEdges(newAllEdges);

      // If the deleted node is the currently focused node, exit focus mode
      if (focusedNodeId === nodeId) {
        setFocusedNodeId(null);
      }

      // Mark as having unsaved changes
      setHasUnsavedChanges(true);

      // Track deletion in history
      historyManager.pushChange({
        type: "delete-node",
        timestamp: Date.now(),
        before: {
          node: oldNode,
          edges: oldEdges,
        },
        after: null,
      });
    },
    [
      nodes,
      edges,
      allNodes,
      allEdges,
      focusedNodeId,
      setNodes,
      setEdges,
      setFocusedNodeId,
      historyManager,
    ]
  );

  /**
   * Delete an edge
   *
   * @param {string} edgeId - ID of edge to delete
   */
  const handleEdgeDelete = useCallback(
    (edgeId) => {
      // Find the edge to delete
      const edgeToDelete = edges.find((e) => e.id === edgeId);
      if (!edgeToDelete) {
        console.warn("Edge not found:", edgeId);
        return;
      }

      // Remove the edge from display state
      const newEdges = edges.filter((e) => e.id !== edgeId);
      setEdges(newEdges);

      // Remove from stored state
      const newAllEdges = allEdges.filter((e) => e.id !== edgeId);
      setAllEdges(newAllEdges);

      // Mark as having unsaved changes
      setHasUnsavedChanges(true);

      // Track deletion in history
      historyManager.pushChange({
        type: "delete-edge",
        timestamp: Date.now(),
        before: edgeToDelete,
        after: null,
      });
    },
    [edges, allEdges, setEdges, historyManager]
  );

  /**
   * Validate connection between nodes
   *
   * Rules:
   * 1. Target nodes can only have one incoming connection
   * 2. Goal nodes cannot connect directly to leaf nodes
   * 3. Leaf nodes can only receive connections, not create them
   *
   * @param {Object} connection - Connection to validate
   * @param {string} connection.source - Source node ID
   * @param {string} connection.target - Target node ID
   * @returns {boolean} True if connection is valid
   */
  const isValidConnection = useCallback(
    (connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) {
        return false;
      }

      // Rule 1: Target nodes can only have one incoming connection
      const existingConnection = edges.find((e) => e.target === connection.target);
      if (existingConnection) {
        const errorMsg = "Target already has a connection. Remove the existing connection first.";

        // Only set error if it's different from the last one (prevents duplicates)
        if (lastConnectionErrorRef.current !== errorMsg) {
          // Clear any existing timeout to prevent multiple notifications
          if (connectionErrorTimeoutRef.current) {
            clearTimeout(connectionErrorTimeoutRef.current);
            connectionErrorTimeoutRef.current = null;
          }

          // Set the error
          setConnectionError(errorMsg);
          lastConnectionErrorRef.current = errorMsg;

          // Clear error after 1.5 seconds
          connectionErrorTimeoutRef.current = setTimeout(() => {
            setConnectionError(null);
            lastConnectionErrorRef.current = null;
            connectionErrorTimeoutRef.current = null;
          }, 1500);
        }

        return false;
      }

      // Rule 2: Goal nodes (root) cannot connect directly to Leaf nodes
      if (sourceNode.type === "root-goal" && targetNode.type === "leaf-attack") {
        const errorMsg = "Goal nodes cannot connect directly to leaf nodes. Use a gate node.";

        // Only set error if it's different from the last one
        if (lastConnectionErrorRef.current !== errorMsg) {
          // Clear any existing timeout
          if (connectionErrorTimeoutRef.current) {
            clearTimeout(connectionErrorTimeoutRef.current);
            connectionErrorTimeoutRef.current = null;
          }

          // Set the error
          setConnectionError(errorMsg);
          lastConnectionErrorRef.current = errorMsg;

          // Clear error after 1.5 seconds
          connectionErrorTimeoutRef.current = setTimeout(() => {
            setConnectionError(null);
            lastConnectionErrorRef.current = null;
            connectionErrorTimeoutRef.current = null;
          }, 1500);
        }

        return false;
      }

      // Rule 3: Leaf nodes can only receive connections, not create them
      if (sourceNode.type === "leaf-attack") {
        const errorMsg = "Leaf nodes can only receive connections, not create them.";

        // Only set error if it's different from the last one
        if (lastConnectionErrorRef.current !== errorMsg) {
          // Clear any existing timeout
          if (connectionErrorTimeoutRef.current) {
            clearTimeout(connectionErrorTimeoutRef.current);
            connectionErrorTimeoutRef.current = null;
          }

          // Set the error
          setConnectionError(errorMsg);
          lastConnectionErrorRef.current = errorMsg;

          // Clear error after 1.5 seconds
          connectionErrorTimeoutRef.current = setTimeout(() => {
            setConnectionError(null);
            lastConnectionErrorRef.current = null;
            connectionErrorTimeoutRef.current = null;
          }, 1500);
        }

        return false;
      }

      // All other connections are valid
      return true;
    },
    [nodes, edges, setConnectionError, connectionErrorTimeoutRef, lastConnectionErrorRef]
  );

  /**
   * Handle connection creation
   *
   * @param {Object} connection - Connection to create
   * @param {string} connection.source - Source node ID
   * @param {string} connection.target - Target node ID
   */
  const onConnect = useCallback(
    (connection) => {
      // Determine edge color based on source node type
      const sourceNode = nodes.find((n) => n.id === connection.source);
      let edgeColor = "#b1b1b7"; // Default gray

      if (sourceNode) {
        // Goal nodes use gray (default)
        if (sourceNode.type === "and-gate") {
          edgeColor = "#7eb3d5"; // Blue for AND gates
        } else if (sourceNode.type === "or-gate") {
          edgeColor = "#c97a9e"; // Pink for OR gates
        }
      }

      // Create new edge (no arrow markers)
      const newEdge = {
        id: `edge-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: edgeColor,
          strokeWidth: 2,
          strokeDasharray: "5, 5",
        },
      };

      // Add to display state
      setEdges((eds) => [...eds, newEdge]);

      // Add to stored state
      setAllEdges((eds) => [...eds, newEdge]);

      // Mark as having unsaved changes
      setHasUnsavedChanges(true);

      // Track change in history
      historyManager.pushChange({
        type: "add-edge",
        timestamp: Date.now(),
        before: null,
        after: newEdge,
      });
    },
    [nodes, setEdges, historyManager]
  );

  /**
   * Handle undo operation
   *
   * Reverts the most recent change
   */
  const handleUndo = useCallback(() => {
    const change = historyManager.undo();
    if (!change) return;

    // Apply the undo change to restore previous state
    switch (change.type) {
      case "add-node":
        // Remove the added node
        setNodes((nds) => nds.filter((n) => n.id !== change.after.id));
        setAllNodes((nds) => nds.filter((n) => n.id !== change.after.id));
        break;

      case "edit-node":
        // Restore the old node data
        setNodes((nds) => nds.map((n) => (n.id === change.before.id ? change.before : n)));
        setAllNodes((nds) => nds.map((n) => (n.id === change.before.id ? change.before : n)));
        break;

      case "delete-node":
        // Restore the deleted node and its edges
        setNodes((nds) => [...nds, change.before.node]);
        setAllNodes((nds) => [...nds, change.before.node]);
        setEdges((eds) => [...eds, ...change.before.edges]);
        setAllEdges((eds) => [...eds, ...change.before.edges]);
        break;

      case "add-edge":
        // Remove the added edge
        setEdges((eds) => eds.filter((e) => e.id !== change.after.id));
        setAllEdges((eds) => eds.filter((e) => e.id !== change.after.id));
        break;

      case "delete-edge":
        // Restore the deleted edge
        setEdges((eds) => [...eds, change.before]);
        setAllEdges((eds) => [...eds, change.before]);
        break;

      default:
        console.warn("Unknown change type:", change.type);
    }

    // Mark as having unsaved changes after undo
    setHasUnsavedChanges(true);
  }, [historyManager, setNodes, setEdges]);

  /**
   * Handle redo operation
   *
   * Reapplies the most recently undone change
   */
  const handleRedo = useCallback(() => {
    const change = historyManager.redo();
    if (!change) return;

    // Apply the redo change to restore next state
    switch (change.type) {
      case "add-node":
        // Re-add the node
        setNodes((nds) => [...nds, change.after]);
        setAllNodes((nds) => [...nds, change.after]);
        break;

      case "edit-node":
        // Re-apply the edit
        setNodes((nds) => nds.map((n) => (n.id === change.after.id ? change.after : n)));
        setAllNodes((nds) => nds.map((n) => (n.id === change.after.id ? change.after : n)));
        break;

      case "delete-node":
        // Re-delete the node and its edges
        setNodes((nds) => nds.filter((n) => n.id !== change.before.node.id));
        setAllNodes((nds) => nds.filter((n) => n.id !== change.before.node.id));
        setEdges((eds) =>
          eds.filter(
            (e) => e.source !== change.before.node.id && e.target !== change.before.node.id
          )
        );
        setAllEdges((eds) =>
          eds.filter(
            (e) => e.source !== change.before.node.id && e.target !== change.before.node.id
          )
        );
        break;

      case "add-edge":
        // Re-add the edge
        setEdges((eds) => [...eds, change.after]);
        setAllEdges((eds) => [...eds, change.after]);
        break;

      case "delete-edge":
        // Re-delete the edge
        setEdges((eds) => eds.filter((e) => e.id !== change.before.id));
        setAllEdges((eds) => eds.filter((e) => e.id !== change.before.id));
        break;

      default:
        console.warn("Unknown change type:", change.type);
    }

    // Mark as having unsaved changes after redo
    setHasUnsavedChanges(true);
  }, [historyManager, setNodes, setEdges]);

  return {
    // State
    nodes,
    edges,
    allNodes,
    allEdges,
    hasUnsavedChanges,

    // State setters
    setNodes,
    setEdges,
    setAllNodes,
    setAllEdges,
    setHasUnsavedChanges,

    // React Flow handlers
    onNodesChange,
    onEdgesChange,

    // Node operations
    handleAddNode,
    handleEditNode,
    handleSaveNodeEdit,
    handleDeleteNode,
    handleConfirmDeleteNode,

    // Edge operations
    handleEdgeDelete,
    onConnect,
    isValidConnection,

    // History operations
    handleUndo,
    handleRedo,
  };
};
