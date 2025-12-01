import { useState, useEffect } from "react";
import {
  SidebarHeader as ShadcnSidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import Logo from "../../../assets/logo.png";

/**
 * SidebarHeader component displays the application logo and collapse/expand trigger
 * in the header section of the sidebar.
 *
 * Requirements: 1.4 - Display application logo in header section
 */
export function SidebarHeader() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  // Delayed state to sync with sidebar animation (500ms)
  const [delayedCollapsed, setDelayedCollapsed] = useState(isCollapsed);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    // Start transition immediately when state changes
    if (isCollapsed !== delayedCollapsed) {
      setIsTransitioning(true);
    }

    const timer = setTimeout(
      () => {
        setDelayedCollapsed(isCollapsed);
        setIsTransitioning(false);
      },
      isCollapsed ? 500 : 0
    ); // Delay only when collapsing

    return () => clearTimeout(timer);
  }, [isCollapsed, delayedCollapsed]);

  return (
    <ShadcnSidebarHeader className="p-0 pb-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center w-full h-12 px-2 mt-1 group/header relative">
            {/* Logo container - always present */}
            <div className="relative flex items-center justify-center w-8 h-8 ml-1">
              <img
                src={Logo}
                alt="Threat Designer"
                className={`w-8 h-8 transition-opacity duration-200 pointer-events-none ${
                  delayedCollapsed ? "group-hover/header:opacity-0" : ""
                }`}
                style={{ width: "2rem", height: "2rem", maxWidth: "2rem", maxHeight: "2rem" }}
              />
              {/* Expand button overlay - always rendered, visibility controlled by CSS */}
              <div
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                  delayedCollapsed
                    ? "opacity-0 group-hover/header:opacity-100"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                <SidebarTrigger />
              </div>
            </div>

            {/* Collapse button when expanded - on the right */}
            <div
              className={`absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-200 ${
                delayedCollapsed || isTransitioning
                  ? "opacity-0 pointer-events-none"
                  : "opacity-100"
              }`}
            >
              <SidebarTrigger />
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </ShadcnSidebarHeader>
  );
}

export default SidebarHeader;
