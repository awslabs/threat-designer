import { useState, memo, useEffect } from "react";
import Textarea from "@cloudscape-design/components/textarea";
import ButtonGroup from "@cloudscape-design/components/button-group";
import { colorTextEmpty } from "@cloudscape-design/design-tokens";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { CodeRenderer, CustomTable } from "../Agent/MarkDownRenderers";

/**
 * NotesSection component for displaying and editing user notes on threats.
 * Follows the DescriptionSection pattern with inline editing support.
 *
 * @param {Object} props
 * @param {string} props.notes - The current notes content
 * @param {Function} props.onSave - Callback when notes are saved
 * @param {boolean} props.isReadOnly - Whether to hide edit controls
 */
const MAX_WORDS = 2000;

const NotesSection = memo(({ notes, onSave, isReadOnly }) => {
  const [value, setValue] = useState(notes || "");
  const [editMode, setEditMode] = useState(false);

  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const isOverLimit = wordCount > MAX_WORDS;

  // Sync local state when notes prop changes
  useEffect(() => {
    setValue(notes || "");
  }, [notes]);

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleConfirm = () => {
    if (isOverLimit) return;
    setEditMode(false);
    onSave(value);
  };

  const handleCancel = () => {
    setEditMode(false);
    setValue(notes || "");
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "16px", fontWeight: 600 }}>Notes</span>
        {!isReadOnly && (
          <ButtonGroup
            onItemClick={({ detail }) => {
              if (detail.id === "edit") {
                handleEdit();
              }
              if (detail.id === "confirm") {
                handleConfirm();
              }
              if (detail.id === "cancel") {
                handleCancel();
              }
            }}
            ariaLabel="notes actions"
            items={
              editMode
                ? [
                    {
                      type: "icon-button",
                      id: "confirm",
                      iconName: "check",
                      text: "Confirm",
                      disabled: isOverLimit,
                    },
                    {
                      type: "icon-button",
                      id: "cancel",
                      iconName: "close",
                      text: "Cancel",
                    },
                  ]
                : [
                    {
                      type: "icon-button",
                      id: "edit",
                      iconName: "edit",
                      text: "Edit",
                    },
                  ]
            }
            variant="icon"
          />
        )}
      </div>
      {editMode ? (
        <div>
          <Textarea
            placeholder="Add your notes here... (supports Markdown)"
            rows={3}
            value={value}
            onChange={({ detail }) => setValue(detail.value)}
            invalid={isOverLimit}
          />
          <div
            style={{
              fontSize: "12px",
              marginTop: "4px",
              color: isOverLimit ? "#d91515" : "#5f6b7a",
            }}
          >
            {wordCount} / {MAX_WORDS} words
          </div>
        </div>
      ) : (
        <div style={{ color: notes ? "inherit" : colorTextEmpty, marginTop: "4px" }}>
          {notes ? (
            <div className="markdown-content" style={{ lineHeight: 1.5 }}>
              <Markdown
                children={notes}
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  code: CodeRenderer,
                  table: CustomTable,
                }}
              />
            </div>
          ) : (
            "No notes"
          )}
        </div>
      )}
    </div>
  );
});

export default NotesSection;
