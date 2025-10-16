import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const AppRefreshManager = ({ children }) => {
  const location = useLocation();

  useEffect(() => {
    let lastActiveTime = Date.now();
    let refreshTimeout;

    const STALE_THRESHOLD = 30000; // 30 seconds
    const CHECK_INTERVAL = 1000; // Check every second

    // Force refresh the entire app
    const forceAppRefresh = () => {
      window.dispatchEvent(new Event("app-refocus"));
    };

    const checkAndRefresh = () => {
      const now = Date.now();
      const timeSinceActive = now - lastActiveTime;

      if (timeSinceActive > STALE_THRESHOLD) {
        forceAppRefresh();
        lastActiveTime = now;
      }
    };

    // Universal visibility/focus detection
    const handleUserReturn = () => {
      const now = Date.now();
      const wasInactive = now - lastActiveTime > STALE_THRESHOLD;

      if (wasInactive) {
        // User was gone for a while - refresh everything
        forceAppRefresh();
      }

      lastActiveTime = now;
    };

    const handleUserLeave = () => {
      lastActiveTime = Date.now();
    };

    // Track all possible "user is back" scenarios
    const events = {
      visibilitychange: () => {
        if (!document.hidden) handleUserReturn();
        else handleUserLeave();
      },
      focus: handleUserReturn,
      blur: handleUserLeave,
      pageshow: (e) => {
        if (e.persisted) handleUserReturn();
      },
      online: handleUserReturn,
      mouseenter: () => {
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(checkAndRefresh, 100);
      },
      touchstart: () => {
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(checkAndRefresh, 100);
      },
      keydown: () => {
        lastActiveTime = Date.now();
      },
    };

    // Attach all listeners
    Object.entries(events).forEach(([event, handler]) => {
      if (event === "visibilitychange") {
        document.addEventListener(event, handler);
      } else {
        window.addEventListener(event, handler);
      }
    });

    // Periodic check (backup)
    const interval = setInterval(() => {
      if (!document.hidden) {
        checkAndRefresh();
      }
    }, CHECK_INTERVAL);

    // Cleanup
    return () => {
      Object.entries(events).forEach(([event, handler]) => {
        if (event === "visibilitychange") {
          document.removeEventListener(event, handler);
        } else {
          window.removeEventListener(event, handler);
        }
      });
      clearInterval(interval);
      clearTimeout(refreshTimeout);
    };
  }, [location]);

  return children;
};

export default AppRefreshManager;
