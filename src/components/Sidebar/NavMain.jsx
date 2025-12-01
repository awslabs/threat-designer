import { useNavigate, useLocation } from "react-router-dom";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { NavGuides } from "./NavGuides";

/**
 * NavMain component renders the main navigation items in the sidebar.
 *
 * Requirements:
 * - 2.1: Navigate to home page when "New" is clicked
 * - 2.2: Navigate to threat catalog when "Threat Catalog" is clicked
 * - 2.3: Visually indicate active navigation state
 * - 2.4: Display icons alongside text labels
 *
 * @param {Object} props
 * @param {Array} props.items - Array of navigation items with title, url, icon
 */
export function NavMain({ items }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (url) => {
    navigate(url);
  };

  /**
   * Determines if a navigation item is active based on current route.
   * For the home route ("/"), only exact match is considered active.
   * For other routes, checks if current path starts with the item's url.
   */
  const isItemActive = (itemUrl) => {
    if (itemUrl === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(itemUrl);
  };

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item.url);

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  onClick={() => handleNavigation(item.url)}
                >
                  {Icon && <Icon className="size-4" />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
          <NavGuides />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export default NavMain;
