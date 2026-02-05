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
    <div
      style={{
        padding: "6px",
        paddingRight: "16px",
        paddingLeft: "10px",
        minWidth: "250px",
        fontSize: "14px",
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
  );
});

export default ToolsConfig;
