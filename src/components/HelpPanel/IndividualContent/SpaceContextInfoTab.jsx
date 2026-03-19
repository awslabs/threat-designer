import React from "react";
import TextContent from "./TextContent";
import { useSplitPanel } from "../../../SplitPanelContext";

const Content = () => {
  const { trail } = useSplitPanel();
  if (!trail?.space_context || trail.space_context === "") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "60vh",
          width: 400,
        }}
      >
        No data
      </div>
    );
  }
  return <TextContent content={trail?.space_context} />;
};

const SpaceContextInfoTab = [
  {
    label: "Context",
    id: "SpaceContext",
    content: <Content />,
  },
];

export default SpaceContextInfoTab;
