import AssetsInfoTabs from "./AssetsInfoTabs";
import FlowsInfoTabs from "./FlowsInfoTab";
import ThreatsInfoTabs from "./ThreatsInfoTabs";
import SpaceContextInfoTab from "./SpaceContextInfoTab";

const ThreatModelingTabs = [
  ...SpaceContextInfoTab,
  ...AssetsInfoTabs,
  ...FlowsInfoTabs,
  ...ThreatsInfoTabs,
];

export default ThreatModelingTabs;
