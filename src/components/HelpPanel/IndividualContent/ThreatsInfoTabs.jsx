import React, { useState, useEffect } from "react";
import Pagination from "@cloudscape-design/components/pagination";
import { SpaceBetween } from "@cloudscape-design/components";
import TextContent from "./TextContent";
import { useSplitPanel } from "../../../SplitPanelContext";

const Content = ({ data = [] }) => {
  const [currentPageIndex, setCurrentPageIndex] = useState(1);

  useEffect(() => {
    setCurrentPageIndex(1);
  }, [data.length]);
  useEffect(() => {
    if (data.length > 0 && currentPageIndex > data.length) {
      setCurrentPageIndex(Math.min(currentPageIndex, data.length));
    }
  }, [data.length, currentPageIndex]);

  if (data.length === 0) {
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
  const safePageIndex = Math.min(Math.max(1, currentPageIndex), data.length);

  return (
    <SpaceBetween size="m">
      <Pagination
        currentPageIndex={safePageIndex}
        onChange={({ detail }) => {
          setCurrentPageIndex(detail.currentPageIndex);
        }}
        pagesCount={Math.max(1, data.length)}
      />
      <TextContent content={data[safePageIndex - 1]} />
    </SpaceBetween>
  );
};

const Threats = () => {
  const splitPanelContext = useSplitPanel() || {};
  const trail = splitPanelContext.trail || {};
  return <Content data={trail.threats || []} />;
};

const Gaps = () => {
  const splitPanelContext = useSplitPanel() || {};
  const trail = splitPanelContext.trail || {};
  return <Content data={trail.gaps || []} />;
};

const ThreatsInfoTabs = [
  {
    label: "Threats",
    id: "Threats",
    content: <Threats />,
  },
  {
    label: "Gaps",
    id: "Gaps",
    content: <Gaps />,
  },
];

export default ThreatsInfoTabs;
