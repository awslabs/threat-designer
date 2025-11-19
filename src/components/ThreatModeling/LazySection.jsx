import { memo, useState, useEffect, useRef } from "react";

/**
 * LazySection - Lazy loads content using Intersection Observer
 *
 * Renders content only when it's visible or near the viewport, unloading it
 * when far from view to save memory and improve performance.
 *
 * @param {ReactNode} children - Content to lazy load
 * @param {Number} estimatedHeight - Estimated height of content for placeholder (default: 500px)
 * @param {String} rootMargin - Root margin for intersection observer (default: "800px")
 */
const LazySection = memo(function LazySection({
  children,
  estimatedHeight = 500,
  rootMargin = "800px",
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            setHasBeenVisible(true);
          } else {
            // Only unload if far from viewport
            if (
              entry.boundingClientRect.top > window.innerHeight * 2 ||
              entry.boundingClientRect.bottom < -window.innerHeight * 2
            ) {
              setIsVisible(false);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: rootMargin,
        threshold: 0,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [rootMargin]);

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: isVisible || !hasBeenVisible ? "auto" : `${estimatedHeight}px`,
      }}
    >
      {isVisible || !hasBeenVisible ? (
        children
      ) : (
        // Placeholder to maintain scroll position
        <div style={{ height: `${estimatedHeight}px`, background: "transparent" }} />
      )}
    </div>
  );
});

export default LazySection;
