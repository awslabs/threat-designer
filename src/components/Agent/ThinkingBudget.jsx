import React from "react";
import List from "@cloudscape-design/components/list";
import Toggle from "@cloudscape-design/components/toggle";

const ThinkingBudget = React.memo(({ budget, setBudget }) => {
  const items = [
    {
      id: "1",
      content: "Low",
    },
    {
      id: "2",
      content: "Medium",
    },
    {
      id: "3",
      content: "High",
    },
  ];

  const handleToggleChange = (itemId, isChecked) => {
    // If toggling on, set this item as the budget
    // If toggling off, clear the budget (optional - you might want to prevent this)
    if (isChecked) {
      setBudget(itemId);
    } else {
      // Optional: prevent unchecking the current selection
      // or allow clearing by setting to null
      setBudget(null);
    }
  };

  return (
    <div style={{ padding: "8px", paddingRight: "20px", paddingLeft: "12px", width: "250px" }}>
      <List
        ariaLabel="List with icons and actions"
        sortable
        sortDisabled
        items={items}
        renderItem={(item) => ({
          id: item.id,
          content: item.content,
          actions: (
            <Toggle
              onChange={({ detail }) => handleToggleChange(item.id, detail.checked)}
              checked={budget === item.id}
              readOnly={budget === item.id}
            />
          ),
        })}
      />
    </div>
  );
});

export default ThinkingBudget;
