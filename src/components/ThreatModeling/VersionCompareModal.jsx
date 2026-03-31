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

const VersionCompareModal = ({ onDismiss, parentData, currentData }) => {
  const [activeTabId, setActiveTabId] = useState("overview");
  const { isDark } = useTheme();

  const cleanObject = (obj, type) => {
    if (!obj || typeof obj !== "object") return obj;
    const cleaned = { ...obj };
    Object.keys(cleaned).forEach((key) => {
      if (Array.isArray(cleaned[key]) && cleaned[key].length === 0) delete cleaned[key];
      if (cleaned[key] === null || cleaned[key] === undefined) delete cleaned[key];
    });
    if (type === "asset" || type === "dataflow" || type === "boundary" || type === "source") {
      delete cleaned.mitigations;
      delete cleaned.prerequisites;
    }
    return cleaned;
  };

  const getItemKey = (item, type) => {
    if (!item) return null;
    switch (type) {
      case "threats":
      case "assets":
        return item.name;
      case "flows":
        return `${item.source_entity || ""}→${item.target_entity || ""}`;
      case "boundaries":
        return `${item.source_entity || ""}→${item.target_entity || ""}`;
      case "sources":
        return item.category;
      default:
        return item.name || item.category || JSON.stringify(item);
    }
  };

  const getDisplayName = (item, type) => {
    if (type === "flows" || type === "boundaries") {
      return `${item.source_entity || "?"} → ${item.target_entity || "?"}`;
    }
    return item.name || item.category || "Item";
  };

  // Group-based array comparison that handles multiple items sharing the same key
  // (e.g. multiple data flows between the same entity pair)
  const compareArrays = (parentItems, currentItems, type) => {
    const parent = parentItems || [];
    const current = currentItems || [];
    const differences = [];
    const typeForClean =
      { assets: "asset", flows: "dataflow", boundaries: "boundary", sources: "source" }[type] ||
      "other";

    const parentGroups = new Map();
    parent.forEach((item) => {
      const key = getItemKey(item, type);
      if (!parentGroups.has(key)) parentGroups.set(key, []);
      parentGroups.get(key).push(item);
    });

    const currentGroups = new Map();
    current.forEach((item) => {
      const key = getItemKey(item, type);
      if (!currentGroups.has(key)) currentGroups.set(key, []);
      currentGroups.get(key).push(item);
    });

    const allKeys = new Set([...parentGroups.keys(), ...currentGroups.keys()]);
    let idx = 0;

    for (const key of allKeys) {
      const pGroup = parentGroups.get(key) || [];
      const cGroup = currentGroups.get(key) || [];
      const maxLen = Math.max(pGroup.length, cGroup.length);

      for (let i = 0; i < maxLen; i++) {
        if (i < pGroup.length && i < cGroup.length) {
          const cleanedParent = cleanObject(pGroup[i], typeForClean);
          const cleanedCurrent = cleanObject(cGroup[i], typeForClean);
          if (JSON.stringify(cleanedParent) !== JSON.stringify(cleanedCurrent)) {
            differences.push({
              type: "modified",
              parent: cleanedParent,
              current: cleanedCurrent,
              index: idx++,
            });
          }
        } else if (i >= pGroup.length) {
          differences.push({
            type: "added",
            item: cleanObject(cGroup[i], typeForClean),
            index: idx++,
          });
        } else {
          differences.push({
            type: "deleted",
            item: cleanObject(pGroup[i], typeForClean),
            index: idx++,
          });
        }
      }
    }

    return differences;
  };

  // Early return — must be after all hooks (useState, useTheme) but before render.
  // No useMemo: updateThreatModeling shallow-copies response so response.item is
  // the same reference after edits, which would make useMemo stale. Computing
  // directly here is cheap and only runs when the modal is visible.
  if (!parentData || !currentData) return null;

  const threatDiffs = compareArrays(
    parentData.threat_list?.threats,
    currentData.threat_list?.threats,
    "threats"
  );
  const assetDiffs = compareArrays(parentData.assets?.assets, currentData.assets?.assets, "assets");
  const flowDiffs = compareArrays(
    parentData.system_architecture?.data_flows,
    currentData.system_architecture?.data_flows,
    "flows"
  );
  const boundaryDiffs = compareArrays(
    parentData.system_architecture?.trust_boundaries,
    currentData.system_architecture?.trust_boundaries,
    "boundaries"
  );
  const sourceDiffs = compareArrays(
    parentData.system_architecture?.threat_sources,
    currentData.system_architecture?.threat_sources,
    "sources"
  );

  const parentAssumptions = parentData.assumptions || [];
  const currentAssumptions = currentData.assumptions || [];
  const assumptionDiffs = [];
  currentAssumptions.forEach((a, i) => {
    if (!parentAssumptions.includes(a)) assumptionDiffs.push({ type: "added", item: a, index: i });
  });
  parentAssumptions.forEach((a, i) => {
    if (!currentAssumptions.includes(a))
      assumptionDiffs.push({ type: "deleted", item: a, index: i });
  });

  const parentDescription = (parentData.description || "").trim();
  const currentDescription = (currentData.description || "").trim();
  const descriptionChanged = parentDescription !== currentDescription;

  const totalDifferences =
    threatDiffs.length +
    assetDiffs.length +
    flowDiffs.length +
    boundaryDiffs.length +
    sourceDiffs.length +
    assumptionDiffs.length +
    (descriptionChanged ? 1 : 0);

  const diffStyles = {
    variables: {
      dark: {
        diffViewerBackground: "#1D1D20",
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
        diffViewerBackground: "#F5F5F4",
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
    line: { fontSize: "12px", lineHeight: "18px" },
    titleBlock: { display: "none" },
  };

  const renderDiffItem = (diff, type) => {
    const displayName =
      diff.type === "modified"
        ? getDisplayName(diff.current, type)
        : getDisplayName(diff.item, type);

    if (diff.type === "added") {
      return (
        <Box key={`added-${diff.index}`}>
          <Box color="text-status-success" margin={{ bottom: "xs" }}>
            <strong>+ Added:</strong> {displayName}
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
            <strong>- Removed:</strong> {displayName}
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
            <strong>~ Modified:</strong> {displayName}
          </Box>
          <ColumnLayout columns={2} variant="text-grid">
            <Box>
              <Box variant="awsui-key-label" margin={{ bottom: "xxs" }}>
                Parent
              </Box>
            </Box>
            <Box>
              <Box variant="awsui-key-label" margin={{ bottom: "xxs" }}>
                Current
              </Box>
            </Box>
          </ColumnLayout>
          <ReactDiffViewer
            oldValue={JSON.stringify(diff.parent, null, 2)}
            newValue={JSON.stringify(diff.current, null, 2)}
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
    return null;
  };

  const getCounts = (diffs) => ({
    added: diffs.filter((d) => d.type === "added").length,
    modified: diffs.filter((d) => d.type === "modified").length,
    deleted: diffs.filter((d) => d.type === "deleted").length,
  });

  const renderDiffSection = (title, diffs, type) => {
    if (diffs.length === 0) return null;
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
        <SpaceBetween size="s">{diffs.map((diff) => renderDiffItem(diff, type))}</SpaceBetween>
      </ExpandableSection>
    );
  };

  const renderAssumptionDiffs = () => {
    if (assumptionDiffs.length === 0) return null;
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
                  <strong>- Removed:</strong> {diff.item}
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
    if (!descriptionChanged) return null;
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
              Parent
            </Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label" margin={{ bottom: "xxs" }}>
              Current
            </Box>
          </Box>
        </ColumnLayout>
        <ReactDiffViewer
          oldValue={parentDescription}
          newValue={currentDescription}
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

  const sectionSummary = [
    { name: "Assets", diffs: assetDiffs },
    { name: "Data Flows", diffs: flowDiffs },
    { name: "Trust Boundaries", diffs: boundaryDiffs },
    { name: "Threat Sources", diffs: sourceDiffs },
    { name: "Threats", diffs: threatDiffs },
    { name: "Assumptions", diffs: assumptionDiffs },
  ]
    .filter((s) => s.diffs.length > 0)
    .map((s) => ({ name: s.name, ...getCounts(s.diffs) }));

  return (
    <Modal
      onDismiss={onDismiss}
      visible={true}
      size="max"
      header="Version comparison"
      footer={
        <Box float="right">
          <Button variant="primary" onClick={onDismiss}>
            Close
          </Button>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Alert type="info">
          Comparison between the parent threat model and the current version showing what the
          version workflow changed.
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
                    <ColumnLayout columns={3} variant="text-grid">
                      <div>
                        <Box variant="awsui-key-label">Parent</Box>
                        <div>{parentData.title || "Untitled"}</div>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">Current</Box>
                        <div>{currentData.title || "Untitled"}</div>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">Total changes</Box>
                        <div>{totalDifferences}</div>
                      </div>
                    </ColumnLayout>
                  </Container>

                  {totalDifferences === 0 ? (
                    <Alert type="success">
                      No differences found. The version is identical to the parent.
                    </Alert>
                  ) : (
                    <Container header={<Box variant="awsui-key-label">Changes by section</Box>}>
                      <SpaceBetween size="xs">
                        {descriptionChanged && (
                          <SpaceBetween direction="horizontal" size="xs">
                            <span>Description:</span>
                            <Badge color="blue">~1</Badge>
                          </SpaceBetween>
                        )}
                        {sectionSummary.map((s) => (
                          <SpaceBetween direction="horizontal" size="xs" key={s.name}>
                            <span>{s.name}:</span>
                            {s.added > 0 && <Badge color="green">+{s.added}</Badge>}
                            {s.modified > 0 && <Badge color="blue">~{s.modified}</Badge>}
                            {s.deleted > 0 && <Badge color="red">-{s.deleted}</Badge>}
                          </SpaceBetween>
                        ))}
                      </SpaceBetween>
                    </Container>
                  )}
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
                  {renderDiffSection("Assets", assetDiffs, "assets")}
                  {renderDiffSection("Data Flows", flowDiffs, "flows")}
                  {renderDiffSection("Trust Boundaries", boundaryDiffs, "boundaries")}
                  {renderDiffSection("Threat Sources", sourceDiffs, "sources")}
                  {renderDiffSection("Threats", threatDiffs, "threats")}
                  {totalDifferences === 0 && <Alert type="info">No differences detected.</Alert>}
                </SpaceBetween>
              ),
            },
          ]}
        />
      </SpaceBetween>
    </Modal>
  );
};

export default VersionCompareModal;
