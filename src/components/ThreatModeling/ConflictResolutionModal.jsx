import React, { useState } from "react";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Alert from "@cloudscape-design/components/alert";
import Tabs from "@cloudscape-design/components/tabs";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Badge from "@cloudscape-design/components/badge";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import ReactDiffViewer from "react-diff-viewer-continued";
import { useTheme } from "../ThemeContext";

const ConflictResolutionModal = ({
  visible,
  onDismiss,
  conflictData,
  localChanges,
  onOverride,
  onReload,
}) => {
  const [activeTabId, setActiveTabId] = useState("overview");
  const [loading, setLoading] = useState(false);
  const { isDark } = useTheme();

  if (!conflictData || !localChanges) {
    return null;
  }

  const serverState = conflictData.server_state;

  // Helper to clean up objects by removing empty arrays and unwanted fields
  const cleanObject = (obj, type) => {
    if (!obj || typeof obj !== "object") return obj;

    const cleaned = { ...obj };

    // Remove empty arrays and null values
    Object.keys(cleaned).forEach((key) => {
      if (Array.isArray(cleaned[key]) && cleaned[key].length === 0) {
        delete cleaned[key];
      }
      if (cleaned[key] === null || cleaned[key] === undefined) {
        delete cleaned[key];
      }
    });

    // Remove fields that don't belong to certain types
    if (type === "asset" || type === "dataflow" || type === "boundary" || type === "source") {
      delete cleaned.mitigations;
      delete cleaned.prerequisites;
    }

    return cleaned;
  };

  const handleOverride = async () => {
    setLoading(true);
    try {
      await onOverride();
      onDismiss();
    } catch (error) {
      console.error("Error overriding changes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    setLoading(true);
    try {
      await onReload();
      onDismiss();
    } catch (error) {
      console.error("Error reloading:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get unique identifier for an item based on type
  const getItemId = (item, type) => {
    if (!item) return null;

    switch (type) {
      case "threats":
        return item.name;
      case "assets":
        return item.name;
      case "flows":
        // Data flows use combination of source, target, and description for uniqueness
        // This handles cases where multiple flows exist between the same entities
        // Normalize whitespace and handle undefined values
        const flowDesc = (item.flow_description || "").trim();
        return `${item.source_entity || ""}→${item.target_entity || ""}::${flowDesc}`;
      case "boundaries":
        // Trust boundaries also use source and target like data flows
        return `${item.source_entity}→${item.target_entity}`;
      case "sources":
        return item.category;
      default:
        return item.name || item.category || item.id || JSON.stringify(item);
    }
  };

  // Helper function to compare arrays with identifier-based matching
  const compareArrays = (local, server, key) => {
    const localItems = local || [];
    const serverItems = server || [];

    const differences = [];
    const processedServer = new Set();

    // Determine object type for cleaning
    const typeMap = {
      assets: "asset",
      flows: "dataflow",
      boundaries: "boundary",
      sources: "source",
    };
    const objectType = typeMap[key] || "other";

    // First pass: Try to match items by their identifier
    localItems.forEach((localItem, localIndex) => {
      const localId = getItemId(localItem, key);
      const cleanedLocal = cleanObject(localItem, objectType);

      // Try to find matching server item by ID
      const serverIndex = serverItems.findIndex((s) => getItemId(s, key) === localId);

      if (serverIndex !== -1) {
        // Found a match - check if it's modified
        const serverItem = serverItems[serverIndex];
        const cleanedServer = cleanObject(serverItem, objectType);
        processedServer.add(serverIndex);

        if (JSON.stringify(cleanedLocal) !== JSON.stringify(cleanedServer)) {
          differences.push({
            type: "modified",
            local: cleanedLocal,
            server: cleanedServer,
            index: localIndex,
          });
        }
      } else {
        // No match found - it's added
        differences.push({
          type: "added",
          item: cleanedLocal,
          index: localIndex,
        });
      }
    });

    // Second pass: Find deleted items (in server but not in local)
    serverItems.forEach((serverItem, serverIndex) => {
      if (!processedServer.has(serverIndex)) {
        differences.push({
          type: "deleted",
          item: cleanObject(serverItem, objectType),
          index: serverIndex,
        });
      }
    });

    return differences;
  };

  // Compare threats
  const threatDiffs = compareArrays(
    localChanges.threat_list?.threats,
    serverState.threat_list?.threats,
    "threats"
  );

  // Compare assets
  const assetDiffs = compareArrays(
    localChanges.assets?.assets,
    serverState.assets?.assets,
    "assets"
  );

  // Compare data flows
  const flowDiffs = compareArrays(
    localChanges.system_architecture?.data_flows,
    serverState.system_architecture?.data_flows,
    "flows"
  );

  // Compare trust boundaries
  const boundaryDiffs = compareArrays(
    localChanges.system_architecture?.trust_boundaries,
    serverState.system_architecture?.trust_boundaries,
    "boundaries"
  );

  // Compare threat sources
  const sourceDiffs = compareArrays(
    localChanges.system_architecture?.threat_sources,
    serverState.system_architecture?.threat_sources,
    "sources"
  );

  // Compare assumptions (array of strings)
  const compareAssumptions = () => {
    const localAssumptions = localChanges.assumptions || [];
    const serverAssumptions = serverState.assumptions || [];

    const differences = [];

    // Find added assumptions
    localAssumptions.forEach((assumption, index) => {
      if (!serverAssumptions.includes(assumption)) {
        differences.push({ type: "added", item: assumption, index });
      }
    });

    // Find deleted assumptions
    serverAssumptions.forEach((assumption, index) => {
      if (!localAssumptions.includes(assumption)) {
        differences.push({ type: "deleted", item: assumption, index });
      }
    });

    return differences;
  };

  const assumptionDiffs = compareAssumptions();

  // Compare description (simple string comparison)
  const descriptionChanged = localChanges.description !== serverState.description;

  const totalDifferences =
    threatDiffs.length +
    assetDiffs.length +
    flowDiffs.length +
    boundaryDiffs.length +
    sourceDiffs.length +
    assumptionDiffs.length +
    (descriptionChanged ? 1 : 0);

  const renderDiffItem = (diff) => {
    const getDisplayName = (item) => {
      return item.name || item.category || item.id || "Item";
    };

    if (diff.type === "added") {
      return (
        <Box key={`added-${diff.index}`}>
          <Box color="text-status-success" margin={{ bottom: "xs" }}>
            <strong>+ Added:</strong> {getDisplayName(diff.item)}
          </Box>
          <ReactDiffViewer
            oldValue=""
            newValue={JSON.stringify(diff.item, null, 2)}
            splitView={false}
            hideLineNumbers={true}
            showDiffOnly={false}
            useDarkTheme={isDark}
            styles={diffStyles}
            disableWordDiff={true}
            leftTitle=""
            rightTitle=""
          />
        </Box>
      );
    } else if (diff.type === "deleted") {
      return (
        <Box key={`deleted-${diff.index}`}>
          <Box color="text-status-error" margin={{ bottom: "xs" }}>
            <strong>- Deleted:</strong> {getDisplayName(diff.item)}
          </Box>
          <ReactDiffViewer
            oldValue={JSON.stringify(diff.item, null, 2)}
            newValue=""
            splitView={false}
            hideLineNumbers={true}
            showDiffOnly={false}
            useDarkTheme={isDark}
            styles={diffStyles}
            disableWordDiff={true}
            leftTitle=""
            rightTitle=""
          />
        </Box>
      );
    } else if (diff.type === "modified") {
      return (
        <Box key={`modified-${diff.index}`}>
          <Box margin={{ bottom: "xs" }}>
            <strong>~ Modified:</strong> {getDisplayName(diff.local)}
          </Box>
          <ColumnLayout columns={2} variant="text-grid">
            <Box>
              <Box variant="awsui-key-label" margin={{ bottom: "xxs" }}>
                Server Version
              </Box>
            </Box>
            <Box>
              <Box variant="awsui-key-label" margin={{ bottom: "xxs" }}>
                Your Version
              </Box>
            </Box>
          </ColumnLayout>
          <ReactDiffViewer
            oldValue={JSON.stringify(diff.server, null, 2)}
            newValue={JSON.stringify(diff.local, null, 2)}
            splitView={true}
            hideLineNumbers={true}
            showDiffOnly={true}
            leftTitle=""
            rightTitle=""
            useDarkTheme={isDark}
            styles={diffStyles}
            disableWordDiff={true}
          />
        </Box>
      );
    }
  };

  const getCounts = (diffs) => {
    const added = diffs.filter((d) => d.type === "added").length;
    const modified = diffs.filter((d) => d.type === "modified").length;
    const deleted = diffs.filter((d) => d.type === "deleted").length;
    return { added, modified, deleted };
  };

  const renderDiffSection = (title, diffs) => {
    if (diffs.length === 0) {
      return null;
    }

    const counts = getCounts(diffs);

    return (
      <ExpandableSection
        defaultExpanded={false}
        headerText={
          <SpaceBetween direction="horizontal" size="xs">
            <span>{title}</span>
            {counts.added > 0 && <Badge color="green">+{counts.added}</Badge>}
            {counts.modified > 0 && <Badge color="blue">~{counts.modified}</Badge>}
            {counts.deleted > 0 && <Badge color="red">-{counts.deleted}</Badge>}
          </SpaceBetween>
        }
      >
        <SpaceBetween size="s">{diffs.map(renderDiffItem)}</SpaceBetween>
      </ExpandableSection>
    );
  };

  const renderAssumptionDiffs = () => {
    if (assumptionDiffs.length === 0) {
      return null;
    }

    const counts = getCounts(assumptionDiffs);

    return (
      <ExpandableSection
        defaultExpanded={false}
        headerText={
          <SpaceBetween direction="horizontal" size="xs">
            <span>Assumptions</span>
            {counts.added > 0 && <Badge color="green">+{counts.added}</Badge>}
            {counts.deleted > 0 && <Badge color="red">-{counts.deleted}</Badge>}
          </SpaceBetween>
        }
      >
        <SpaceBetween size="s">
          {assumptionDiffs.map((diff, idx) => {
            if (diff.type === "added") {
              return (
                <Box color="text-status-success" key={`added-${idx}`}>
                  <strong>+ Added:</strong> {diff.item}
                </Box>
              );
            } else if (diff.type === "deleted") {
              return (
                <Box color="text-status-error" key={`deleted-${idx}`}>
                  <strong>- Deleted:</strong> {diff.item}
                </Box>
              );
            }
            return null;
          })}
        </SpaceBetween>
      </ExpandableSection>
    );
  };

  const renderDescriptionDiff = () => {
    if (!descriptionChanged) {
      return null;
    }

    return (
      <ExpandableSection
        defaultExpanded={false}
        headerText={
          <SpaceBetween direction="horizontal" size="xs">
            <span>Description</span>
            <Badge color="blue">~1</Badge>
          </SpaceBetween>
        }
      >
        <ColumnLayout columns={2} variant="text-grid">
          <Box>
            <Box variant="awsui-key-label" margin={{ bottom: "xxs" }}>
              Server Version
            </Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label" margin={{ bottom: "xxs" }}>
              Your Version
            </Box>
          </Box>
        </ColumnLayout>
        <ReactDiffViewer
          oldValue={serverState.description || ""}
          newValue={localChanges.description || ""}
          splitView={true}
          hideLineNumbers={true}
          showDiffOnly={false}
          leftTitle=""
          rightTitle=""
          useDarkTheme={isDark}
          styles={diffStyles}
          disableWordDiff={true}
        />
      </ExpandableSection>
    );
  };

  // Custom styles for diff viewer to match CloudScape theme
  const diffStyles = {
    variables: {
      dark: {
        diffViewerBackground: "#1D1D20", // Match CloudScape container
        diffViewerColor: "#FFFFFF",
        addedBackground: "#1a3d2e",
        addedColor: "#FFFFFF",
        removedBackground: "#3d1a1a",
        removedColor: "#FFFFFF",
        wordAddedBackground: "#2d5a45",
        wordRemovedBackground: "#5a2d2d",
        addedGutterBackground: "#1a3d2e",
        removedGutterBackground: "#3d1a1a",
        gutterBackground: "#1D1D20",
        gutterBackgroundDark: "#1D1D20",
        highlightBackground: "#2d3748",
        highlightGutterBackground: "#1D1D20",
      },
      light: {
        diffViewerBackground: "#F5F5F4", // Match CloudScape container
        diffViewerColor: "#101828",
        addedBackground: "#e6ffec",
        addedColor: "#101828",
        removedBackground: "#ffebe9",
        removedColor: "#101828",
        wordAddedBackground: "#acf2bd",
        wordRemovedBackground: "#fdb8c0",
        addedGutterBackground: "#cdffd8",
        removedGutterBackground: "#ffdce0",
        gutterBackground: "#F5F5F4",
        gutterBackgroundDark: "#F5F5F4",
        highlightBackground: "#fffbdd",
        highlightGutterBackground: "#F5F5F4",
      },
    },
    line: {
      fontSize: "12px", // Smaller text
      lineHeight: "18px",
    },
    titleBlock: {
      display: "none", // Hide "Server Version" and "Your Version" titles
    },
  };

  return (
    <Modal
      onDismiss={onDismiss}
      visible={visible}
      size="max"
      header="Conflict Detected"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss} ariaLabel="Cancel conflict resolution">
              Cancel
            </Button>
            <Button
              variant="normal"
              onClick={handleReload}
              loading={loading}
              ariaLabel="Use server version and discard local changes"
            >
              Use Server Version
            </Button>
            <Button
              variant="primary"
              onClick={handleOverride}
              loading={loading}
              ariaLabel="Use my version and overwrite server changes"
            >
              Use My Version
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Alert type="warning" header="Conflict detected">
          The threat model has been modified by another user since you last loaded it. You can
          review the differences below and choose how to proceed.
        </Alert>

        <Tabs
          activeTabId={activeTabId}
          onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <SpaceBetween size="m">
                  <Container>
                    <ColumnLayout columns={2} variant="text-grid">
                      <div>
                        <Box variant="awsui-key-label">Server Timestamp</Box>
                        <div>{new Date(conflictData.server_timestamp).toLocaleString()}</div>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">Your Timestamp</Box>
                        <div>{new Date(conflictData.client_timestamp).toLocaleString()}</div>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">Last Modified By</Box>
                        <div>{serverState.last_modified_by || "Unknown"}</div>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">Total Differences</Box>
                        <div>{totalDifferences}</div>
                      </div>
                    </ColumnLayout>
                  </Container>

                  <Alert type="info">
                    <strong>What should I do?</strong>
                    <ul>
                      <li>
                        <strong>Use Server Version:</strong> Discard your changes and use the latest
                        version from the server
                      </li>
                      <li>
                        <strong>Use My Version:</strong> Keep your changes and overwrite the server
                        version (this will discard the other user's changes)
                      </li>
                    </ul>
                  </Alert>
                </SpaceBetween>
              ),
            },
            {
              id: "differences",
              label: `Differences (${totalDifferences})`,
              content: (
                <SpaceBetween size="m">
                  {renderDescriptionDiff()}
                  {renderAssumptionDiffs()}
                  {renderDiffSection("Threats", threatDiffs)}
                  {renderDiffSection("Assets", assetDiffs)}
                  {renderDiffSection("Data Flows", flowDiffs)}
                  {renderDiffSection("Trust Boundaries", boundaryDiffs)}
                  {renderDiffSection("Threat Sources", sourceDiffs)}

                  {totalDifferences === 0 && (
                    <Alert type="info">No differences detected in the main data structures.</Alert>
                  )}
                </SpaceBetween>
              ),
            },
          ]}
        />
      </SpaceBetween>
    </Modal>
  );
};

export default ConflictResolutionModal;
