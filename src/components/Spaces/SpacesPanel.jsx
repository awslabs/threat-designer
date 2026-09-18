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
import { spacesService } from "../../services/Spaces/spacesService";

const DEFAULT_PANEL = {
  icon: Folder,
  title: "Spaces",
  basePath: "/spaces",
  newAriaLabel: "New space",
  emptyText: "No spaces yet",
  createTitle: "Create space",
  createNamePlaceholder: "My project space",
  createNameDescription: undefined,
};

/**
 * Side panel listing spaces, parametrized so user Spaces and governance System
 * Spaces share one implementation. `variant` supplies the service, base route,
 * icon, and copy; defaults are the user-space behavior.
 */
export function SpacesPanel({ service = spacesService, variant } = {}) {
  const cfg = { ...DEFAULT_PANEL, ...variant };
  const Icon = cfg.icon;
  const { listSpaces, createSpace } = service;
  const navigate = useNavigate();
  const location = useLocation();

  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const activeSpaceId = location.pathname.startsWith(`${cfg.basePath}/`)
    ? location.pathname.split(`${cfg.basePath}/`)[1]
    : null;

  useEffect(() => {
    load();
  }, [location.pathname]);

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
      navigate(`${cfg.basePath}/${space.space_id}`);
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
            <Icon size={14} />
            {cfg.title}
          </span>
          <Button
            variant="icon"
            iconName="add-plus"
            ariaLabel={cfg.newAriaLabel}
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
              <span>{cfg.emptyText}</span>
            </div>
          ) : (
            <>
              {spaces.map((space) => (
                <button
                  key={space.space_id}
                  className={`spaces-panel-item ${activeSpaceId === space.space_id ? "active" : ""}`}
                  onClick={() => navigate(`${cfg.basePath}/${space.space_id}`)}
                  title={space.name}
                >
                  <Icon size={14} className="spaces-panel-item-icon" />
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
        header={cfg.createTitle}
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
          <FormField label="Name" constraintText="Required" description={cfg.createNameDescription}>
            <Input
              value={newName}
              onChange={({ detail }) => setNewName(detail.value)}
              placeholder={cfg.createNamePlaceholder}
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
