import React, { useState, useEffect, useContext } from "react";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { Link } from "@cloudscape-design/components";
import Grid from "@cloudscape-design/components/grid";
import Container from "@cloudscape-design/components/container";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import { useNavigate } from "react-router";
import { S3DownloaderComponent } from "./S3Downloader";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { Spinner, ButtonDropdown } from "@cloudscape-design/components";
import Badge from "@cloudscape-design/components/badge";
import Alert from "@cloudscape-design/components/alert";
import {
  getThreatModelingStatus,
  getThreatModelingAllResults,
  deleteTm,
  getDownloadUrlsBatch,
} from "../../services/ThreatDesigner/stats";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import ThreatCatalogTable from "./ThreatCatalogTable";
import { ChatSessionFunctionsContext } from "../Agent/ChatContext";
import {
  getCachedPresignedUrl,
  setCachedPresignedUrl,
} from "../../services/ThreatDesigner/presignedUrlCache";

export const StatusIndicatorComponent = ({ status }) => {
  switch (status) {
    case "COMPLETE":
      return <StatusIndicator type="success">Completed</StatusIndicator>;
    case "Not Found":
      return <StatusIndicator type="info">Unknown</StatusIndicator>;
    case "FAILED":
      return <StatusIndicator type="error">Failed</StatusIndicator>;
    case "LOADING":
      return (
        <SpaceBetween alignItems="center">
          <Spinner />
        </SpaceBetween>
      );
    default:
      return <StatusIndicator type="in-progress">In Progress</StatusIndicator>;
  }
};

const StatusComponponent = ({ id }) => {
  const [status, setStatus] = useState("LOADING");

  const handleRefresh = async () => {
    try {
      const statusResponse = await getThreatModelingStatus(id);
      setStatus(statusResponse.data.state);
    } catch (error) {
      console.error("Error fetching threat modeling status:", error);
      setStatus("FAILED");
    }
  };

  useEffect(() => {
    handleRefresh();
  }, []);

  return (
    <SpaceBetween direction="horizontal" size="s">
      <StatusIndicatorComponent status={status} />
      {["COMPLETE", "FAILED", "LOADING"].includes(status) || (
        <Button iconName="refresh" variant="inline-icon" onClick={handleRefresh} />
      )}
    </SpaceBetween>
  );
};

export const ThreatCatalogCardsComponent = ({ user }) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const functions = useContext(ChatSessionFunctionsContext);
  const [presignedUrlMap, setPresignedUrlMap] = useState({});
  const [presignedUrlsLoading, setPresignedUrlsLoading] = useState(false);
  const [batchLoadError, setBatchLoadError] = useState(null);

  const [viewMode, setViewMode] = useState(() => {
    try {
      const savedViewMode = localStorage.getItem("threatCatalogViewMode");
      return savedViewMode && ["card", "table"].includes(savedViewMode) ? savedViewMode : "card";
    } catch (error) {
      console.error("Error reading from localStorage:", error);
      return "card";
    }
  });

  const [filterMode, setFilterMode] = useState("all");

  // Shared pagination state for both card and table views
  const [pagination, setPagination] = useState({
    hasNextPage: false,
    cursor: null,
    loading: false,
    pageSize: (() => {
      try {
        const savedPageSize = localStorage.getItem("threatCatalogPageSize");
        return savedPageSize && [10, 20, 50, 100].includes(parseInt(savedPageSize))
          ? parseInt(savedPageSize)
          : 20;
      } catch (error) {
        console.error("Error reading from localStorage:", error);
        return 20;
      }
    })(),
  });

  const [error, setError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem("threatCatalogViewMode", viewMode);
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  }, [viewMode]);

  const removeItem = (idToRemove) => {
    setResults(results.filter((item) => item.job_id !== idToRemove));
  };

  // Load initial page of results
  useEffect(() => {
    setLoading(true);
    setError(null);
    const fetchAllResults = async () => {
      try {
        const response = await getThreatModelingAllResults(pagination.pageSize, null, filterMode);
        const sortedCatalogs = response?.data?.catalogs.sort((a, b) => {
          if (!a.timestamp && !b.timestamp) return 0;
          if (!a.timestamp) return 1;
          if (!b.timestamp) return -1;

          return new Date(b.timestamp) - new Date(a.timestamp);
        });
        setResults(sortedCatalogs);
        setPagination((prev) => ({
          ...prev,
          hasNextPage: response?.data?.pagination?.hasNextPage || false,
          cursor: response?.data?.pagination?.cursor || null,
        }));
      } catch (error) {
        setResults([]);
        setError("Failed to load threat models. Please try again.");
        console.error("Error getting threat modeling results:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllResults();
  }, [user, pagination.pageSize, filterMode]);

  // Batch load presigned URLs when results change
  useEffect(() => {
    const loadPresignedUrls = async () => {
      if (results.length === 0) {
        setPresignedUrlsLoading(false);
        return;
      }

      // Collect all threat model IDs from visible threat models
      const allThreatModelIds = results
        .filter((item) => item.job_id && item.s3_location)
        .map((item) => item.job_id);

      if (allThreatModelIds.length === 0) {
        setPresignedUrlsLoading(false);
        return;
      }

      // Check cache first and separate cached vs uncached IDs
      const urlMap = {};
      const uncachedIds = [];

      allThreatModelIds.forEach((id) => {
        const cached = getCachedPresignedUrl(id);
        if (cached) {
          urlMap[id] = cached;
        } else {
          uncachedIds.push(id);
        }
      });

      // If all URLs are cached, use them immediately
      if (uncachedIds.length === 0) {
        setPresignedUrlMap(urlMap);
        setPresignedUrlsLoading(false);
        return;
      }

      try {
        setPresignedUrlsLoading(true);
        setBatchLoadError(null);

        // Call batch API only for uncached threat model IDs
        const batchResults = await getDownloadUrlsBatch(uncachedIds);

        // Process batch results and update cache
        batchResults.forEach((result) => {
          const data =
            result.success && result.presigned_url
              ? { url: result.presigned_url, success: true }
              : { error: result.error || "Failed to load", success: false };

          urlMap[result.threat_model_id] = data;
          setCachedPresignedUrl(result.threat_model_id, data);
        });

        setPresignedUrlMap(urlMap);
      } catch (error) {
        console.error("Error loading presigned URLs in batch:", error);
        setBatchLoadError("Failed to load architecture diagrams. Some images may not display.");
      } finally {
        setPresignedUrlsLoading(false);
      }
    };

    loadPresignedUrls();
  }, [results]);

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const results = await deleteTm(id);
      removeItem(id);
      await functions.clearSession(id);
    } catch (error) {
      console.error("Error deleting threat model:", error);
    } finally {
      setDeletingId(null);
    }
  };

  // Load more results (append to existing results)
  const loadMore = async () => {
    if (!pagination.hasNextPage || pagination.loading) return;

    setPagination((prev) => ({ ...prev, loading: true }));
    setError(null);

    try {
      const response = await getThreatModelingAllResults(
        pagination.pageSize,
        pagination.cursor,
        filterMode
      );
      const newCatalogs = response?.data?.catalogs || [];
      const sortedNewCatalogs = newCatalogs.sort((a, b) => {
        if (!a.timestamp && !b.timestamp) return 0;
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;

        return new Date(b.timestamp) - new Date(a.timestamp);
      });

      setResults((prev) => [...prev, ...sortedNewCatalogs]);
      setPagination((prev) => ({
        ...prev,
        hasNextPage: response?.data?.pagination?.hasNextPage || false,
        cursor: response?.data?.pagination?.cursor || null,
        loading: false,
      }));
    } catch (error) {
      setError("Failed to load more results. Please try again.");
      console.error("Error loading more results:", error);
      setPagination((prev) => ({ ...prev, loading: false }));
    }
  };

  // Change page size and reset pagination
  const changePageSize = (newSize) => {
    try {
      localStorage.setItem("threatCatalogPageSize", newSize.toString());
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }

    setPagination({
      hasNextPage: false,
      cursor: null,
      loading: false,
      pageSize: newSize,
    });
    setResults([]);
  };

  // Show all results without filtering
  const filteredResults = results;

  const createGridDefinition = () => {
    const gridDefinition = [];
    filteredResults.forEach(() => {
      gridDefinition.push({
        colspan: { default: 12, xxs: 12, xs: 12, s: 12, m: 6, l: 6, xl: 6 },
      });
    });
    return gridDefinition;
  };

  const renderCardView = () => (
    <Grid gridDefinition={createGridDefinition()}>
      {filteredResults.map((item) => {
        const presignedData = presignedUrlMap[item?.job_id];
        return (
          <div key={item.job_id} style={{ height: 250 }}>
            {deletingId === item.job_id ? (
              <Container fitHeight>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100%",
                  }}
                >
                  <Spinner size="large" />
                </div>
              </Container>
            ) : (
              <Container
                key={item.job_id}
                media={{
                  content:
                    presignedUrlsLoading || !presignedData ? (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          height: 250,
                          width: "100%",
                          background: "#EEEEEE",
                        }}
                      >
                        <Spinner size="large" />
                      </div>
                    ) : (
                      <S3DownloaderComponent
                        threatModelId={item?.job_id}
                        presignedUrl={presignedData?.url}
                      />
                    ),
                  position: "side",
                  width: "40%",
                }}
                fitHeight
                header={
                  <Header
                    variant="h2"
                    actions={
                      <ButtonDropdown
                        onItemClick={(itemClickDetails) => {
                          if (itemClickDetails.detail.id === "delete") {
                            handleDelete(item.job_id);
                          }
                        }}
                        items={[
                          { id: "delete", text: "Delete", disabled: item.is_owner === false },
                        ]}
                        variant="icon"
                      />
                    }
                    style={{ width: "100%", overflow: "hidden" }}
                  >
                    <SpaceBetween direction="horizontal" size="xs">
                      <Link
                        variant="primary"
                        href={`/${item.job_id}`}
                        fontSize="heading-m"
                        onFollow={(event) => {
                          event.preventDefault();
                          navigate(`/${item.job_id}`);
                        }}
                      >
                        {item?.title || "Untitled"}
                      </Link>
                      {item.is_owner === false && <Badge color="blue">Shared</Badge>}
                    </SpaceBetween>
                  </Header>
                }
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      padding: "0 0 10px 0",
                    }}
                  >
                    <Box
                      variant="small"
                      color="text-body-secondary"
                      style={{
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item?.summary || "No summary available"}
                    </Box>
                  </div>

                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        width: "100%",
                      }}
                    >
                      <div>
                        <Box variant="awsui-key-label">Status</Box>
                        <StatusComponponent id={item?.job_id} />
                      </div>
                      <div>
                        <Box variant="awsui-key-label" textAlign="left">
                          Threats
                        </Box>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <SpaceBetween direction="horizontal" size="xs">
                            <Badge color="severity-high">
                              {item?.threat_list?.threats
                                ? item.threat_list.threats.filter(
                                    (threat) => threat.likelihood === "High"
                                  ).length || "-"
                                : "-"}
                            </Badge>
                            <Badge color="severity-medium">
                              {item?.threat_list?.threats
                                ? item.threat_list.threats.filter(
                                    (threat) => threat.likelihood === "Medium"
                                  ).length || "-"
                                : "-"}
                            </Badge>
                            <Badge color="severity-low">
                              {item?.threat_list?.threats
                                ? item.threat_list.threats.filter(
                                    (threat) => threat.likelihood === "Low"
                                  ).length || "-"
                                : "-"}
                            </Badge>
                          </SpaceBetween>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Container>
            )}
          </div>
        );
      })}
    </Grid>
  );

  return (
    <SpaceBetween size="s">
      <div style={{ marginTop: 20 }}>
        {loading ? (
          <SpaceBetween alignItems="center">
            <Spinner size="large" />
          </SpaceBetween>
        ) : results.length > 0 ? (
          <SpaceBetween size="l">
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <SegmentedControl
                selectedId={viewMode}
                onChange={({ detail }) => {
                  setViewMode(detail.selectedId);
                }}
                label="View mode"
                options={[
                  { text: "Card view", id: "card", iconName: "view-full" },
                  { text: "Table view", id: "table", iconName: "menu" },
                ]}
              />
            </div>

            {viewMode === "card" ? (
              <SpaceBetween size="m">
                {error && (
                  <Alert
                    type="error"
                    dismissible
                    onDismiss={() => setError(null)}
                    action={
                      <Button onClick={loadMore} disabled={pagination.loading}>
                        Retry
                      </Button>
                    }
                  >
                    {error}
                  </Alert>
                )}
                {batchLoadError && (
                  <Alert type="warning" dismissible onDismiss={() => setBatchLoadError(null)}>
                    {batchLoadError}
                  </Alert>
                )}
                {filteredResults.length > 0 ? (
                  <>
                    {renderCardView()}
                    {pagination.hasNextPage && filteredResults.length >= pagination.pageSize && (
                      <Box textAlign="center" margin={{ top: "l" }}>
                        <Button
                          onClick={loadMore}
                          loading={pagination.loading}
                          disabled={pagination.loading}
                        >
                          Load More
                        </Button>
                      </Box>
                    )}
                  </>
                ) : (
                  <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
                    <SpaceBetween size="m">
                      <b>No threat models match the selected filter</b>
                    </SpaceBetween>
                  </Box>
                )}
              </SpaceBetween>
            ) : (
              <ThreatCatalogTable
                results={results}
                onItemsChange={setResults}
                loading={loading}
                filterMode={filterMode}
                onFilterChange={setFilterMode}
                pagination={pagination}
                onLoadMore={loadMore}
                error={error}
              />
            )}
          </SpaceBetween>
        ) : (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <SpaceBetween size="m">
              <b>No threat model</b>
            </SpaceBetween>
          </Box>
        )}
      </div>
    </SpaceBetween>
  );
};
