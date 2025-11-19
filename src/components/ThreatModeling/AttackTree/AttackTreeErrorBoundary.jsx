import { Component } from "react";
import PropTypes from "prop-types";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";

/**
 * Error Boundary Component for Attack Tree Visualization
 *
 * Catches React errors in the attack tree component tree and displays
 * a user-friendly error message instead of crashing the entire application.
 *
 * Requirements: 5.1
 */
class AttackTreeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details to console for debugging
    console.error("Attack Tree Error Boundary caught an error:", error);
    console.error("Error Info:", errorInfo);

    // Store error details in state
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    // Reset error state to attempt re-render
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      return (
        <Box padding="l">
          <Alert
            type="error"
            header="Attack Tree Visualization Error"
            action={
              <Button onClick={this.handleReset} variant="normal">
                Try Again
              </Button>
            }
          >
            <Box variant="p">
              An error occurred while rendering the attack tree visualization. This could be due to
              invalid data or a rendering issue.
            </Box>
            {this.state.error && (
              <Box variant="small" color="text-status-error" margin={{ top: "s" }}>
                Error: {this.state.error.toString()}
              </Box>
            )}
          </Alert>
        </Box>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

AttackTreeErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AttackTreeErrorBoundary;
