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
import { spacesService } from "../../services/Spaces/spacesService";

const DEFAULT_LABELS = {
  basePath: "/spaces",
  entity: "space",
  createTitle: "Create space",
  createNamePlaceholder: "My project space",
  createNameDescription: undefined,
  emptyTitle: "No space selected",
  emptyBody: "Select a space from the panel or create a new one.",
  emptyCreateButton: "Create Space",
  deleteTitle: "Delete space",
  deleteButton: "Delete space",
  deleteConfirmSuffix: "All files and sharing settings will be removed.",
  filesEmptyBody: "Upload documents to build the knowledge base for this space.",
  detailFallbackDescription: undefined,
};

/**
 * Space catalog page, parametrized so both user Spaces and governance System
 * Spaces render from one implementation. `variant` supplies the service module,
 * base route, copy, and feature flags (sharing, single-space GET). Defaults are
 * the user-space behavior, so <SpacesCatalog /> with no props is unchanged.
 */
export default function SpacesCatalog({
  service = spacesService,
  labels: labelOverrides,
  sharingEnabled = true,
  hasSingleGet = true,
} = {}) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const {
    getSpace,
    listSpaces,
    listDocuments,
    uploadDocument,
    deleteDocument,
    deleteSpace,
    createSpace,
    getSpaceSharing,
    shareSpace,
    removeSpaceSharing,
  } = service;
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
      const token = session.tokens?.idToken?.toString();
      if (!token) throw new Error("No authentication token available");
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
      if (hasSingleGet) {
        const [s, docs] = await Promise.all([getSpace(id), listDocuments(id)]);
        setSpace(s);
        setDocuments(docs ?? []);
        if (sharingEnabled && s.is_owner) {
          const collabs = await getSpaceSharing(id);
          setCollaborators(collabs ?? []);
        } else {
          setCollaborators([]);
        }
      } else {
        // No single-space GET (governance): resolve metadata from the list and
        // load documents directly (the docs endpoint verifies the space type).
        const [spaces, docs] = await Promise.all([listSpaces(), listDocuments(id)]);
        const found = (spaces ?? []).find((s) => s.space_id === id);
        if (!found) {
          setSpaceError(`No ${labels.entity} found.`);
          return;
        }
        setSpace(found);
        setDocuments(docs ?? []);
        setCollaborators([]);
      }
    } catch {
      setSpaceError(`Failed to load ${labels.entity}.`);
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
      navigate(labels.basePath);
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
      navigate(`${labels.basePath}/${space.space_id}`);
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
              {labels.emptyTitle}
            </Box>
            <Box variant="p" color="inherit">
              {labels.emptyBody}
            </Box>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {labels.emptyCreateButton}
            </Button>
          </SpaceBetween>
        </Box>

        <Modal
          visible={createOpen}
          onDismiss={() => setCreateOpen(false)}
          header={labels.createTitle}
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
              description={labels.createNameDescription}
            >
              <Input
                value={newName}
                onChange={({ detail }) => setNewName(detail.value)}
                placeholder={labels.createNamePlaceholder}
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
        <Alert type="error">{spaceError ?? `No ${labels.entity} found.`}</Alert>
      </Box>
    );
  }

  // Sharing-based spaces gate management on ownership; governance system spaces
  // have no owner concept in the UI (only governance members reach the page),
  // so management is always available there.
  const canManage = sharingEnabled ? !!space.is_owner : true;

  // ── Space detail ────────────────────────────────────────────────────────────

  return (
    <Box padding="l">
      <Container
        header={
          <Header
            variant="h2"
            description={space.description || labels.detailFallbackDescription}
            actions={
              canManage ? (
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="normal" onClick={() => setDeleteOpen(true)}>
                    {labels.deleteButton}
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
                          canManage ? (
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
                      ...(canManage
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
                          {labels.filesEmptyBody}
                        </Box>
                      </Box>
                    }
                  />
                </Box>
              ),
            },
            ...(sharingEnabled
              ? [
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
                ]
              : []),
          ]}
        />
      </Container>

      {/* Delete space */}
      <Modal
        visible={deleteOpen}
        onDismiss={() => setDeleteOpen(false)}
        header={labels.deleteTitle}
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
          Are you sure you want to delete <b>{space.name}</b>? {labels.deleteConfirmSuffix}
        </Box>
      </Modal>

      {/* Share */}
      {sharingEnabled && (
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
      )}
    </Box>
  );
}
