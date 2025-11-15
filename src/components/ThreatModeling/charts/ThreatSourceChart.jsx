import React from "react";
import PieChart from "@cloudscape-design/components/pie-chart";
import Box from "@cloudscape-design/components/box";

/**
 * ThreatSourceChart Component
 *
 * Displays a donut chart showing the distribution of threat sources
 * (e.g., External Threat Actor, Malicious Internal Actor, etc.).
 * The center of the donut displays the total threat count.
 *
 * Features:
 * - Donut chart variant with center metric showing total threats
 * - Interactive tooltips with count and percentage on hover
 * - Legend showing all threat sources
 * - Empty state handling when no threat sources are identified
 * - Accessibility support with ARIA labels and descriptions
 * - Integration with Cloudscape Design System
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.data - Array of objects with source and count properties
 * @param {string} props.data[].source - Threat source name
 * @param {number} props.data[].count - Number of threats from this source
 * @returns {JSX.Element} The rendered threat source chart
 */
const ThreatSourceChart = ({ data = [] }) => {
  // Calculate total threats for center metric
  const totalThreats = data.reduce((sum, item) => sum + item.count, 0);

  // Transform data to PieChart format
  const chartData = data.map((item) => ({
    title: item.source,
    value: item.count,
  }));

  return (
    <PieChart
      data={chartData}
      variant="donut"
      size="medium"
      innerMetricValue={totalThreats.toString()}
      innerMetricDescription="Total Threats"
      empty={
        <Box textAlign="center" color="text-status-inactive" role="status" aria-live="polite">
          No threat sources identified
        </Box>
      }
      ariaLabel="Donut chart showing the distribution of threat sources"
      ariaDescription="Donut chart displaying the proportion of threats from different sources such as external threat actors, malicious internal actors, and other threat origins. The center shows the total number of threats. Hover over segments for detailed counts and percentages."
      legendTitle="Threat Sources"
      detailPopoverContent={(datum) => [
        { key: "Threats", value: datum.value },
        {
          key: "Percentage",
          value: `${((datum.value / totalThreats) * 100).toFixed(1)}%`,
        },
      ]}
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
      prevProps.data[i].source !== nextProps.data[i].source ||
      prevProps.data[i].count !== nextProps.data[i].count
    ) {
      return false;
    }
  }

  return true;
};

// Memoize the component with custom comparison to prevent unnecessary re-renders
export default React.memo(ThreatSourceChart, arePropsEqual);
