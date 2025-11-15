import React from "react";
import BarChart from "@cloudscape-design/components/bar-chart";
import Box from "@cloudscape-design/components/box";

/**
 * TargetAssetChart Component
 *
 * Displays a horizontal stacked bar chart showing which assets or services are most
 * frequently targeted by threats, broken down by likelihood level. The chart is sorted
 * by total threat count in descending order and limited to the top 10 targets.
 *
 * Features:
 * - Horizontal stacked bar chart showing likelihood breakdown
 * - Color-coded by likelihood: High (red), Medium (orange), Low (blue)
 * - Sorted by threat count (descending)
 * - Limited to top 10 targets to prevent overcrowding
 * - Empty state handling when no target assets are identified
 * - Accessibility support with ARIA labels
 * - Integration with Cloudscape Design System
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.data - Object with targets array and series data
 * @param {Array} props.data.targets - Array of target asset names (top 10)
 * @param {Array} props.data.series - Array of series objects with likelihood data
 * @returns {JSX.Element} The rendered target asset chart
 */
const TargetAssetChart = ({ data = { targets: [], series: [] } }) => {
  const { targets, series } = data;

  return (
    <BarChart
      series={series}
      xDomain={targets}
      yTitle="Number of Threats"
      xTitle="Target Asset"
      horizontalBars={true}
      stackedBars={true}
      empty={
        <Box textAlign="center" color="text-status-inactive" role="status" aria-live="polite">
          No target assets identified
        </Box>
      }
      ariaLabel="Stacked bar chart showing the top 10 most targeted assets by likelihood"
      ariaDescription="Horizontal stacked bar chart displaying the number of threats targeting each asset or service, broken down by likelihood level: High (red), Medium (orange), and Low (blue). Assets are sorted by total threat count in descending order."
      height={300}
      hideFilter
    />
  );
};

/**
 * Custom comparison function for React.memo
 * Only re-render if the data prop has actually changed
 */
const arePropsEqual = (prevProps, nextProps) => {
  // Shallow comparison of data array length
  if (prevProps.data.length !== nextProps.data.length) {
    return false;
  }

  // Shallow comparison of data array contents
  for (let i = 0; i < prevProps.data.length; i++) {
    if (
      prevProps.data[i].target !== nextProps.data[i].target ||
      prevProps.data[i].count !== nextProps.data[i].count
    ) {
      return false;
    }
  }

  return true;
};

// Memoize the component with custom comparison to prevent unnecessary re-renders
export default React.memo(TargetAssetChart, arePropsEqual);
