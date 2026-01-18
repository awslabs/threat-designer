import { useEffect, useState, useCallback } from "react";

export function useScrollToBottom(ref) {
  const [showButton, setShowButton] = useState(false);

  const scrollToBottom = useCallback(() => {
    const container = ref.current;
    if (!container) return;

    try {
      const targetPosition = container.scrollHeight - container.clientHeight;

      // Skip if already at bottom
      if (Math.abs(container.scrollTop - targetPosition) < 5) {
        setShowButton(false);
        return;
      }

      // Instant scroll
      container.scrollTop = targetPosition;
      setShowButton(false);
    } catch (err) {
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

    // Attach scroll listener - only show button when user scrolls up
    const handleScroll = () => checkScrollPosition();
    container.addEventListener("scroll", handleScroll, { passive: true });

    // Initial check after a brief delay to let content render
    requestAnimationFrame(() => {
      checkScrollPosition();
    });

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [checkScrollPosition, ref.current]); // Add ref.current as dependency

  return { showButton, scrollToBottom, setShowButton, checkScrollPosition };
}
