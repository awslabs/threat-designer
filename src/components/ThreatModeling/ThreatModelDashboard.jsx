import React, { useMemo } from "react";
import Board from "@cloudscape-design/board-components/board";
import BoardItem from "@cloudscape-design/board-components/board-item";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  aggregateByStrideWithLikelihood,
  aggregateByLikelihood,
  aggregateByTargetWithLikelihood,
  aggregateBySource,
} from "./chartUtils";
import StrideChart from "./charts/StrideChart";
import LikelihoodChart from "./charts/LikelihoodChart";
import TargetAssetChart from "./charts/TargetAssetChart";
import ThreatSourceChart from "./charts/ThreatSourceChart";
import ChartErrorBoundary from "./charts/ChartErrorBoundary";

/**
 * ThreatModelDashboard Component
 *
 * Container component that displays statistical visualizations of threat model data.
 * Aggregates threat catalog data and renders multiple chart components showing
 * distributions across STRIDE categories, likelihood levels, target assets, and threat sources.
 *
 * Features:
 * - Responsive grid layout (2 columns desktop, 1 column mobile)
 * - Memoized data aggregation for performance
 * - Empty state handling for threat catalogs with no data
 * - Integration with Cloudscape Design System components
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.threatCatalogData - Array of threat objects from the threat model
 * @returns {JSX.Element} The rendered dashboard with statistical charts
 */
const ThreatModelDashboard = ({ threatCatalogData = [] }) => {
  // Validate input data and filter out malformed threat objects
  const validThreats = useMemo(() => {
    if (!Array.isArray(threatCatalogData)) {
      console.warn(
        "ThreatModelDashboard: threatCatalogData is not an array",
        typeof threatCatalogData
      );
      return [];
    }

    // Filter out null, undefined, or non-object threats
    const filtered = threatCatalogData.filter((threat) => {
      if (!threat || typeof threat !== "object") {
        console.warn("ThreatModelDashboard: Invalid threat object found", threat);
        return false;
      }
      return true;
    });

    if (filtered.length < threatCatalogData.length) {
      console.warn(
        `ThreatModelDashboard: Filtered out ${threatCatalogData.length - filtered.length} invalid threat(s)`
      );
    }

    return filtered;
  }, [threatCatalogData]);

  // Aggregate data for STRIDE category distribution with likelihood breakdown
  const strideDistribution = useMemo(() => {
    return aggregateByStrideWithLikelihood(validThreats);
  }, [validThreats]);

  // Aggregate data for likelihood level distribution
  const likelihoodDistribution = useMemo(() => {
    return aggregateByLikelihood(validThreats);
  }, [validThreats]);

  // Aggregate data for target asset distribution (top 10) with likelihood breakdown
  const targetDistribution = useMemo(() => {
    return aggregateByTargetWithLikelihood(validThreats);
  }, [validThreats]);

  // Aggregate data for threat source distribution
  const sourceDistribution = useMemo(() => {
    return aggregateBySource(validThreats);
  }, [validThreats]);

  // Calculate total threats
  const totalThreats = validThreats.length;

  // Handle empty threat catalog
  if (totalThreats === 0) {
    return (
      <Container>
        <Box textAlign="center" padding={{ vertical: "xxl" }}>
          <SpaceBetween size="m">
            <Box variant="h2" color="text-status-inactive">
              No Threat Data Available
            </Box>
            <Box variant="p" color="text-status-inactive">
              The dashboard will display statistical charts once threats have been identified in
              your threat model.
            </Box>
          </SpaceBetween>
        </Box>
      </Container>
    );
  }

  // LocalStorage key for persisting board layout
  const BOARD_LAYOUT_KEY = "threatModelDashboardLayout";

  // Default board items configuration
  // Board: 2 columns × 5 rows
  // Each chart: spans full width (2 columns) and full height (5 rows)
  // Charts are stacked vertically
  const getDefaultBoardItems = () => [
    {
      id: "stride-chart",
      rowSpan: 5,
      columnSpan: 2,
      data: { type: "stride" },
    },
    {
      id: "likelihood-chart",
      rowSpan: 5,
      columnSpan: 2,
      data: { type: "likelihood" },
    },
    {
      id: "target-chart",
      rowSpan: 5,
      columnSpan: 2,
      data: { type: "target" },
    },
    {
      id: "source-chart",
      rowSpan: 5,
      columnSpan: 2,
      data: { type: "source" },
    },
  ];

  // Load board layout from localStorage or use default
  const loadBoardLayout = () => {
    try {
      const saved = localStorage.getItem(BOARD_LAYOUT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that saved layout has all required items
        const defaultItems = getDefaultBoardItems();
        const hasAllItems = defaultItems.every((defaultItem) =>
          parsed.some((savedItem) => savedItem.id === defaultItem.id)
        );
        if (hasAllItems) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn("Failed to load board layout from localStorage:", error);
    }
    return getDefaultBoardItems();
  };

  // Board items configuration with localStorage persistence
  const [boardItems, setBoardItems] = React.useState(loadBoardLayout);

  // Handle board item changes (drag/resize) and save to localStorage
  const handleItemsChange = React.useCallback((event) => {
    const newItems = event.detail.items;
    setBoardItems(newItems);

    // Save to localStorage
    try {
      localStorage.setItem(BOARD_LAYOUT_KEY, JSON.stringify(newItems));
    } catch (error) {
      console.warn("Failed to save board layout to localStorage:", error);
    }
  }, []);

  return (
    <SpaceBetween size="l">
      {/* Dashboard Overview */}
      <Container>
        <SpaceBetween size="xs">
          <Header variant="h2">Threat Model Dashboard</Header>
          <Box variant="p" color="text-body-secondary">
            Statistical overview of {totalThreats} identified threat{totalThreats !== 1 ? "s" : ""}
          </Box>
        </SpaceBetween>
      </Container>

      {/* Board Layout for Charts */}
      <Board
        items={boardItems}
        onItemsChange={handleItemsChange}
        columnDefinition={[
          { id: "first", minWidth: 200 },
          { id: "second", minWidth: 200 },
        ]}
        renderItem={(item) => {
          switch (item.data.type) {
            case "stride":
              return (
                <BoardItem
                  header={<Header>Threats by STRIDE Category</Header>}
                  i18nStrings={{
                    dragHandleAriaLabel: "Drag handle",
                    resizeHandleAriaLabel: "Resize handle",
                  }}
                >
                  <ChartErrorBoundary chartName="Threats by STRIDE Category">
                    <StrideChart data={strideDistribution} />
                  </ChartErrorBoundary>
                </BoardItem>
              );
            case "likelihood":
              return (
                <BoardItem
                  header={<Header>Threats by Likelihood</Header>}
                  i18nStrings={{
                    dragHandleAriaLabel: "Drag handle",
                    resizeHandleAriaLabel: "Resize handle",
                  }}
                >
                  <ChartErrorBoundary chartName="Threats by Likelihood">
                    <LikelihoodChart data={likelihoodDistribution} />
                  </ChartErrorBoundary>
                </BoardItem>
              );
            case "target":
              return (
                <BoardItem
                  header={<Header>Threats by Target Asset</Header>}
                  i18nStrings={{
                    dragHandleAriaLabel: "Drag handle",
                    resizeHandleAriaLabel: "Resize handle",
                  }}
                >
                  <ChartErrorBoundary chartName="Threats by Target Asset">
                    <TargetAssetChart data={targetDistribution} />
                  </ChartErrorBoundary>
                </BoardItem>
              );
            case "source":
              return (
                <BoardItem
                  header={<Header>Threat Sources</Header>}
                  i18nStrings={{
                    dragHandleAriaLabel: "Drag handle",
                    resizeHandleAriaLabel: "Resize handle",
                  }}
                >
                  <ChartErrorBoundary chartName="Threat Sources">
                    <ThreatSourceChart data={sourceDistribution} />
                  </ChartErrorBoundary>
                </BoardItem>
              );
            default:
              return null;
          }
        }}
        i18nStrings={{
          liveAnnouncementDndStarted: (operationType) =>
            operationType === "resize" ? "Resizing" : "Dragging",
          liveAnnouncementDndItemReordered: (operation) =>
            `Item moved to position ${operation.placement.x + 1}, ${operation.placement.y + 1}.`,
          liveAnnouncementDndItemResized: (operation) =>
            `Item resized to ${operation.placement.width} columns and ${operation.placement.height} rows.`,
          liveAnnouncementDndCommitted: (operationType) => `${operationType} committed`,
          liveAnnouncementDndDiscarded: (operationType) => `${operationType} discarded`,
          liveAnnouncementItemRemoved: (op) => `Removed item ${op.item.id}.`,
          navigationAriaLabel: "Board navigation",
          navigationAriaDescription: "Click on non-empty item to move focus over",
          navigationItemAriaLabel: (item) => (item ? item.data.type : ""),
        }}
      />
    </SpaceBetween>
  );
};

/**
 * Custom comparison function for React.memo
 * Only re-render if the threatCatalogData prop has actually changed
 */
const arePropsEqual = (prevProps, nextProps) => {
  // Handle null/undefined cases
  if (!prevProps.threatCatalogData && !nextProps.threatCatalogData) {
    return true;
  }
  if (!prevProps.threatCatalogData || !nextProps.threatCatalogData) {
    return false;
  }

  // Shallow comparison of array length
  if (prevProps.threatCatalogData.length !== nextProps.threatCatalogData.length) {
    return false;
  }

  // Shallow comparison of array references
  // If the array reference is the same, no need to check contents
  if (prevProps.threatCatalogData === nextProps.threatCatalogData) {
    return true;
  }

  // Shallow comparison of threat objects by reference
  // This assumes threats are immutable and new objects are created on changes
  for (let i = 0; i < prevProps.threatCatalogData.length; i++) {
    if (prevProps.threatCatalogData[i] !== nextProps.threatCatalogData[i]) {
      return false;
    }
  }

  return true;
};

// Memoize the component with custom comparison to prevent unnecessary re-renders
export default React.memo(ThreatModelDashboard, arePropsEqual);
