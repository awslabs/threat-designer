import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Table from "@cloudscape-design/components/table";
import Tabs from "@cloudscape-design/components/tabs";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Select from "@cloudscape-design/components/select";
import Alert from "@cloudscape-design/components/alert";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Badge from "@cloudscape-design/components/badge";
import Spinner from "@cloudscape-design/components/spinner";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config.js";
import {
  getSpace,
  listDocuments,
  uploadDocument,
  deleteDocument,
  deleteSpace,
  createSpace,
  getSpaceSharing,
  shareSpace,
  removeSpaceSharing,
} from "../../services/Spaces/spacesService";

export default function SpacesCatalog() {
  const { spaceId } = useParams();
  const navigate = useNavigate();

  const [space, setSpace] = useState(null);
  const [loadingSpace, setLoadingSpace] = useState(false);
  const [spaceError, setSpaceError] = useState(null);

  const [activeTab, setActiveTab] = useState("files");

  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingDocIds, setDeletingDocIds] = useState(new Set());
  const fileInputRef = useRef(null);

  const [collaborators, setCollaborators] = useState([]);

  // Empty-state create
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [selectedShareUser, setSelectedShareUser] = useState(null);
  const [shareUsers, setShareUsers] = useState([]);
  const [loadingShareUsers, setLoadingShareUsers] = useState(false);
  const [shareUserSearch, setShareUserSearch] = useState("");
  const [sharing, setSharing] = useState(false);
  const shareSearchRef = useRef(null);

  useEffect(() => {
    if (!spaceId) {
      setSpace(null);
      return;
    }
    setActiveTab("files");
    loadSpace(spaceId);
  }, [spaceId]);

  // Poll while any document is still ingesting
  useEffect(() => {
    const hasIngesting = documents.some((d) => d.status === "INGESTING");
    if (!hasIngesting || !spaceId) return;
    const interval = setInterval(async () => {
      try {
        const docs = await listDocuments(spaceId);
        setDocuments(docs ?? []);
      } catch {
        // noop
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [documents, spaceId]);

  // Debounced Cognito user search for share modal
  useEffect(() => {
    if (!shareOpen) return;
    if (shareSearchRef.current) clearTimeout(shareSearchRef.current);
    shareSearchRef.current = setTimeout(() => fetchShareUsers(shareUserSearch), 400);
    return () => clearTimeout(shareSearchRef.current);
  }, [shareUserSearch, shareOpen]);

  async function fetchShareUsers(query = "") {
    setLoadingShareUsers(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken.toString();
      const url = new URL(`${config.controlPlaneAPI}/threat-designer/users`);
      if (query) url.searchParams.append("search", query);
      url.searchParams.append("limit", "50");
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setShareUsers(
        (data.users ?? []).map((u) => ({
          label: `${u.name || u.username} (${u.email})`,
          value: u.user_id,
        }))
      );
    } catch {
      // noop
    } finally {
      setLoadingShareUsers(false);
    }
  }

  async function loadSpace(id) {
    setLoadingSpace(true);
    setSpaceError(null);
    try {
      const [s, docs] = await Promise.all([getSpace(id), listDocuments(id)]);
      setSpace(s);
      setDocuments(docs ?? []);
      if (s.is_owner) {
        const collabs = await getSpaceSharing(id);
        setCollaborators(collabs ?? []);
      } else {
        setCollaborators([]);
      }
    } catch {
      setSpaceError("Failed to load space.");
    } finally {
      setLoadingSpace(false);
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !spaceId) return;
    setUploading(true);
    try {
      const results = await Promise.allSettled(files.map((f) => uploadDocument(spaceId, f)));
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
      await deleteDocument(spaceId, documentId);
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
      await deleteSpace(spaceId);
      setDeleteOpen(false);
      navigate("/spaces");
    } catch {
      // noop
    } finally {
      setDeleting(false);
    }
  }

  async function handleShare() {
    if (!selectedShareUser) return;
    setSharing(true);
    try {
      await shareSpace(spaceId, [selectedShareUser.value]);
      const updated = await getSpaceSharing(spaceId);
      setCollaborators(updated ?? []);
      setSelectedShareUser(null);
      setShareUserSearch("");
      setShareOpen(false);
    } catch {
      // noop
    } finally {
      setSharing(false);
    }
  }

  async function handleRemoveCollaborator(userId) {
    try {
      await removeSpaceSharing(spaceId, userId);
      setCollaborators((prev) => prev.filter((c) => c.user_id !== userId));
    } catch {
      // noop
    }
  }

  async function handleCreateNew() {
    if (!newName.trim()) return;
    setCreatingNew(true);
    try {
      const space = await createSpace(newName.trim(), newDesc.trim());
      setNewName("");
      setNewDesc("");
      setCreateOpen(false);
      navigate(`/spaces/${space.space_id}`);
    } catch {
      // noop
    } finally {
      setCreatingNew(false);
    }
  }

  // ── Empty state (no space selected) ────────────────────────────────────────

  if (!spaceId) {
    return (
      <>
        <Box padding="xxl" textAlign="center" color="inherit" style={{ marginTop: "120px" }}>
          <SpaceBetween size="m" alignItems="center">
            <Box variant="h2" color="inherit">
              No space selected
            </Box>
            <Box variant="p" color="inherit">
              Select a space from the panel or create a new one.
            </Box>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Create Space
            </Button>
          </SpaceBetween>
        </Box>

        <Modal
          visible={createOpen}
          onDismiss={() => setCreateOpen(false)}
          header="Create space"
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

  // ── Loading / error ─────────────────────────────────────────────────────────

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
        <Alert type="error">{spaceError ?? "Space not found."}</Alert>
      </Box>
    );
  }

  // ── Space detail ────────────────────────────────────────────────────────────

  return (
    <Box padding="l">
      <Container
        header={
          <Header
            variant="h2"
            description={space.description || undefined}
            actions={
              space.is_owner ? (
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="normal" onClick={() => setDeleteOpen(true)}>
                    Delete space
                  </Button>
                </SpaceBetween>
              ) : undefined
            }
          >
            {space.name}
          </Header>
        }
      >
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          tabs={[
            {
              id: "files",
              label: "Files",
              content: (
                <Box padding={{ top: "m" }}>
                  <Table
                    variant="embedded"
                    header={
                      <Header
                        variant="h3"
                        actions={
                          space.is_owner ? (
                            <>
                              <Button
                                onClick={() => fileInputRef.current?.click()}
                                loading={uploading}
                              >
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
                          ) : undefined
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
                          <StatusIndicator
                            type={item.status === "INGESTING" ? "in-progress" : "success"}
                          >
                            {item.status === "INGESTING" ? "Indexing" : "Ready"}
                          </StatusIndicator>
                        ),
                      },
                      {
                        id: "created",
                        header: "Uploaded",
                        cell: (item) =>
                          item.created_at ? new Date(item.created_at).toLocaleDateString() : "—",
                      },
                      ...(space.is_owner
                        ? [
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
                          ]
                        : []),
                    ]}
                    items={documents}
                    loading={docsLoading}
                    empty={
                      <Box textAlign="center" color="inherit" padding="l">
                        <b>No files yet</b>
                        <Box variant="p" color="inherit">
                          Upload documents to build the knowledge base for this space.
                        </Box>
                      </Box>
                    }
                  />
                </Box>
              ),
            },
            {
              id: "sharing",
              label: "Sharing",
              disabled: !space.is_owner,
              content: (
                <Box padding={{ top: "m" }}>
                  <Table
                    variant="embedded"
                    header={
                      <Header
                        variant="h3"
                        actions={
                          <Button onClick={() => setShareOpen(true)}>Add collaborator</Button>
                        }
                      >
                        Collaborators
                      </Header>
                    }
                    columnDefinitions={[
                      {
                        id: "user",
                        header: "User",
                        cell: (item) => item.email || item.user_id,
                      },
                      {
                        id: "access",
                        header: "Access",
                        cell: () => <Badge>Read-only</Badge>,
                      },
                      {
                        id: "actions",
                        header: "Action",
                        cell: (item) => (
                          <Button
                            variant="link"
                            onClick={() => handleRemoveCollaborator(item.user_id)}
                          >
                            Remove
                          </Button>
                        ),
                      },
                    ]}
                    items={collaborators}
                    empty={
                      <Box textAlign="center" color="inherit" padding="l">
                        <b>Not shared</b>
                        <Box variant="p" color="inherit">
                          Add collaborators to give others read access to this space.
                        </Box>
                      </Box>
                    }
                  />
                </Box>
              ),
            },
          ]}
        />
      </Container>

      {/* Delete space */}
      <Modal
        visible={deleteOpen}
        onDismiss={() => setDeleteOpen(false)}
        header="Delete space"
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
          Are you sure you want to delete <b>{space.name}</b>? All files and sharing settings will
          be removed.
        </Box>
      </Modal>

      {/* Share */}
      <Modal
        visible={shareOpen}
        onDismiss={() => setShareOpen(false)}
        header="Add collaborator"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setShareOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleShare}
                loading={sharing}
                disabled={!selectedShareUser}
              >
                Add
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="User" constraintText="Grants read-only access">
          <Select
            selectedOption={selectedShareUser}
            onChange={({ detail }) => setSelectedShareUser(detail.selectedOption)}
            options={shareUsers.filter((u) => !collaborators.some((c) => c.user_id === u.value))}
            placeholder="Search for a user..."
            filteringType="manual"
            onLoadItems={({ detail }) => setShareUserSearch(detail.filteringText)}
            statusType={loadingShareUsers ? "loading" : "finished"}
            loadingText="Searching users..."
            empty="No users found"
          />
        </FormField>
      </Modal>
    </Box>
  );
}
