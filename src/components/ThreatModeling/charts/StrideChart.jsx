import React from "react";
import BarChart from "@cloudscape-design/components/bar-chart";
import Box from "@cloudscape-design/components/box";

/**
 * StrideChart Component
 *
 * Displays a vertical stacked bar chart showing the distribution of threats across
 * the six STRIDE categories (Spoofing, Tampering, Repudiation, Information Disclosure,
 * Denial of Service, and Elevation of Privilege), broken down by likelihood level.
 *
 * Features:
 * - Vertical stacked bar chart showing likelihood breakdown
 * - Color-coded by likelihood: High (red), Medium (orange), Low (blue)
 * - Empty state handling when no threats are categorized
 * - Accessibility support with ARIA labels
 * - Integration with Cloudscape Design System
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.data - Object with categories array and series data
 * @param {Array} props.data.categories - Array of STRIDE category names
 * @param {Array} props.data.series - Array of series objects with likelihood data
 * @returns {JSX.Element} The rendered STRIDE category chart
 */
const StrideChart = ({ data = { categories: [], series: [] } }) => {
  const { categories, series } = data;

  return (
    <BarChart
      series={series}
      xDomain={categories}
      yTitle="Number of Threats"
      xTitle="STRIDE Category"
      horizontalBars={false}
      stackedBars={true}
      empty={
        <Box textAlign="center" color="text-status-inactive" role="status" aria-live="polite">
          No threats categorized
        </Box>
      }
      ariaLabel="Stacked bar chart showing the distribution of threats across STRIDE categories by likelihood"
      ariaDescription="Vertical stacked bar chart displaying threat counts for each of the six STRIDE categories, broken down by likelihood level: High (red), Medium (orange), and Low (blue)"
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
      prevProps.data[i].category !== nextProps.data[i].category ||
      prevProps.data[i].count !== nextProps.data[i].count
    ) {
      return false;
    }
  }

  return true;
};

// Memoize the component with custom comparison to prevent unnecessary re-renders
export default React.memo(StrideChart, arePropsEqual);
