import { useEffect } from "react";
import { BACKEND_MODE } from "../config";

/**
 * Custom hook to handle browser beforeunload event for data loss prevention
 * Only activates in Lightning Mode when threat modeling data exists
 *
 * @param {boolean} enabled - Whether the hook should be active (defaults to true)
 */
export function useBeforeUnload(enabled = true) {
  useEffect(() => {
    // Only activate in Lightning Mode
    if (BACKEND_MODE !== "lightning" || !enabled) {
      return;
    }

    const handleBeforeUnload = (event) => {
      // Check if threat modeling data exists in sessionStorage
      const hasData = sessionStorage.getItem("tm_all_jobs") !== null;

      if (hasData) {
        // Standard way to trigger browser confirmation dialog
        // Modern browsers ignore custom messages and show their own
        event.preventDefault();
        event.returnValue = ""; // Required for Chrome and other browsers
        return ""; // Required for some older browsers
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabled]);
}
