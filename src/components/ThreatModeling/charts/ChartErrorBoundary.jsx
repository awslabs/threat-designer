import React from "react";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";

/**
 * ChartErrorBoundary Component
 *
 * Error boundary component that catches rendering errors in chart components
 * and displays a user-friendly fallback UI instead of crashing the entire dashboard.
 *
 * Features:
 * - Catches JavaScript errors in child components
 * - Displays fallback UI with error message
 * - Logs error details to console for debugging
 * - Prevents error propagation to parent components
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to wrap
 * @param {string} props.chartName - Name of the chart for error messages
 * @returns {JSX.Element} The wrapped component or error fallback UI
 */
class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details to console for debugging
    console.error(`Error rendering ${this.props.chartName || "chart"}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      return (
        <Container header={<Header variant="h3">{this.props.chartName || "Chart"}</Header>}>
          <Alert type="error" header="Unable to render chart">
            <Box variant="p">
              An error occurred while rendering this chart. Please try refreshing the page or
              contact support if the problem persists.
            </Box>
          </Alert>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ChartErrorBoundary;
