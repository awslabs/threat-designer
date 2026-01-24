import { useEffect, useState, useCallback, useRef } from "react";

export function useScrollToBottom(ref) {
  const [showButton, setShowButton] = useState(false);
  const resizeObserverRef = useRef(null);
  const mutationObserverRef = useRef(null);
  const lastScrollHeightRef = useRef(0);

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
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldCheck = true;
          // Observe new elements
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && resizeObserverRef.current) {
              resizeObserverRef.current.observe(node);
            }
          });
        }
        if (mutation.type === 'characterData') {
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
