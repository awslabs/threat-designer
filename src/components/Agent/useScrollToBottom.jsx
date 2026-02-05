import { useEffect, useState, useCallback, useRef } from "react";

// Scroll configuration constants
const SCROLL_CONFIG = {
  SMOOTH_DURATION: 400, // Animation duration in ms (for reference)
  MIN_DISTANCE_FOR_SMOOTH: 10, // Minimum pixels to trigger smooth scroll (lowered from 50)
  NEAR_BOTTOM_THRESHOLD: 5, // Pixels from bottom to consider "at bottom"
};

export function useScrollToBottom(ref) {
  const [showButton, setShowButton] = useState(false);
  const resizeObserverRef = useRef(null);
  const mutationObserverRef = useRef(null);
  const lastScrollHeightRef = useRef(0);
  const isSmoothScrollingRef = useRef(false);

  const scrollToBottom = useCallback(
    (smooth = false) => {
      const container = ref.current;
      if (!container) return;

      try {
        const targetPosition = container.scrollHeight - container.clientHeight;
        const currentPosition = container.scrollTop;
        const distance = Math.abs(targetPosition - currentPosition);

        // Skip if already at bottom
        if (distance < SCROLL_CONFIG.NEAR_BOTTOM_THRESHOLD) {
          setShowButton(false);
          isSmoothScrollingRef.current = false;
          return;
        }

        // Determine scroll behavior:
        // Use instant scroll if:
        // - smooth is false (explicit instant request)
        // - distance is less than MIN_DISTANCE_FOR_SMOOTH (too short for animation)
        const shouldUseSmooth = smooth && distance >= SCROLL_CONFIG.MIN_DISTANCE_FOR_SMOOTH;

        if (shouldUseSmooth) {
          // Smooth scroll using native scrollTo with behavior
          isSmoothScrollingRef.current = true;
          container.scrollTo({
            top: targetPosition,
            behavior: "smooth",
          });

          // Clear smooth scrolling flag after animation completes
          // Using a timeout based on typical smooth scroll duration
          setTimeout(() => {
            isSmoothScrollingRef.current = false;
          }, SCROLL_CONFIG.SMOOTH_DURATION);
        } else {
          // Instant scroll
          isSmoothScrollingRef.current = false;
          container.scrollTop = targetPosition;
        }

        setShowButton(false);
      } catch (err) {
        console.error("Error scrolling:", err);
        isSmoothScrollingRef.current = false;
      }
    },
    [ref]
  );

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

    // Attach scroll listener - show button when user scrolls up and cancel smooth scroll on user interaction
    const handleScroll = () => {
      // Cancel smooth scroll animation if user manually scrolls
      if (isSmoothScrollingRef.current) {
        // Check if this is a user-initiated scroll (not programmatic)
        // We detect this by checking if we're not near the target position
        const targetPosition = container.scrollHeight - container.clientHeight;
        const distanceFromTarget = Math.abs(container.scrollTop - targetPosition);

        // If we're far from target during smooth scroll, user likely interrupted
        if (distanceFromTarget > SCROLL_CONFIG.NEAR_BOTTOM_THRESHOLD) {
          // User is scrolling manually, cancel the smooth scroll
          isSmoothScrollingRef.current = false;
        }
      }
      checkScrollPosition();
    };
    container.addEventListener("scroll", handleScroll, { passive: true });

    // Use ResizeObserver to detect content size changes
    resizeObserverRef.current = new ResizeObserver(() => {
      // Check if scrollHeight changed (content grew)
      if (container.scrollHeight !== lastScrollHeightRef.current) {
        lastScrollHeightRef.current = container.scrollHeight;
        checkScrollPosition();
      }
    });

    // Observe all children recursively for size changes
    const observeAllChildren = (element) => {
      if (resizeObserverRef.current && element) {
        resizeObserverRef.current.observe(element);
        Array.from(element.children).forEach(observeAllChildren);
      }
    };

    // Observe the container
    resizeObserverRef.current.observe(container);
    observeAllChildren(container);

    // Use MutationObserver to detect when new elements are added
    mutationObserverRef.current = new MutationObserver((mutations) => {
      let shouldCheck = false;
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          shouldCheck = true;
          // Observe new elements
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && resizeObserverRef.current) {
              resizeObserverRef.current.observe(node);
            }
          });
        }
        if (mutation.type === "characterData") {
          shouldCheck = true;
        }
      });
      if (shouldCheck) {
        checkScrollPosition();
      }
    });

    mutationObserverRef.current.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Initial check after a brief delay to let content render
    requestAnimationFrame(() => {
      lastScrollHeightRef.current = container.scrollHeight;
      checkScrollPosition();
    });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
      }
    };
  }, [checkScrollPosition, ref.current]);

  return { showButton, scrollToBottom, setShowButton, checkScrollPosition };
}
