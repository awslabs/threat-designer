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
import {
  getThreatModelingStatus,
  getThreatModelingAllResults,
  deleteTm,
} from "../../services/ThreatDesigner/stats";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import ThreatCatalogTable from "./ThreatCatalogTable";
import { ChatSessionFunctionsContext } from "../Agent/ChatContext";

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

  const [viewMode, setViewMode] = useState(() => {
    try {
      const savedViewMode = localStorage.getItem("threatCatalogViewMode");
      return savedViewMode && ["card", "table"].includes(savedViewMode) ? savedViewMode : "card";
    } catch (error) {
      console.error("Error reading from localStorage:", error);
      return "card";
    }
  });

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

  useEffect(() => {
    setLoading(true);
    const fetchAllResults = async () => {
      try {
        const results = await getThreatModelingAllResults();
        const sortedCatalogs = results?.data?.catalogs.sort((a, b) => {
          if (!a.timestamp && !b.timestamp) return 0;
          if (!a.timestamp) return 1;
          if (!b.timestamp) return -1;

          return new Date(b.timestamp) - new Date(a.timestamp);
        });
        setResults(sortedCatalogs);
      } catch (error) {
        setResults([]);
        console.error("Error getting threat modeling results:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllResults();
  }, [user]);

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

  const createGridDefinition = () => {
    const gridDefinition = [];
    results.forEach(() => {
      gridDefinition.push({
        colspan: { default: 12, xxs: 12, xs: 12, s: 12, m: 6, l: 6, xl: 6 },
      });
    });
    return gridDefinition;
  };

  const renderCardView = () => (
    <Grid gridDefinition={createGridDefinition()}>
      {results.map((item) => (
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
                content: <S3DownloaderComponent fileName={item?.s3_location} />,
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
                      items={[{ id: "delete", text: "Delete", disabled: false }]}
                      variant="icon"
                    />
                  }
                  style={{ width: "100%", overflow: "hidden" }}
                >
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
      ))}
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

            {viewMode === "card" ? (
              renderCardView()
            ) : (
              <ThreatCatalogTable results={results} onItemsChange={setResults} loading={loading} />
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
