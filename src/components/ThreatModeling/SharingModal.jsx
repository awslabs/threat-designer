import { useState, useEffect, useRef } from "react";
import Modal from "@cloudscape-design/components/modal";
import { Button, SpaceBetween, Box, FormField, Select, Table } from "@cloudscape-design/components";
import Alert from "@cloudscape-design/components/alert";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config.js";

const SharingModal = ({ visible, setVisible, threatModelId, isOwner }) => {
  const [availableUsers, setAvailableUsers] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const searchTimeoutRef = useRef(null);

  const accessLevelOptions = [
    { label: "Read-Only", value: "READ_ONLY" },
    { label: "Edit", value: "EDIT" },
  ];

  // Fetch collaborators when modal opens
  useEffect(() => {
    if (visible && threatModelId) {
      fetchUsers();
      fetchCollaborators();
    }
  }, [visible, threatModelId]);

  // Debounced search effect
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (visible) {
        fetchUsers(userSearchQuery);
      }
    }, 400); // 400ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [userSearchQuery, visible]);

  const fetchUsers = async (searchQuery = "") => {
    setLoadingUsers(true);
    try {
      const url = new URL(`${config.controlPlaneAPI}/threat-designer/users`);
      if (searchQuery) {
        url.searchParams.append("search", searchQuery);
      }
      url.searchParams.append("limit", "50");

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();
      const usersList = data.users || [];
      setAvailableUsers(
        usersList.map((user) => ({
          label: `${user.name || user.username} (${user.email})`,
          value: user.user_id, // Use UUID as value for internal operations
          email: user.email,
          name: user.name,
          username: user.username, // Keep for display
          user_id: user.user_id, // UUID from Cognito sub
        }))
      );
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchCollaborators = async () => {
    setLoadingCollaborators(true);
    try {
      const response = await fetch(
        `${config.controlPlaneAPI}/threat-designer/${threatModelId}/collaborators`,
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken()}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch collaborators");
      }

      const data = await response.json();
      setCollaborators(data.collaborators || []);
    } catch (err) {
      console.error("Error fetching collaborators:", err);
      setError("Failed to load collaborators");
    } finally {
      setLoadingCollaborators(false);
    }
  };

  const getAuthToken = async () => {
    const session = await fetchAuthSession();
    return session.tokens.idToken.toString();
  };

  const handleAddCollaborator = async () => {
    if (!selectedUser) {
      setError("Please select a user");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `${config.controlPlaneAPI}/threat-designer/${threatModelId}/share`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await getAuthToken()}`,
          },
          body: JSON.stringify({
            collaborators: [
              {
                user_id: selectedUser.value,
                access_level: "READ_ONLY", // Default to READ_ONLY
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to add collaborator");
      }

      setSuccess("Collaborator added successfully");
      setSelectedUser(null);
      await fetchCollaborators();
    } catch (err) {
      console.error("Error adding collaborator:", err);
      setError("Failed to add collaborator");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCollaborator = async (userId) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `${config.controlPlaneAPI}/threat-designer/${threatModelId}/collaborators/${userId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${await getAuthToken()}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to remove collaborator");
      }

      setSuccess("Collaborator removed successfully");
      await fetchCollaborators();
    } catch (err) {
      console.error("Error removing collaborator:", err);
      setError("Failed to remove collaborator");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAccessLevel = async (userId, newAccessLevel) => {
    try {
      const response = await fetch(
        `${config.controlPlaneAPI}/threat-designer/${threatModelId}/collaborators/${userId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await getAuthToken()}`,
          },
          body: JSON.stringify({
            access_level: newAccessLevel,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update access level");
      }

      // Update the local state instead of refetching
      setCollaborators((prev) =>
        prev.map((collab) =>
          collab.user_id === userId ? { ...collab, access_level: newAccessLevel } : collab
        )
      );

      setSuccess("Access level updated successfully");
    } catch (err) {
      console.error("Error updating access level:", err);
      setError("Failed to update access level");
      // Refetch on error to ensure consistency
      await fetchCollaborators();
    }
  };

  const handleClose = () => {
    setVisible(false);
    setError(null);
    setSuccess(null);
    setSelectedUser(null);
  };

  if (!isOwner) {
    return null;
  }

  return (
    <Modal
      onDismiss={handleClose}
      visible={visible}
      header="Manage collaborators"
      size="large"
      footer={
        <Box float="right">
          <Button variant="primary" onClick={handleClose} ariaLabel="Close collaborators modal">
            Close
          </Button>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert type="success" dismissible onDismiss={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <FormField
          label="Add collaborator"
          description="Users will be added with Read-Only access by default"
        >
          <SpaceBetween direction="horizontal" size="s">
            <div style={{ flexGrow: 1, minWidth: "400px" }}>
              <Select
                selectedOption={selectedUser}
                onChange={({ detail }) => setSelectedUser(detail.selectedOption)}
                options={availableUsers.filter(
                  (user) => !collaborators.some((c) => c.user_id === user.value)
                )}
                placeholder="Search for a user..."
                filteringType="manual"
                onLoadItems={({ detail }) => setUserSearchQuery(detail.filteringText)}
                statusType={loadingUsers ? "loading" : "finished"}
                loadingText="Searching users..."
                disabled={loading}
                empty="No users found"
              />
            </div>
            <Button
              variant="primary"
              onClick={handleAddCollaborator}
              loading={loading}
              disabled={!selectedUser}
              ariaLabel="Add selected user as collaborator"
            >
              Add
            </Button>
          </SpaceBetween>
        </FormField>

        <Table
          columnDefinitions={[
            {
              id: "user",
              header: "User",
              cell: (item) => (
                <SpaceBetween direction="vertical" size="xxs">
                  <Box>{item.username || item.user_id}</Box>
                  {item.email && (
                    <Box variant="small" color="text-body-secondary">
                      {item.email}
                    </Box>
                  )}
                </SpaceBetween>
              ),
              isRowHeader: true,
            },
            {
              id: "access_level",
              header: "Access Level",
              cell: (item) => {
                const option = accessLevelOptions.find((opt) => opt.value === item.access_level);
                return option ? option.label : item.access_level;
              },
              editConfig: {
                ariaLabel: "Access Level",
                editIconAriaLabel: "Edit access level",
                errorIconAriaLabel: "Access Level Error",
                editingCell: (item, { currentValue, setValue }) => {
                  const value = currentValue ?? item.access_level;
                  return (
                    <Select
                      autoFocus={true}
                      expandToViewport={true}
                      selectedOption={
                        accessLevelOptions.find((option) => option.value === value) ?? null
                      }
                      onChange={(event) => {
                        setValue(event.detail.selectedOption.value ?? item.access_level);
                      }}
                      options={accessLevelOptions}
                    />
                  );
                },
              },
            },
            {
              id: "shared_at",
              header: "Shared At",
              cell: (item) => new Date(item.shared_at).toLocaleString(),
            },
            {
              id: "actions",
              header: "Actions",
              cell: (item) => (
                <Button
                  onClick={() => handleRemoveCollaborator(item.user_id)}
                  disabled={loading}
                  variant="inline-link"
                >
                  Remove
                </Button>
              ),
            },
          ]}
          items={collaborators}
          loading={loadingCollaborators}
          loadingText="Loading collaborators..."
          variant="embedded"
          enableKeyboardNavigation
          submitEdit={async (item, column, newValue) => {
            if (column.id === "access_level") {
              await handleUpdateAccessLevel(item.user_id, newValue);
            }
          }}
          ariaLabels={{
            activateEditLabel: (column, item) =>
              `Edit ${item.username || item.user_id} ${column.header}`,
            cancelEditLabel: (column) => `Cancel editing ${column.header}`,
            submitEditLabel: (column) => `Submit editing ${column.header}`,
            tableLabel: "Collaborators table with inline editing",
          }}
          empty={
            <Box textAlign="center" color="inherit">
              <b>No collaborators</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                Add users to collaborate on this threat model
              </Box>
            </Box>
          }
        />
      </SpaceBetween>
    </Modal>
  );
};

export default SharingModal;
