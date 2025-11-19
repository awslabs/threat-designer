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
 * @param {String} rootMargin - Root margin for intersection observer (default: "500px")
 * @param {String} itemKey - Key to use for item identification (default: "id")
 */
const VirtualizedList = memo(function VirtualizedList({
  items,
  renderItem,
  estimatedItemHeight = 400,
  rootMargin = "500px",
  itemKey = "id",
}) {
  const [visibleItems, setVisibleItems] = useState(new Set());
  const observerRef = useRef(null);
  const itemRefs = useRef({});

  useEffect(() => {
    // Create intersection observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleItems((prev) => {
          const newVisible = new Set(prev);
          entries.forEach((entry) => {
            const index = parseInt(entry.target.dataset.index, 10);
            if (entry.isIntersecting) {
              newVisible.add(index);
            } else {
              // Keep items loaded much longer to avoid visible unloading during scrolling
              // Only remove if they're very far from viewport (3+ screen heights away)
              if (
                entry.boundingClientRect.top > window.innerHeight * 3 ||
                entry.boundingClientRect.bottom < -window.innerHeight * 3
              ) {
                newVisible.delete(index);
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

    // Observe all item placeholders
    Object.values(itemRefs.current).forEach((ref) => {
      if (ref) {
        observerRef.current.observe(ref);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [items.length, rootMargin]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <>
      {items.map((item, index) => {
        const isVisible = visibleItems.has(index);
        const key = item[itemKey] || index;

        return (
          <div
            key={key}
            ref={(el) => {
              itemRefs.current[index] = el;
              // Observe new elements
              if (el && observerRef.current) {
                observerRef.current.observe(el);
              }
            }}
            data-index={index}
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
