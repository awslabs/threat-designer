import { useState, useEffect } from "react";
import "../Spaces/SpacesPanel.css";
import { useNavigate, useLocation } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { listSystemSpaces, createSystemSpace } from "../../services/Governance/governanceService";

export function GovernancePanel() {
  const navigate = useNavigate();
  const location = useLocation();

  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const activeSpaceId = location.pathname.startsWith("/governance/")
    ? location.pathname.split("/governance/")[1]
    : null;

  useEffect(() => {
    load();
  }, [location.pathname]);

  async function load() {
    setLoading(true);
    try {
      const data = await listSystemSpaces();
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
      const space = await createSystemSpace(newName.trim(), newDesc.trim());
      setSpaces((prev) => [...prev, space]);
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      navigate(`/governance/${space.space_id}`);
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
            <ShieldCheck size={14} />
            System Spaces
          </span>
          <Button
            variant="icon"
            iconName="add-plus"
            ariaLabel="New system space"
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
              <span>No system spaces yet</span>
            </div>
          ) : (
            <>
              {spaces.map((space) => (
                <button
                  key={space.space_id}
                  className={`spaces-panel-item ${activeSpaceId === space.space_id ? "active" : ""}`}
                  onClick={() => navigate(`/governance/${space.space_id}`)}
                  title={space.name}
                >
                  <ShieldCheck size={14} className="spaces-panel-item-icon" />
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
        header="Create system space"
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
          <FormField
            label="Name"
            constraintText="Required"
            description="Applied to every threat model as a mandatory organization-wide knowledge base."
          >
            <Input
              value={newName}
              onChange={({ detail }) => setNewName(detail.value)}
              placeholder="Org security standards"
            />
          </FormField>
          <FormField label="Description" constraintText="Optional">
            <Textarea
              value={newDesc}
              onChange={({ detail }) => setNewDesc(detail.value)}
              placeholder="Describe this system space..."
              rows={3}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
    </>
  );
}
