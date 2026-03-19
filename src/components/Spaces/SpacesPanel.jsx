import { useState, useEffect } from "react";
import "./SpacesPanel.css";
import { useNavigate, useLocation } from "react-router-dom";
import { Folder } from "lucide-react";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { listSpaces, createSpace } from "../../services/Spaces/spacesService";

export function SpacesPanel() {
  const navigate = useNavigate();
  const location = useLocation();

  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const activeSpaceId = location.pathname.startsWith("/spaces/")
    ? location.pathname.split("/spaces/")[1]
    : null;

  useEffect(() => {
    load();
  }, [location.pathname === "/spaces"]);

  async function load() {
    setLoading(true);
    try {
      const data = await listSpaces();
      setSpaces(data ?? []);
    } catch {
      setSpaces([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const space = await createSpace(newName.trim(), newDesc.trim());
      setSpaces((prev) => [...prev, space]);
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      navigate(`/spaces/${space.space_id}`);
    } catch {
      // noop
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="spaces-panel">
        <div className="spaces-panel-header">
          <span className="spaces-panel-title">
            <Folder size={14} />
            Spaces
          </span>
          <Button
            variant="icon"
            iconName="add-plus"
            ariaLabel="New space"
            onClick={() => setCreateOpen(true)}
          />
        </div>

        <div className="spaces-panel-list">
          {loading ? (
            <div className="spaces-panel-loading">
              <Spinner size="normal" />
            </div>
          ) : spaces.length === 0 ? (
            <div className="spaces-panel-empty">
              <span>No spaces yet</span>
            </div>
          ) : (
            <>
              {spaces.map((space) => (
                <button
                  key={space.space_id}
                  className={`spaces-panel-item ${activeSpaceId === space.space_id ? "active" : ""}`}
                  onClick={() => navigate(`/spaces/${space.space_id}`)}
                  title={space.name}
                >
                  <Folder size={14} className="spaces-panel-item-icon" />
                  <span className="spaces-panel-item-name">{space.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <Modal
        visible={createOpen}
        onDismiss={() => setCreateOpen(false)}
        header="Create space"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} loading={creating}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Name" constraintText="Required">
            <Input
              value={newName}
              onChange={({ detail }) => setNewName(detail.value)}
              placeholder="My project space"
            />
          </FormField>
          <FormField label="Description" constraintText="Optional">
            <Textarea
              value={newDesc}
              onChange={({ detail }) => setNewDesc(detail.value)}
              placeholder="Describe this space..."
              rows={3}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
    </>
  );
}
