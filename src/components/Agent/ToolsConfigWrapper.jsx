import React, { useState, useEffect, useRef } from "react";
import ToolsConfig from "./ToolsConfig";

const ToolsConfigWrapper = ({ items = [], onItemsChange }) => {
  const [localItems, setLocalItems] = useState(items);
  const itemsRef = useRef(localItems);

  // Update local items when props change
  useEffect(() => {
    setLocalItems(items);
    itemsRef.current = items;
  }, [items]);

  // Update ref when local items change (removed the onItemsChange call from here)
  useEffect(() => {
    itemsRef.current = localItems;
  }, [localItems]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (onItemsChange) {
        onItemsChange(localItems);
      }
    }, 50);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [localItems, onItemsChange]);

  const handleSetItems = (value) => {
    setLocalItems(value);
  };

  return <ToolsConfig items={localItems} setItems={handleSetItems} />;
};

export default ToolsConfigWrapper;
