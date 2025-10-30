import React from "react";
import AgentInterface from "../../components/Agent/AgentInterface";
import { SENTRY_ENABLED } from "../../config";
import { Box, SpaceBetween, Container } from "@cloudscape-design/components";

function Agent({ user, inTools }) {
  if (!SENTRY_ENABLED) {
    return (
      <div
        style={{
          padding: "20px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "400px",
        }}
      >
        <Container>
          <SpaceBetween size="m">
            <Box textAlign="center" variant="h2">
              Feature Not Available
            </Box>
            <Box textAlign="center" color="text-body-secondary">
              The Sentry agent is not available in Lightning Mode. This feature requires the full
              backend infrastructure.
            </Box>
          </SpaceBetween>
        </Container>
      </div>
    );
  }

  return <AgentInterface user={user} inTools={inTools} />;
}

export default Agent;
