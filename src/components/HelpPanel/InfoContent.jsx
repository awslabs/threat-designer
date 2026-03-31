import React from "react";
import { Tabs } from "@cloudscape-design/components";
import AssetsInfoTabs from "./IndividualContent/AssetsInfoTabs";
import FlowsInfoTab from "./IndividualContent/FlowsInfoTab";
import ThreatsInfoTabs from "./IndividualContent/ThreatsInfoTabs";
import ThreatModelingTabs from "./IndividualContent/CombinedTabs";

export function InfoContent({ context }) {
  let tabs;

  switch (context) {
    case "All":
      tabs = ThreatModelingTabs;
      break;
    case "Assets":
      tabs = AssetsInfoTabs;
      break;
    case "Flows":
      tabs = FlowsInfoTab;
      break;
    case "Threats":
      tabs = ThreatsInfoTabs;
      break;
    default:
      tabs = [
        {
          label: "Unknown Info",
          id: "unknown-info",
          content: <div>No info available</div>,
        },
      ];
  }

  const [activeTabId, setActiveTabId] = React.useState(tabs.length > 1 ? tabs[0].id : undefined);

  React.useEffect(() => {
    if (tabs.length > 1) {
      setActiveTabId(tabs[0].id);
    }
  }, [context]);

  if (tabs.length <= 1) {
    return <Tabs tabs={tabs} key={context} />;
  }

  return (
    <Tabs
      onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
      activeTabId={activeTabId}
      tabs={tabs}
      key={context}
    />
  );
}
