import React, { useState, useEffect, useContext } from "react";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { Link } from "@cloudscape-design/components";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Badge from "@cloudscape-design/components/badge";
import Table from "@cloudscape-design/components/table";
import Pagination from "@cloudscape-design/components/pagination";
import Alert from "@cloudscape-design/components/alert";
import Modal from "@cloudscape-design/components/modal";
import { useNavigate } from "react-router";
import { getThreatModelingStatus, deleteTm } from "../../services/ThreatDesigner/stats";
import { StatusIndicatorComponent } from "./ThreatCatalogCards";
import { ChatSessionFunctionsContext } from "../Agent/ChatContext";

const TableStatusComponent = ({ id }) => {
  const [status, setStatus] = useState("LOADING");

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const statusResponse = await getThreatModelingStatus(id);
        setStatus(statusResponse.data.state);
      } catch (error) {
        console.log(error);
        console.error("Error fetching threat modeling status:", error);
        setStatus("FAILED");
      }
    };
    fetchStatus();
  }, [id]);

  return <StatusIndicatorComponent status={status} />;
};

export const ThreatCatalogTable = ({ results, onItemsChange }) => {
  const [selectedItems, setSelectedItems] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [sortingColumn, setSortingColumn] = useState({ sortingField: "timestamp" });
  const [sortingDescending, setSortingDescending] = useState(true);
  const functions = useContext(ChatSessionFunctionsContext);

  const pageSize = 25;
  const navigate = useNavigate();

  const handleBulkDelete = async () => {
    setDeleteInProgress(true);
    try {
      const deletePromises = selectedItems.map((item) => {
        (deleteTm(item.job_id), functions.clearSession(item.job_id));
      });
      await Promise.all(deletePromises);

      const idsToRemove = selectedItems.map((item) => item.job_id);
      onItemsChange(results.filter((item) => !idsToRemove.includes(item.job_id)));
      setSelectedItems([]);
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Error deleting threat models:", error);
    } finally {
      setDeleteInProgress(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";
    try {
      const date = new Date(timestamp);
      return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch (error) {
      return "Invalid date";
    }
  };

  const sortItems = (items, column, isDescending) => {
    return [...items].sort((a, b) => {
      let aValue, bValue;

      if (column.sortingField === "timestamp") {
        aValue = a.timestamp ? new Date(a.timestamp) : new Date(0);
        bValue = b.timestamp ? new Date(b.timestamp) : new Date(0);
      } else {
        return 0;
      }

      if (aValue < bValue) return isDescending ? 1 : -1;
      if (aValue > bValue) return isDescending ? -1 : 1;
      return 0;
    });
  };

  const columnDefinitions = [
    {
      id: "title",
      header: "Title",
      cell: (item) => (
        <Link
          variant="primary"
          href={`/${item.job_id}`}
          onFollow={(event) => {
            event.preventDefault();
            navigate(`/${item.job_id}`);
          }}
        >
          <Box>{item?.title || "Untitled"}</Box>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => <TableStatusComponent id={item.job_id} />,
      width: 150,
    },
    {
      id: "high-threats",
      header: "High",
      cell: (item) => (
        <Box textAlign="center">
          <Badge color="severity-high">
            {item?.threat_list?.threats
              ? item.threat_list.threats.filter((threat) => threat.likelihood === "High").length ||
                "0"
              : "0"}
          </Badge>
        </Box>
      ),
      width: 80,
    },
    {
      id: "medium-threats",
      header: "Medium",
      cell: (item) => (
        <Box textAlign="center">
          <Badge color="severity-medium">
            {item?.threat_list?.threats
              ? item.threat_list.threats.filter((threat) => threat.likelihood === "Medium")
                  .length || "0"
              : "0"}
          </Badge>
        </Box>
      ),
      width: 80,
    },
    {
      id: "low-threats",
      header: "Low",
      cell: (item) => (
        <Box textAlign="center">
          <Badge color="severity-low">
            {item?.threat_list?.threats
              ? item.threat_list.threats.filter((threat) => threat.likelihood === "Low").length ||
                "0"
              : "0"}
          </Badge>
        </Box>
      ),
      width: 80,
    },
    {
      id: "summary",
      header: "Summary",
      cell: (item) => (
        <Box
          variant="small"
          color="text-body-secondary"
          style={{
            wordWrap: "break-word",
            wordBreak: "break-word",
            whiteSpace: "normal",
            lineHeight: "1.4",
          }}
        >
          {item?.summary || "No summary available"}
        </Box>
      ),
      minWidth: 250,
      width: "30%",
    },
    {
      id: "updated-at",
      header: "Updated at",
      cell: (item) => (
        <Box variant="small" color="text-body-secondary">
          {formatTimestamp(item?.timestamp)}
        </Box>
      ),
      width: 200,
      sortingField: "timestamp",
    },
  ];

  const sortedItems = sortItems(results, sortingColumn, sortingDescending);
  const paginatedItems = sortedItems.slice(
    (currentPageIndex - 1) * pageSize,
    currentPageIndex * pageSize
  );

  return (
    <SpaceBetween size="s">
      <Table
        columnDefinitions={columnDefinitions}
        items={paginatedItems}
        loadingText="Loading threat models"
        selectionType="multi"
        selectedItems={selectedItems}
        onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
        trackBy="job_id"
        variant="container"
        wrapLines={true}
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={({ detail }) => {
          setSortingColumn(detail.sortingColumn);
          setSortingDescending(detail.isDescending);
          setCurrentPageIndex(1);
        }}
        empty={
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <SpaceBetween size="m">
              <b>No threat models</b>
            </SpaceBetween>
          </Box>
        }
        header={
          <Header
            counter={
              selectedItems.length
                ? `(${selectedItems.length}/${results.length})`
                : `(${results.length})`
            }
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  disabled={selectedItems.length === 0}
                  onClick={() => setShowDeleteModal(true)}
                >
                  Delete
                </Button>
              </SpaceBetween>
            }
          >
            Threat Catalog
          </Header>
        }
        pagination={
          <Pagination
            currentPageIndex={currentPageIndex}
            onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
            pagesCount={Math.ceil(results.length / pageSize)}
            ariaLabels={{
              nextPageLabel: "Next page",
              previousPageLabel: "Previous page",
              pageLabel: (pageNumber) => `Go to page ${pageNumber}`,
            }}
          />
        }
      />

      <Modal
        onDismiss={() => setShowDeleteModal(false)}
        visible={showDeleteModal}
        header="Delete threat models"
        closeAriaLabel="Close modal"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteInProgress}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleBulkDelete} loading={deleteInProgress}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Alert type="warning">
          Are you sure you want to delete {selectedItems.length} threat model
          {selectedItems.length > 1 ? "s" : ""}? This action cannot be undone.
        </Alert>
      </Modal>
    </SpaceBetween>
  );
};

export default ThreatCatalogTable;
