import { useState, useCallback, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { useReactFlow, ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import "./AttackTree/AttackTreeViewer.css";
import DeleteConfirmationModal from "./AttackTree/DeleteConfirmationModal";
import NodeDeleteConfirmationModal from "./AttackTree/NodeDeleteConfirmationModal";
import EditorControls from "./AttackTree/EditorControls";
import GoalEditModal from "./AttackTree/GoalEditModal";
import GateEditModal from "./AttackTree/GateEditModal";
import LeafEditModal from "./AttackTree/LeafEditModal";
import AttackTreeCanvas from "./AttackTree/AttackTreeCanvas";
import AttackTreeAlerts from "./AttackTree/AttackTreeAlerts";
import AttackTreeOverlays from "./AttackTree/AttackTreeOverlays";
import { useTheme } from "../ThemeContext";
import { useHistoryManager } from "./hooks/useHistoryManager";
import { useAttackTreeLifecycle } from "./hooks/useAttackTreeLifecycle";
import { useAttackTreeOperations } from "./hooks/useAttackTreeOperations";
import { useAttackTreeFocus } from "./hooks/useAttackTreeFocus";
import { useAttackTreeLayout } from "./hooks/useAttackTreeLayout";
import { useAttackTreeSave } from "./hooks/useAttackTreeSave";

// Inner component that has access to React Flow instance
const AttackTreeFlow = ({
  threatModelId,
  threatName,
  threatDescription,
  isReadOnly = false,
  onAttackTreeCreated,
  onAttackTreeDeleted,
}) => {
  const reactFlowInstance = useReactFlow();
  const { isDark } = useTheme();

  // Editor state management
  const historyManager = useHistoryManager();

  // Connection error state (needed by operations hook)
  const [connectionError, setConnectionError] = useState(null);
  const connectionErrorTimeoutRef = useRef(null);
  const lastConnectionErrorRef = useRef(null);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [editModalType, setEditModalType] = useState(null); // 'goal', 'gate', or 'leaf'

  // Node delete modal state
  const [nodeDeleteModalVisible, setNodeDeleteModalVisible] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState(null);

  // Lifecycle hook - manages attack tree generation, loading, and polling
  const {
    attackTreeId,
    viewState,
    isGenerating,
    isSubmitting,
    handleGenerate,
    handleDelete,
    setShowDeleteModal,
  } = useAttackTreeLifecycle({
    threatModelId,
    threatName,
    threatDescription,
    onTreeLoaded: (layoutedNodes, layoutedEdges) => {
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setAllNodes(layoutedNodes);
      setAllEdges(layoutedEdges);
      resetLayoutFlags();
      historyManager.clear();
    },
    onTreeDeleted: () => {
      setNodes([]);
      setEdges([]);
      setAllNodes([]);
      setAllEdges([]);
      historyManager.clear();
      // Notify parent component that tree was deleted
      if (onAttackTreeDeleted) {
        onAttackTreeDeleted(threatName);
      }
    },
    onTreeCreated: () => {
      // Notify parent component that tree was created
      if (onAttackTreeCreated) {
        onAttackTreeCreated(threatName);
      }
    },
  });

  // Operations hook - manages node and edge CRUD operations
  const {
    nodes,
    edges,
    allNodes,
    allEdges,
    hasUnsavedChanges,
    setNodes,
    setEdges,
    setAllNodes,
    setAllEdges,
    setHasUnsavedChanges,
    onNodesChange,
    onEdgesChange,
    handleAddNode: handleAddNodeBase,
    handleEditNode: handleEditNodeBase,
    handleSaveNodeEdit,
    handleDeleteNode: handleDeleteNodeBase,
    handleConfirmDeleteNode: handleConfirmDeleteNodeBase,
    handleEdgeDelete,
    onConnect,
    isValidConnection,
    handleUndo,
    handleRedo,
  } = useAttackTreeOperations({
    historyManager,
    initialNodes: [],
    initialEdges: [],
    setConnectionError,
    setFocusedNodeId: (id) => setFocusedNodeId(id),
    focusedNodeId: null, // Will be set by focus hook
    connectionErrorTimeoutRef,
    lastConnectionErrorRef,
    reactFlowInstance,
  });

  // Focus hook - manages focus mode for viewing subgraphs
  const { focusedNodeId, setFocusedNodeId, onNodeClick } = useAttackTreeFocus({
    allNodes,
    allEdges,
    setNodes,
    setEdges,
    reactFlowInstance,
  });

  // Layout hook - manages automatic layout and fitView operations
  const { isManualNodeAddition, shouldFitViewOnLoad, resetLayoutFlags } = useAttackTreeLayout({
    nodes,
    edges,
    setNodes,
    setEdges,
    setAllNodes,
    setAllEdges,
    reactFlowInstance,
    focusedNodeId,
    viewState,
  });

  // Save hook - handles save operations and validation
  const { isSaving, saveError, saveSuccess, setSaveError, setSaveSuccess, handleSave } =
    useAttackTreeSave({
      attackTreeId,
      nodes,
      edges,
      setHasUnsavedChanges,
    });

  // Cleanup effect: Clear timeouts when component unmounts
  useEffect(() => {
    const timeoutRef = connectionErrorTimeoutRef;
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle edit node action - wrapper to show modal
  const handleEditNode = useCallback(
    (nodeId) => {
      const node = handleEditNodeBase(nodeId);
      if (!node) return;

      const modalType =
        node.type === "root-goal"
          ? "goal"
          : node.type === "and-gate" || node.type === "or-gate"
            ? "gate"
            : node.type === "leaf-attack"
              ? "leaf"
              : null;

      if (modalType) {
        setEditingNode(node);
        setEditModalType(modalType);
        setEditModalVisible(true);
      }
    },
    [handleEditNodeBase]
  );

  // Handle save from edit modal - wrapper to close modal
  const handleSaveNodeEditWrapper = useCallback(
    (nodeId, updatedData) => {
      handleSaveNodeEdit(nodeId, updatedData);
      setEditModalVisible(false);
      setEditingNode(null);
      setEditModalType(null);
    },
    [handleSaveNodeEdit]
  );

  // Handle cancel from edit modal
  const handleCancelNodeEdit = useCallback(() => {
    setEditModalVisible(false);
    setEditingNode(null);
    setEditModalType(null);
  }, []);

  // Handle delete node action - show confirmation modal
  const handleDeleteNode = useCallback(
    (nodeId) => {
      const node = handleDeleteNodeBase(nodeId);
      if (!node) return;
      setNodeToDelete(node);
      setNodeDeleteModalVisible(true);
    },
    [handleDeleteNodeBase]
  );

  // Confirm node deletion - wrapper to close modal
  const handleConfirmDeleteNode = useCallback(() => {
    if (!nodeToDelete) return;
    // Prevent fitView from triggering on node deletion
    shouldFitViewOnLoad.current = false;
    isManualNodeAddition.current = true;
    handleConfirmDeleteNodeBase(nodeToDelete.id);
    setNodeDeleteModalVisible(false);
    setNodeToDelete(null);
    // Reset flag after a delay
    setTimeout(() => {
      isManualNodeAddition.current = false;
    }, 1000);
  }, [nodeToDelete, handleConfirmDeleteNodeBase, shouldFitViewOnLoad, isManualNodeAddition]);

  // Cancel node deletion
  const handleCancelDeleteNode = useCallback(() => {
    setNodeDeleteModalVisible(false);
    setNodeToDelete(null);
  }, []);

  // Listen for custom events from node action buttons
  useEffect(() => {
    const handleNodeEdit = (e) => handleEditNode(e.detail.nodeId);
    const handleNodeDeleteEvent = (e) => handleDeleteNode(e.detail.nodeId);

    document.addEventListener("node-edit", handleNodeEdit);
    document.addEventListener("node-delete", handleNodeDeleteEvent);

    return () => {
      document.removeEventListener("node-edit", handleNodeEdit);
      document.removeEventListener("node-delete", handleNodeDeleteEvent);
    };
  }, [handleEditNode, handleDeleteNode]);

  // Handle adding a new node - wrapper to mark as manual addition
  const handleAddNode = useCallback(
    (nodeType, position) => {
      isManualNodeAddition.current = true;
      handleAddNodeBase(nodeType, position);
      setTimeout(() => {
        isManualNodeAddition.current = false;
      }, 1000);
    },
    [handleAddNodeBase, isManualNodeAddition]
  );

  return (
    <div style={{ width: "100%", height: "calc(100vh - 110px)", position: "relative" }}>
      <AttackTreeCanvas
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onEdgeDelete={handleEdgeDelete}
        isReadOnly={isReadOnly}
        isDark={isDark}
      />
      <AttackTreeAlerts
        connectionError={connectionError}
        saveError={saveError}
        saveSuccess={saveSuccess}
        onDismissConnectionError={() => setConnectionError(null)}
        onDismissSaveError={() => setSaveError(null)}
        onDismissSaveSuccess={() => setSaveSuccess(false)}
      />
      <AttackTreeOverlays
        viewState={viewState}
        onGenerate={handleGenerate}
        isSubmitting={isSubmitting}
        isGenerating={isGenerating}
        isReadOnly={isReadOnly}
      />
      {viewState.status === "loaded" && (
        <EditorControls
          onAddNode={handleAddNode}
          onSave={handleSave}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onDelete={() => setShowDeleteModal(true)}
          hasUnsavedChanges={hasUnsavedChanges}
          canUndo={historyManager.canUndo}
          canRedo={historyManager.canRedo}
          isSaving={isSaving}
          isReadOnly={isReadOnly}
          isFocusMode={!!focusedNodeId}
        />
      )}
      <DeleteConfirmationModal
        visible={viewState.showDeleteModal}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
        threatName={threatName}
      />
      <NodeDeleteConfirmationModal
        visible={nodeDeleteModalVisible}
        onConfirm={handleConfirmDeleteNode}
        onCancel={handleCancelDeleteNode}
        nodeData={nodeToDelete}
      />
      {editModalType === "goal" && (
        <GoalEditModal
          visible={editModalVisible}
          nodeData={editingNode}
          onSave={handleSaveNodeEditWrapper}
          onCancel={handleCancelNodeEdit}
        />
      )}
      {editModalType === "gate" && (
        <GateEditModal
          visible={editModalVisible}
          nodeData={editingNode}
          onSave={handleSaveNodeEditWrapper}
          onCancel={handleCancelNodeEdit}
        />
      )}
      {editModalType === "leaf" && (
        <LeafEditModal
          visible={editModalVisible}
          nodeData={editingNode}
          onSave={handleSaveNodeEditWrapper}
          onCancel={handleCancelNodeEdit}
        />
      )}
    </div>
  );
};

AttackTreeFlow.propTypes = {
  threatModelId: PropTypes.string.isRequired,
  threatName: PropTypes.string.isRequired,
  threatDescription: PropTypes.string.isRequired,
  attackTreeId: PropTypes.string,
  onClose: PropTypes.func,
  isReadOnly: PropTypes.bool,
  onAttackTreeCreated: PropTypes.func,
  onAttackTreeDeleted: PropTypes.func,
};

// AttackTreeViewer component - displays and manages attack tree visualization
const AttackTreeViewer = (props) => {
  return (
    <ReactFlowProvider>
      <AttackTreeFlow {...props} />
    </ReactFlowProvider>
  );
};

AttackTreeViewer.propTypes = {
  threatModelId: PropTypes.string.isRequired,
  threatName: PropTypes.string.isRequired,
  threatDescription: PropTypes.string.isRequired,
  attackTreeId: PropTypes.string,
  onClose: PropTypes.func,
  isReadOnly: PropTypes.bool,
  onAttackTreeCreated: PropTypes.func,
  onAttackTreeDeleted: PropTypes.func,
};

export default AttackTreeViewer;
