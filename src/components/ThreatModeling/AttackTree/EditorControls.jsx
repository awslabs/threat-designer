import { useState, useCallback, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import { useReactFlow } from "reactflow";
import AddNodeDropdown from "./AddNodeDropdown";
import "./AddNodeDropdown.css";
import "./EditorControls.css";

/**
 * EditorControls Component
 *
 * Provides the main editing interface with add, save, undo/redo, and delete buttons.
 * Handles node preview attached to cursor and click-to-place logic.
 */
const EditorControls = ({
  onAddNode,
  onSave,
  onUndo,
  onRedo,
  onDelete,
  hasUnsavedChanges,
  canUndo,
  canRedo,
  isSaving,
  isReadOnly,
  isFocusMode = false,
}) => {
  const reactFlowInstance = useReactFlow();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [nodePreview, setNodePreview] = useState(null);
  const reactFlowWrapperRef = useRef(null);

  // Get the React Flow wrapper element
  useEffect(() => {
    const wrapper = document.querySelector(".react-flow");
    if (wrapper) {
      reactFlowWrapperRef.current = wrapper;
    }
  }, []);

  // Handle node type selection from dropdown
  const handleSelectNodeType = useCallback((nodeType) => {
    setNodePreview({ type: nodeType });
    setIsDropdownOpen(false);
  }, []);

  // Handle mouse move to update preview position
  useEffect(() => {
    if (!nodePreview) return;

    const handleMouseMove = (event) => {
      setNodePreview((prev) => ({
        ...prev,
        position: { x: event.clientX, y: event.clientY },
      }));
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [nodePreview]);

  // Handle canvas click to place node
  useEffect(() => {
    if (!nodePreview || !reactFlowWrapperRef.current) return;

    const handleCanvasClick = (event) => {
      // Only handle clicks on the React Flow canvas
      if (!event.target.closest(".react-flow__pane")) {
        return;
      }

      // Get canvas coordinates from click event
      const reactFlowBounds = reactFlowWrapperRef.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      // Call the onAddNode callback with node type and position
      onAddNode(nodePreview.type, position);

      // Clear the preview
      setNodePreview(null);
    };

    // Handle escape key to cancel placement
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setNodePreview(null);
      }
    };

    document.addEventListener("click", handleCanvasClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("click", handleCanvasClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [nodePreview, reactFlowInstance, onAddNode]);

  // Toggle dropdown
  const handleToggleDropdown = useCallback(() => {
    setIsDropdownOpen((prev) => !prev);
  }, []);

  // Close dropdown
  const handleCloseDropdown = useCallback(() => {
    setIsDropdownOpen(false);
  }, []);

  // Get node preview label
  const getNodePreviewLabel = (nodeType) => {
    const labels = {
      "root-goal": "Goal",
      "and-gate": "AND",
      "or-gate": "OR",
      "leaf-attack": "Leaf",
    };
    return labels[nodeType] || "Node";
  };

  return (
    <>
      {/* Editor Controls - Vertical layout */}
      <div
        className="editor-controls-container"
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 10,
          pointerEvents: "auto",
        }}
      >
        {/* Add Node Button with Dropdown */}
        {!isReadOnly && (
          <div style={{ position: "relative" }}>
            <button
              className="custom-add-button"
              onClick={handleToggleDropdown}
              aria-label={isDropdownOpen ? "Close node type menu" : "Open node type menu"}
              aria-expanded={isDropdownOpen}
              disabled={isReadOnly}
            >
              <span className="custom-add-icon">{isDropdownOpen ? "−" : "+"}</span>
            </button>
            <AddNodeDropdown
              isOpen={isDropdownOpen}
              onClose={handleCloseDropdown}
              onSelectNodeType={handleSelectNodeType}
            />
          </div>
        )}

        {/* Save Button */}
        {!isReadOnly && (
          <Button
            iconName="upload"
            variant="icon"
            onClick={onSave}
            loading={isSaving}
            disabled={!hasUnsavedChanges || isSaving || isFocusMode}
            ariaLabel={
              isFocusMode
                ? "Exit focus mode to save"
                : isSaving
                  ? "Saving attack tree..."
                  : hasUnsavedChanges
                    ? "Save unsaved changes"
                    : "No changes to save"
            }
          />
        )}

        {/* Undo Button */}
        {!isReadOnly && (
          <Button
            iconName="undo"
            variant="icon"
            onClick={onUndo}
            disabled={!canUndo}
            ariaLabel={canUndo ? "Undo last change" : "No changes to undo"}
          />
        )}

        {/* Redo Button */}
        {!isReadOnly && (
          <Button
            iconName="redo"
            variant="icon"
            onClick={onRedo}
            disabled={!canRedo}
            ariaLabel={canRedo ? "Redo last undone change" : "No changes to redo"}
          />
        )}

        {/* Zoom Controls*/}
        <Button
          iconName="zoom-in"
          variant="icon"
          onClick={() => reactFlowInstance.zoomIn()}
          ariaLabel="Zoom in"
        />
        <Button
          iconName="zoom-out"
          variant="icon"
          onClick={() => reactFlowInstance.zoomOut()}
          ariaLabel="Zoom out"
        />
        <Button
          iconName="full-screen"
          variant="icon"
          onClick={() => reactFlowInstance.fitView({ padding: 0.2, duration: 400 })}
          ariaLabel="Fit view to screen"
        />

        {/* Delete Tree Button */}
        {!isReadOnly && (
          <Button
            iconName="remove"
            variant="icon"
            onClick={onDelete}
            ariaLabel="Delete attack tree"
          />
        )}
      </div>

      {/* Node Preview Cursor */}
      {nodePreview && nodePreview.position && (
        <div
          className="node-preview-cursor active"
          style={{
            left: nodePreview.position.x,
            top: nodePreview.position.y,
          }}
        >
          <Box
            padding="xs"
            backgroundColor="background-container-content"
            borderRadius="default"
            fontSize="body-s"
            textAlign="center"
            style={{
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
              minWidth: "60px",
              border: "2px dashed #0972d3",
            }}
          >
            {getNodePreviewLabel(nodePreview.type)}
          </Box>
        </div>
      )}
    </>
  );
};

EditorControls.propTypes = {
  onAddNode: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onUndo: PropTypes.func.isRequired,
  onRedo: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  hasUnsavedChanges: PropTypes.bool.isRequired,
  canUndo: PropTypes.bool.isRequired,
  canRedo: PropTypes.bool.isRequired,
  isSaving: PropTypes.bool.isRequired,
  isReadOnly: PropTypes.bool.isRequired,
  isFocusMode: PropTypes.bool,
};

export default EditorControls;
