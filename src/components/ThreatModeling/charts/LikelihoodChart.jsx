import React from "react";
import PieChart from "@cloudscape-design/components/pie-chart";
import Box from "@cloudscape-design/components/box";

/**
 * LikelihoodChart Component
 *
 * Displays a pie chart showing the distribution of threats across
 * likelihood levels (High, Medium, Low) with custom color coding.
 *
 * Features:
 * - Pie chart with color-coded segments (High, Medium, Low)
 * - Custom color coding: High (#D91515), Medium (#FF9900), Low (#0972D3)
 * - Interactive tooltips with count and percentage
 * - Empty state handling when no threats are assessed
 * - Accessibility support with ARIA labels
 * - Integration with Cloudscape Design System
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.data - Array of objects with level and count properties
 * @param {string} props.data[].level - Likelihood level (High, Medium, or Low)
 * @param {number} props.data[].count - Number of threats at this likelihood level
 * @returns {JSX.Element} The rendered likelihood distribution chart
 */
const LikelihoodChart = ({ data = [] }) => {
  // Define color mapping for each likelihood level
  // Using colors that match the Badge severity colors
  const colorMap = {
    High: "#ba2e0f", // Red (colorChartsStatusHigh)
    Medium: "#cc5f21", // Orange (colorChartsStatusMedium)
    Low: "#F2CD54", // Yellow (matching severity-low badge)
    "Not Assessed": "#8c8c94", // Gray (colorChartsStatusNeutral)
  };

  // Calculate total threats for percentage calculation
  const totalThreats = data.reduce((sum, item) => sum + item.count, 0);

  // Transform data to PieChart format with custom colors
  const chartData = data
    .filter((item) => item.count > 0) // Only show levels with threats
    .map((item) => ({
      title: item.level,
      value: item.count,
      color: colorMap[item.level],
    }));

  return (
    <PieChart
      data={chartData}
      size="medium"
      empty={
        <Box textAlign="center" color="text-status-inactive" role="status" aria-live="polite">
          No threats assessed
        </Box>
      }
      ariaLabel="Pie chart showing the distribution of threats by likelihood level"
      ariaDescription="Pie chart displaying threat counts for likelihood levels: High (red), Medium (orange), and Low (blue). Each segment represents the proportion of threats at that likelihood level."
      legendTitle="Likelihood Levels"
      detailPopoverContent={(datum) => [
        { key: "Threats", value: datum.value },
        {
          key: "Percentage",
          value: `${((datum.value / totalThreats) * 100).toFixed(1)}%`,
        },
      ]}
      hideFilter
      segmentDescription={(datum, sum) =>
        `${datum.value} threats, ${((datum.value / sum) * 100).toFixed(0)}%`
      }
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
      prevProps.data[i].level !== nextProps.data[i].level ||
      prevProps.data[i].count !== nextProps.data[i].count
    ) {
      return false;
    }
  }

  return true;
};

// Memoize the component with custom comparison to prevent unnecessary re-renders
export default React.memo(LikelihoodChart, arePropsEqual);
