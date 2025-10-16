import { useEffect, useState, useRef, useCallback } from "react";

export function useScrollToBottom(ref) {
  const [showButton, setShowButton] = useState(false);
  const isAnimatingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    const container = ref.current;
    if (!container || isAnimatingRef.current) return;

    try {
      // Get start and target positions
      const startPosition = container.scrollTop;
      const targetPosition = container.scrollHeight - container.clientHeight;

      // Skip animation if already at bottom
      if (Math.abs(startPosition - targetPosition) < 5) return;

      // Animation parameters
      const duration = 500; // milliseconds
      const startTime = performance.now();
      isAnimatingRef.current = true;

      // Animation function with easing
      const animateScroll = (currentTime) => {
        const elapsed = currentTime - startTime;

        if (elapsed >= duration) {
          // Animation complete
          container.scrollTop = targetPosition;
          isAnimatingRef.current = false;
          return;
        }

        // Calculate progress with cubic ease-in-out
        const progress = elapsed / duration;
        const easedProgress =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // Apply new position
        container.scrollTop = startPosition + (targetPosition - startPosition) * easedProgress;

        // Continue animation
        requestAnimationFrame(animateScroll);
      };

      requestAnimationFrame(animateScroll);
    } catch (err) {
      isAnimatingRef.current = false;
      console.error("Error scrolling:", err);
    }
  }, [ref]);

  const checkScrollPosition = useCallback(() => {
    const container = ref.current;
    if (!container) return;

    // Check if scrolling is needed
    const hasScroll = container.scrollHeight > container.clientHeight;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldShow = hasScroll && distanceFromBottom > 20;

    setShowButton(shouldShow);
  }, [ref]);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // Attach scroll listener
    const handleScroll = () => checkScrollPosition();
    container.addEventListener("scroll", handleScroll, { passive: true });

    // Observe content changes
    const observer = new MutationObserver(() => {
      setTimeout(checkScrollPosition, 50);
    });

    observer.observe(container, { childList: true, subtree: true });

    // Initial check
    setTimeout(checkScrollPosition, 100);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, [checkScrollPosition, ref.current]); // Add ref.current as dependency

  return { showButton, scrollToBottom, setShowButton };
}
