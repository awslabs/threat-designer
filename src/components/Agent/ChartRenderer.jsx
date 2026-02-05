import { memo, useMemo } from "react";
import BarChart from "@cloudscape-design/components/bar-chart";
import PieChart from "@cloudscape-design/components/pie-chart";
import LineChart from "@cloudscape-design/components/line-chart";
import Box from "@cloudscape-design/components/box";
import DOMPurify from "dompurify";
import ChartError from "./ChartError";
import "./ChartStyles.css";

// Constants for data limits
const MAX_CATEGORIES = 10;
const MAX_SERIES = 5;

// Supported chart types (pie and donut use same component with variant)
const SUPPORTED_CHART_TYPES = ["bar", "pie", "donut", "line"];

/**
 * Sanitize text content to prevent XSS attacks
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
const sanitizeText = (text) => {
  if (typeof text !== "string") return "";
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
};

/**
 * Validate that a value is a valid number
 * @param {*} value - Value to validate
 * @returns {boolean} True if value is a valid number
 */
const isValidNumber = (value) => {
  return typeof value === "number" && !isNaN(value) && isFinite(value);
};

/**
 * Validate chart configuration and return detailed error information
 * @param {Object} config - Chart configuration object
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
export const validateChartConfig = (config) => {
  const errors = [];

  if (!config || typeof config !== "object") {
    errors.push("Configuration must be an object");
    return { valid: false, errors };
  }

  // Validate required 'type' field
  if (!config.type) {
    errors.push("Missing required field: type");
  } else if (!SUPPORTED_CHART_TYPES.includes(config.type)) {
    errors.push(
      `Unsupported chart type: ${config.type}. Supported types: ${SUPPORTED_CHART_TYPES.join(", ")}`
    );
  }

  // Validate required 'data' field
  if (!config.data) {
    errors.push("Missing required field: data");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Enforce data limits on chart configuration
 * @param {Object} config - Chart configuration object
 * @returns {Object} Configuration with enforced limits
 */
const enforceDataLimits = (config) => {
  const result = { ...config };

  if (config.type === "pie" || config.type === "donut") {
    // Pie/donut chart data is an array
    if (Array.isArray(result.data) && result.data.length > MAX_CATEGORIES) {
      result.data = result.data.slice(0, MAX_CATEGORIES);
    }
  } else {
    // Bar, line charts have categories and series
    if (result.data?.categories?.length > MAX_CATEGORIES) {
      result.data = {
        ...result.data,
        categories: result.data.categories.slice(0, MAX_CATEGORIES),
      };
    }
    if (result.data?.series?.length > MAX_SERIES) {
      result.data = {
        ...result.data,
        series: result.data.series.slice(0, MAX_SERIES),
      };
    }
  }

  return result;
};

/**
 * Sanitize all text content in chart configuration
 * @param {Object} config - Chart configuration object
 * @returns {Object} Sanitized configuration
 */
const sanitizeConfig = (config) => {
  const result = { ...config };

  // Sanitize title fields
  if (result.title) result.title = sanitizeText(result.title);
  if (result.xTitle) result.xTitle = sanitizeText(result.xTitle);
  if (result.yTitle) result.yTitle = sanitizeText(result.yTitle);
  if (result.innerMetricValue)
    result.innerMetricValue = sanitizeText(String(result.innerMetricValue));
  if (result.innerMetricDescription)
    result.innerMetricDescription = sanitizeText(result.innerMetricDescription);

  // Sanitize data content
  if ((result.type === "pie" || result.type === "donut") && Array.isArray(result.data)) {
    result.data = result.data.map((item) => ({
      ...item,
      title: sanitizeText(item.title || ""),
      value: isValidNumber(item.value) ? item.value : 0,
    }));
  } else if (result.data) {
    // Sanitize categories
    if (Array.isArray(result.data.categories)) {
      result.data = {
        ...result.data,
        categories: result.data.categories.map((cat) => sanitizeText(String(cat))),
      };
    }

    // Sanitize series
    if (Array.isArray(result.data.series)) {
      result.data = {
        ...result.data,
        series: result.data.series.map((series) => ({
          ...series,
          title: sanitizeText(series.title || ""),
          data: Array.isArray(series.data)
            ? series.data.map((point) => ({
                x: typeof point.x === "string" ? sanitizeText(point.x) : point.x,
                y: isValidNumber(point.y) ? point.y : 0,
              }))
            : [],
        })),
      };
    }
  }

  return result;
};

/**
 * Empty state component for charts with no data
 */
const EmptyState = () => (
  <Box textAlign="center" color="text-status-inactive" role="status" aria-live="polite">
    No data available
  </Box>
);

// Chart height constant
const CHART_HEIGHT = 200;

/**
 * Render a bar chart using Cloudscape BarChart component
 */
const renderBarChart = (config) => {
  const { data, title, xTitle, yTitle } = config;

  if (!data?.series?.length) {
    return <EmptyState />;
  }

  return (
    <BarChart
      series={data.series}
      xDomain={data.categories || []}
      xTitle={xTitle}
      yTitle={yTitle}
      height={CHART_HEIGHT}
      empty={<EmptyState />}
      ariaLabel={title || "Bar chart"}
      ariaDescription={`Bar chart${title ? ` showing ${title}` : ""}`}
      hideFilter
      hideLegend
      detailPopoverSize="small"
    />
  );
};

/**
 * Render a pie or donut chart using Cloudscape PieChart component
 * @param {Object} config - Chart configuration
 * @param {string} variant - "pie" or "donut"
 */
const renderPieChart = (config, variant = "pie") => {
  const { data, title, innerMetricValue, innerMetricDescription } = config;

  // Pie/donut chart expects data as array of { title, value }
  const chartData = Array.isArray(data) ? data : [];

  if (!chartData.length) {
    return <EmptyState />;
  }

  const totalValue = chartData.reduce((sum, item) => sum + (item.value || 0), 0);

  const chartProps = {
    data: chartData,
    size: "medium",
    variant: variant,
    empty: <EmptyState />,
    ariaLabel: title || (variant === "donut" ? "Donut chart" : "Pie chart"),
    ariaDescription: `${variant === "donut" ? "Donut" : "Pie"} chart${title ? ` showing ${title}` : ""}`,
    segmentDescription: (datum, sum) =>
      `${datum.value} units, ${sum > 0 ? ((datum.value / sum) * 100).toFixed(0) : 0}%`,
    detailPopoverContent: (datum) => [
      { key: "Value", value: datum.value },
      {
        key: "Percentage",
        value: totalValue > 0 ? `${((datum.value / totalValue) * 100).toFixed(1)}%` : "0%",
      },
    ],
    hideFilter: true,
    hideLegend: true,
  };

  // Add inner metric for donut charts
  if (variant === "donut") {
    chartProps.innerMetricValue = innerMetricValue || String(totalValue);
    chartProps.innerMetricDescription = innerMetricDescription || "total";
  }

  return <PieChart {...chartProps} />;
};

/**
 * Render a line chart using Cloudscape LineChart component
 */
const renderLineChart = (config) => {
  const { data, title, xTitle, yTitle } = config;

  if (!data?.series?.length) {
    return <EmptyState />;
  }

  return (
    <LineChart
      series={data.series}
      xTitle={xTitle}
      yTitle={yTitle}
      height={CHART_HEIGHT}
      empty={<EmptyState />}
      ariaLabel={title || "Line chart"}
      ariaDescription={`Line chart${title ? ` showing ${title}` : ""}`}
      hideFilter
      hideLegend
    />
  );
};

/**
 * ChartRenderer Component
 *
 * Renders charts based on configuration provided via the dataConfig attribute.
 * Supports bar, pie, donut, and line chart types using Cloudscape components.
 *
 * Features:
 * - Chart type routing (bar, pie, donut, line)
 * - Configuration validation with detailed error messages
 * - Input sanitization to prevent XSS
 * - Data limit enforcement (max 10 categories, 5 series)
 * - Accessibility attributes (ariaLabel, ariaDescription)
 * - Empty state handling
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} props.dataConfig - JSON string containing chart configuration
 * @returns {JSX.Element} The rendered chart or error message
 */
const ChartRenderer = memo(({ dataConfig, ...props }) => {
  const renderedChart = useMemo(() => {
    // In hast/react, data-config may come through as dataConfig (camelCase) or data-config (kebab-case)
    // Handle both naming conventions for compatibility
    const configAttr = dataConfig || props["data-config"];

    // Parse the configuration from the dataConfig attribute
    let config;
    try {
      // Handle both direct object and JSON string
      config = typeof configAttr === "string" ? JSON.parse(configAttr) : configAttr;
    } catch (parseError) {
      return <ChartError message="Invalid JSON configuration" />;
    }

    // Validate the configuration
    const validation = validateChartConfig(config);
    if (!validation.valid) {
      return <ChartError message={validation.errors.join(". ")} />;
    }

    // Sanitize and enforce limits
    const sanitizedConfig = sanitizeConfig(config);
    const limitedConfig = enforceDataLimits(sanitizedConfig);

    // Route to the appropriate chart renderer
    switch (limitedConfig.type) {
      case "bar":
        return renderBarChart(limitedConfig);
      case "pie":
        return renderPieChart(limitedConfig, "pie");
      case "donut":
        return renderPieChart(limitedConfig, "donut");
      case "line":
        return renderLineChart(limitedConfig);
      default:
        return <ChartError message={`Unsupported chart type: ${limitedConfig.type}`} />;
    }
  }, [dataConfig, props]);

  return <div className="chart-container">{renderedChart}</div>;
});

ChartRenderer.displayName = "ChartRenderer";

export default ChartRenderer;
