import React, { useState, useEffect } from "react";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { Cards, Link } from "@cloudscape-design/components";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import { useNavigate } from "react-router";
import { S3DownloaderComponent } from "./S3Downloader";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { Spinner, ButtonDropdown } from "@cloudscape-design/components";
import {
  getThreatModelingStatus,
  getThreatModelingAllResults,
  deleteTm,
} from "../../services/ThreatDesigner/stats";

const StatusIndicatorComponent = ({ status }) => {
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
          <div style={{ marginTop: "20px" }}>
            <Spinner />
          </div>
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

  const removeItem = (idToRemove) => {
    setResults(results.filter((item) => item.job_id !== idToRemove));
  };

  useEffect(() => {
    setLoading(true);
    const fetchAllResults = async () => {
      try {
        const results = await getThreatModelingAllResults();
        const sortedCatalogs = results?.data?.catalogs.sort((a, b) => {
          // Check if timestamp exists for both items
          if (!a.timestamp && !b.timestamp) return 0;
          if (!a.timestamp) return 1; // Push items without timestamp to the end
          if (!b.timestamp) return -1; // Push items without timestamp to the end

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

  const navigate = useNavigate();

  const onBreadcrumbsClick = (e) => {
    e.preventDefault();
    navigate(e.detail.href);
  };

  const handleDelete = async (id) => {
    console.log(id);
    try {
      const results = await deleteTm(id);
      removeItem(id);
    } catch (error) {
      console.error("Error deleting threat model:", error);
    }
  };

  return (
    <SpaceBetween size="s">
      <Header variant="h1">Threat Catalog</Header>
      <div style={{ marginTop: 20 }}>
        {loading ? (
          <SpaceBetween alignItems="center">
            <Spinner size="large" />
          </SpaceBetween>
        ) : (
          <Cards
            cardDefinition={{
              header: (item) => {
                const jobId = item?.job_id;
                return (
                  <Header
                    variant="h2"
                    actions={
                      <ButtonDropdown
                        onItemClick={(itemClickDetails) => {
                          if (itemClickDetails.detail.id === "delete") {
                            handleDelete(jobId);
                          }
                        }}
                        items={[{ id: "delete", text: "Delete", disabled: false }]}
                        variant="icon"
                      />
                    }
                  >
                    <Link fontSize="heading-m" onFollow={() => navigate(`/${item?.job_id}`)}>
                      {item?.title}
                    </Link>
                  </Header>
                );
              },
              sections: [
                {
                  id: "image",
                  content: (item) => <S3DownloaderComponent fileName={item?.s3_location} />,
                },
                {
                  id: "status",
                  header: "Status",
                  content: (item) => <StatusComponponent id={item?.job_id} />,
                },
              ],
            }}
            cardsPerRow={[
              { cards: 1, minWidth: 300 },
              { cards: 2, minWidth: 650 },
              { cards: 3, minWidth: 1000 },
              { minWidth: 1300, cards: 4 },
            ]}
            items={results}
            loadingText="Loading catalog"
            trackBy="id"
            visibleSections={["image", "status"]}
            empty={
              <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
                <SpaceBetween size="m">
                  <b>No threat model</b>
                </SpaceBetween>
              </Box>
            }
          />
        )}
      </div>
    </SpaceBetween>
  );
};
