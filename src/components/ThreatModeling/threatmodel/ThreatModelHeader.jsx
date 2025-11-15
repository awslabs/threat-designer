import React from "react";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ToggleButton from "@cloudscape-design/components/toggle-button";

export const ThreatModelHeader = ({ title, actions, showInsights, onToggleInsights }) => {
  return (
    <Header
      variant="h1"
      actions={
        <SpaceBetween direction="horizontal" size="xs">
          {actions && (
            <ToggleButton
              iconName="grid-view"
              pressed={showInsights}
              onChange={({ detail }) => onToggleInsights(detail.pressed)}
            >
              Insights
            </ToggleButton>
          )}
          {actions}
        </SpaceBetween>
      }
    >
      <SpaceBetween direction="horizontal" size="xs">
        <div>{title}</div>
      </SpaceBetween>
    </Header>
  );
};
