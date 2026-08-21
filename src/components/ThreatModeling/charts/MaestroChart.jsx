import React from "react";
import BarChart from "@cloudscape-design/components/bar-chart";
import Box from "@cloudscape-design/components/box";

/**
 * MaestroChart Component
 *
 * Displays a horizontal stacked bar chart showing the distribution of threats across
 * the eight CSA MAESTRO layers (Foundation Models, Data Operations, Agent Frameworks,
 * Deployment and Infrastructure, Evaluation and Observability, Security and Compliance,
 * Agent Ecosystem, Cross-Layer), broken down by likelihood level.
 *
 * Horizontal bars (unlike StrideChart's vertical layout) because MAESTRO layer names
 * run longer than STRIDE category names and don't fit legibly on a vertical axis.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.data - Object with categories array and series data
 * @param {Array} props.data.categories - Array of MAESTRO layer names
 * @param {Array} props.data.series - Array of series objects with likelihood data
 * @returns {JSX.Element} The rendered MAESTRO layer chart
 */
const MaestroChart = ({ data = { categories: [], series: [] } }) => {
  const { categories, series } = data;

  return (
    <BarChart
      series={series}
      xDomain={categories}
      yTitle="Number of Threats"
      xTitle="MAESTRO Layer"
      horizontalBars={true}
      stackedBars={true}
      empty={
        <Box textAlign="center" color="text-status-inactive" role="status" aria-live="polite">
          No threats categorized
        </Box>
      }
      ariaLabel="Stacked bar chart showing the distribution of threats across MAESTRO layers by likelihood"
      ariaDescription="Horizontal stacked bar chart displaying threat counts for each of the eight MAESTRO layers, broken down by likelihood level: High (red), Medium (orange), and Low (blue)"
      height={300}
      hideFilter
    />
  );
};

/**
 * Custom comparison function for React.memo.
 * data is {categories, series}, not an array, so compare the series contents directly
 * rather than treating it as an indexable array (see StrideChart.jsx for the bug this avoids).
 */
const arePropsEqual = (prevProps, nextProps) => {
  const prevData = prevProps.data;
  const nextData = nextProps.data;

  if (prevData === nextData) return true;
  if (!prevData || !nextData) return false;

  if (prevData.categories.length !== nextData.categories.length) return false;
  if (prevData.series.length !== nextData.series.length) return false;

  for (let i = 0; i < prevData.categories.length; i++) {
    if (prevData.categories[i] !== nextData.categories[i]) return false;
  }

  for (let i = 0; i < prevData.series.length; i++) {
    const prevSeries = prevData.series[i];
    const nextSeries = nextData.series[i];
    if (prevSeries.title !== nextSeries.title) return false;
    if (prevSeries.data.length !== nextSeries.data.length) return false;
    for (let j = 0; j < prevSeries.data.length; j++) {
      if (
        prevSeries.data[j].x !== nextSeries.data[j].x ||
        prevSeries.data[j].y !== nextSeries.data[j].y
      ) {
        return false;
      }
    }
  }

  return true;
};

// Memoize the component with custom comparison to prevent unnecessary re-renders
export default React.memo(MaestroChart, arePropsEqual);
