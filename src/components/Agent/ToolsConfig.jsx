import React from "react";
import List from "@cloudscape-design/components/list";
import Toggle from "@cloudscape-design/components/toggle";

const ToolsConfig = React.memo(({ items, setItems }) => {
  const handleToggleChange = (itemId, isChecked) => {
    setItems((prevItems) =>
      prevItems.map((item) => (item.id === itemId ? { ...item, enabled: isChecked } : item))
    );
  };

  return (
    <div style={{ padding: "8px", minWidth: "300px" }}>
      <div
        style={{
          maxHeight: "300px",
          overflowY: "auto",
          paddingRight: "20px",
          paddingLeft: "12px",
        }}
      >
        <List
          ariaLabel="List with tools"
          sortable
          sortDisabled
          items={items}
          renderItem={(item) => ({
            id: item.id,
            content: item.content,
            actions: (
              <Toggle
                onChange={({ detail }) => handleToggleChange(item.id, detail.checked)}
                checked={!!item.enabled}
              />
            ),
          })}
        />
      </div>
    </div>
  );
});

export default ToolsConfig;
