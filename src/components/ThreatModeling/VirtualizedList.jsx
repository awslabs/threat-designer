import { memo, useState, useEffect, useRef } from "react";

/**
 * VirtualizedList - Generic virtualized list component using Intersection Observer
 *
 * Renders only items that are visible or near the viewport, maintaining natural
 * page scroll behavior while improving performance for large lists.
 *
 * @param {Array} items - Array of items to render
 * @param {Function} renderItem - Function that renders each item (item, index) => ReactNode
 * @param {Number} estimatedItemHeight - Estimated height of each item for placeholder (default: 400px)
 * @param {String} rootMargin - Root margin for intersection observer (default: "1500px")
 * @param {String} itemKey - Key to use for item identification (default: "id")
 */
// Number of items to pre-render immediately on mount (before Intersection Observer kicks in)
const INITIAL_RENDER_COUNT = 10;

const VirtualizedList = memo(function VirtualizedList({
  items,
  renderItem,
  estimatedItemHeight = 600,
  rootMargin = "3000px",
  itemKey = "id",
}) {
  // Pre-populate with first N items to avoid flash of placeholders on initial load
  const getInitialVisibleItems = () => {
    const initial = new Set();
    if (items && items.length > 0) {
      const count = Math.min(INITIAL_RENDER_COUNT, items.length);
      for (let i = 0; i < count; i++) {
        const item = items[i];
        const itemId = item[itemKey] || item.name || i;
        initial.add(String(itemId));
      }
    }
    return initial;
  };

  const [visibleItems, setVisibleItems] = useState(getInitialVisibleItems);
  const observerRef = useRef(null);
  const itemRefs = useRef({});

  // Pre-populate visible items when items array changes (e.g., data loads after mount)
  useEffect(() => {
    if (items && items.length > 0) {
      setVisibleItems((prev) => {
        const newVisible = new Set(prev);
        const count = Math.min(INITIAL_RENDER_COUNT, items.length);
        for (let i = 0; i < count; i++) {
          const item = items[i];
          const itemId = String(item[itemKey] || item.name || i);
          newVisible.add(itemId);
        }
        return newVisible;
      });
    }
  }, [items, itemKey]);

  // Create intersection observer once
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleItems((prev) => {
          const newVisible = new Set(prev);
          entries.forEach((entry) => {
            const itemId = String(entry.target.dataset.itemId);
            if (entry.isIntersecting) {
              newVisible.add(itemId);
            } else {
              // Keep items loaded much longer to avoid visible unloading during scrolling
              // Only remove if they're very far from viewport (5x screen heights away)
              if (
                entry.boundingClientRect.top > window.innerHeight * 4 ||
                entry.boundingClientRect.bottom < -window.innerHeight * 4
              ) {
                newVisible.delete(itemId);
              }
            }
          });
          return newVisible;
        });
      },
      {
        root: null, // Use viewport as root
        rootMargin: rootMargin, // Load items before they enter viewport
        threshold: 0,
      }
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [rootMargin]);

  // Observe items when they change (without recreating the observer)
  useEffect(() => {
    if (!observerRef.current) return;

    // Observe all current item refs
    Object.values(itemRefs.current).forEach((ref) => {
      if (ref) {
        observerRef.current.observe(ref);
      }
    });
  }, [items.length]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <>
      {items.map((item, index) => {
        const itemId = String(item[itemKey] || item.name || index);
        // Always render first INITIAL_RENDER_COUNT items immediately (no virtualization)
        // This ensures instant display on page load without waiting for Intersection Observer
        const isInitialItem = index < INITIAL_RENDER_COUNT;
        const isVisible = isInitialItem || visibleItems.has(itemId);
        const key = itemId;

        return (
          <div
            key={key}
            ref={(el) => {
              itemRefs.current[itemId] = el;
              // Observe new elements (skip initial items as they're always visible)
              if (el && observerRef.current && !isInitialItem) {
                observerRef.current.observe(el);
              }
            }}
            data-item-id={itemId}
            style={{
              marginBottom: "16px",
              minHeight: isVisible ? "auto" : `${estimatedItemHeight}px`,
            }}
          >
            {isVisible ? (
              renderItem(item, index)
            ) : (
              // Placeholder to maintain scroll position
              <div style={{ height: `${estimatedItemHeight}px`, background: "transparent" }} />
            )}
          </div>
        );
      })}
    </>
  );
});

export default VirtualizedList;
