import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Table from "@cloudscape-design/components/table";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Alert from "@cloudscape-design/components/alert";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Spinner from "@cloudscape-design/components/spinner";
import {
  listSystemSpaces,
  listSystemDocuments,
  uploadSystemDocument,
  deleteSystemDocument,
  deleteSystemSpace,
  createSystemSpace,
} from "../../services/Governance/governanceService";

export default function GovernanceCatalog() {
  const { spaceId } = useParams();
  const navigate = useNavigate();

  const [space, setSpace] = useState(null);
  const [loadingSpace, setLoadingSpace] = useState(false);
  const [spaceError, setSpaceError] = useState(null);

  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [deletingDocIds, setDeletingDocIds] = useState(new Set());
  const fileInputRef = useRef(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!spaceId) {
      setSpace(null);
      return;
    }
    loadSpace(spaceId);
  }, [spaceId]);

  // Poll while any document is still ingesting
  useEffect(() => {
    const hasIngesting = documents.some((d) => d.status === "INGESTING");
    if (!hasIngesting || !spaceId) return;
    const interval = setInterval(async () => {
      try {
        const docs = await listSystemDocuments(spaceId);
        setDocuments(docs ?? []);
      } catch {
        // noop
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [documents, spaceId]);

  async function loadSpace(id) {
    setLoadingSpace(true);
    setSpaceError(null);
    try {
      // No single-space governance GET; resolve metadata from the list and
      // load documents directly (the docs endpoint verifies it is a system space).
      const [spaces, docs] = await Promise.all([listSystemSpaces(), listSystemDocuments(id)]);
      const found = (spaces ?? []).find((s) => s.space_id === id);
      if (!found) {
        setSpaceError("System space not found.");
        return;
      }
      setSpace(found);
      setDocuments(docs ?? []);
    } catch {
      setSpaceError("Failed to load system space.");
    } finally {
      setLoadingSpace(false);
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !spaceId) return;
    setUploading(true);
    try {
      const results = await Promise.allSettled(files.map((f) => uploadSystemDocument(spaceId, f)));
      const succeeded = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (succeeded.length) setDocuments((prev) => [...prev, ...succeeded]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteDocument(documentId) {
    setDeletingDocIds((prev) => new Set(prev).add(documentId));
    try {
      await deleteSystemDocument(spaceId, documentId);
      setDocuments((prev) => prev.filter((d) => d.document_id !== documentId));
    } catch {
      // noop
    } finally {
      setDeletingDocIds((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteSystemSpace(spaceId);
      setDeleteOpen(false);
      navigate("/governance");
    } catch {
      // noop
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateNew() {
    if (!newName.trim()) return;
    setCreatingNew(true);
    try {
      const created = await createSystemSpace(newName.trim(), newDesc.trim());
      setNewName("");
      setNewDesc("");
      setCreateOpen(false);
      navigate(`/governance/${created.space_id}`);
    } catch {
      // noop
    } finally {
      setCreatingNew(false);
    }
  }

  if (!spaceId) {
    return (
      <>
        <Box padding="xxl" textAlign="center" color="inherit" style={{ marginTop: "120px" }}>
          <SpaceBetween size="m" alignItems="center">
            <Box variant="h2" color="inherit">
              No system space selected
            </Box>
            <Box variant="p" color="inherit">
              System spaces are queried for every threat model. Select one from the panel or create
              a new one.
            </Box>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Create System Space
            </Button>
          </SpaceBetween>
        </Box>

        <Modal
          visible={createOpen}
          onDismiss={() => setCreateOpen(false)}
          header="Create system space"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleCreateNew} loading={creatingNew}>
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

  if (loadingSpace) {
    return (
      <Box padding="xxl" textAlign="center">
        <Spinner size="large" />
      </Box>
    );
  }

  if (spaceError || !space) {
    return (
      <Box padding="l">
        <Alert type="error">{spaceError ?? "System space not found."}</Alert>
      </Box>
    );
  }

  return (
    <Box padding="l">
      <Container
        header={
          <Header
            variant="h2"
            description={space.description || "Applied to every threat model."}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="normal" onClick={() => setDeleteOpen(true)}>
                  Delete system space
                </Button>
              </SpaceBetween>
            }
          >
            {space.name}
          </Header>
        }
      >
        <Table
          variant="embedded"
          header={
            <Header
              variant="h3"
              actions={
                <>
                  <Button onClick={() => fileInputRef.current?.click()} loading={uploading}>
                    Upload file
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={handleUpload}
                    accept=".pdf,.txt,.md,.docx,.csv"
                  />
                </>
              }
            >
              Files
            </Header>
          }
          columnDefinitions={[
            {
              id: "filename",
              header: "Filename",
              cell: (item) => item.filename,
            },
            {
              id: "status",
              header: "Status",
              cell: (item) => (
                <StatusIndicator type={item.status === "INGESTING" ? "in-progress" : "success"}>
                  {item.status === "INGESTING" ? "Indexing" : "Ready"}
                </StatusIndicator>
              ),
            },
            {
              id: "created",
              header: "Uploaded",
              cell: (item) =>
                item.created_at ? new Date(item.created_at).toLocaleDateString() : "-",
            },
            {
              id: "actions",
              header: "Action",
              cell: (item) => (
                <Button
                  variant="link"
                  loading={deletingDocIds.has(item.document_id)}
                  onClick={() => handleDeleteDocument(item.document_id)}
                >
                  Remove
                </Button>
              ),
            },
          ]}
          items={documents}
          empty={
            <Box textAlign="center" color="inherit" padding="l">
              <b>No files yet</b>
              <Box variant="p" color="inherit">
                Upload documents to build the organization-wide knowledge base.
              </Box>
            </Box>
          }
        />
      </Container>

      <Modal
        visible={deleteOpen}
        onDismiss={() => setDeleteOpen(false)}
        header="Delete system space"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Box>
          Are you sure you want to delete <b>{space.name}</b>? It will no longer be applied to new
          threat models and all its files will be removed.
        </Box>
      </Modal>
    </Box>
  );
}
