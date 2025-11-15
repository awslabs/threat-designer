import React from "react";
import ThreatModelingOutput from "../ResultsComponent";
import Processing from "../ProcessingComponent";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { Spinner } from "@cloudscape-design/components";
import ThreatModelDashboard from "../ThreatModelDashboard";

export const ThreatModelContent = ({
  loading,
  state,
  tmStatus,
  iteration,
  tmDetail,
  id,
  alert,
  alertMessages,
  hideAlert,
  handleRestore,
  response,
  base64Content,
  updateThreatModeling,
  handleRefresh,
  showInsights,
}) => {
  if (loading) {
    return (
      <SpaceBetween alignItems="center">
        <div style={{ marginTop: "20px" }}>
          <Spinner size="large" />
        </div>
      </SpaceBetween>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
      }}
    >
      {state.processing && (
        <div style={{ width: "100%", marginTop: "200px" }}>
          <Processing status={tmStatus} iteration={iteration} detail={tmDetail} id={id} />
        </div>
      )}
      {state.results && !showInsights && (
        <ThreatModelingOutput
          title={response?.item?.title}
          architectureDiagramBase64={base64Content}
          description={response?.item?.description}
          assumptions={response?.item?.assumptions}
          dataFlowData={response?.item?.system_architecture?.data_flows}
          trustBoundaryData={response?.item?.system_architecture?.trust_boundaries}
          threatSourceData={response?.item?.system_architecture?.threat_sources}
          threatCatalogData={response?.item?.threat_list?.threats}
          assets={response?.item?.assets?.assets}
          updateTM={updateThreatModeling}
          refreshTrail={handleRefresh}
        />
      )}
      {state.results && showInsights && (
        <ThreatModelDashboard threats={response?.item?.threat_list?.threats} />
      )}
      {alert.visible && alert.state === "ErrorThreatModeling" && (
        <div style={{ width: "80%", marginTop: "200px" }}>
          <Alert
            statusIconAriaLabel={"Error"}
            type={"error"}
            action={<Button onClick={handleRestore}>{alertMessages[alert.state].button}</Button>}
            header={alertMessages[alert.state].title}
          >
            {alertMessages[alert.state].msg}
          </Alert>
        </div>
      )}
    </div>
  );
};
