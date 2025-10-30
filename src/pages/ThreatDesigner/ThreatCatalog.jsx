import React, { useEffect } from "react";
import { ThreatCatalogCardsComponent } from "../../components/ThreatModeling/ThreatCatalogCards.jsx";
import { THREAT_CATALOG_ENABLED } from "../../config";
import { Box, SpaceBetween, Container } from "@cloudscape-design/components";

const ThreatCatalog = ({ user }) => {
  useEffect(() => {}, [user]);

  if (!THREAT_CATALOG_ENABLED) {
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
              The Threat Catalog feature is not available in Lightning Mode. This feature requires
              the full backend infrastructure.
            </Box>
          </SpaceBetween>
        </Container>
      </div>
    );
  }

  return <ThreatCatalogCardsComponent user={user} />;
};

export default ThreatCatalog;
