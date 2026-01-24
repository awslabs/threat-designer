import { PlusCircle, LayoutGrid } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/ui/sidebar";
import { SidebarHeader } from "./SidebarHeader";
import { NavMain } from "./NavMain";
import { NavGuides } from "./NavGuides";
import { NavUser } from "./NavUser";
import "./Sidebar.css";

/**
 * AppSidebar is the main sidebar component that composes all sidebar sections.
 *
 * Requirements:
 * - 1.1: Display sidebar on left side with navigation items
 * - 1.2: Contain all navigation functionality from top bar
 * - 4.4: Position user section in footer area
 * - 5.1: Collapse to show only icons
 * - 5.2: Display tooltips on hover when collapsed
 * - 5.3: Expand to show full text labels
 *
 * @param {Object} props
 * @param {Object} props.user - User object with given_name and family_name
 * @param {string} props.colorMode - Current color mode ('system', 'light', 'dark')
 * @param {string} props.effectiveTheme - Effective theme ('light' or 'dark')
 * @param {Function} props.setThemeMode - Function to set theme mode
 * @param {Function} props.onLogout - Function to handle logout with loading state
 * @param {Function} props.onThreatModelsRefresh - Callback that receives the refresh function for threat models list
 */
export function AppSidebar({
  user,
  colorMode,
  effectiveTheme,
  setThemeMode,
  onLogout,
  ...props
}) {
  // Navigation items configuration
  const navItems = [
    {
      title: "New",
      url: "/",
      icon: PlusCircle,
    },
    {
      title: "Threat Catalog",
      url: "/threat-catalog",
      icon: LayoutGrid,
    },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader />
      <SidebarContent className="flex flex-col">
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter className="!p-2">
        <NavGuides />
        <NavUser
          user={user}
          colorMode={colorMode}
          setThemeMode={setThemeMode}
          onLogout={onLogout}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
