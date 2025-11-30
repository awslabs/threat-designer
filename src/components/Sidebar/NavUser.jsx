import { ChevronsUpDown, LogOut, MonitorCog, Moon, Sun, Check } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * NavUser component displays user profile information and provides
 * dropdown menu with theme options and sign out functionality.
 *
 * Requirements:
 * - 3.1: Display theme options (System, Light, Dark)
 * - 3.2: Apply selected theme immediately
 * - 3.3: Visually indicate currently active theme
 * - 4.1: Display user's given_name and family_name
 * - 4.2: Display dropdown menu with account options
 * - 4.3: Sign out option that logs user out
 *
 * @param {Object} props
 * @param {Object} props.user - User object with given_name and family_name
 * @param {string} props.colorMode - Current color mode ('system', 'light', 'dark')
 * @param {Function} props.setThemeMode - Function to set theme mode
 * @param {Function} props.onLogout - Function to call when signing out
 */
export function NavUser({ user, colorMode, setThemeMode, onLogout }) {
  const { isMobile, state } = useSidebar();

  // Get user display name with fallback
  const displayName =
    user?.given_name && user?.family_name
      ? `${user.given_name} ${user.family_name}`
      : user?.given_name || user?.family_name || "User";

  // Get initials for avatar fallback
  const getInitials = () => {
    const first = user?.given_name?.[0] || "";
    const last = user?.family_name?.[0] || "";
    return (first + last).toUpperCase() || "U";
  };

  const themeOptions = [
    { id: "system", label: "System", icon: MonitorCog },
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
  ];

  const handleThemeChange = (themeId) => {
    setThemeMode(themeId.toUpperCase());
  };

  const handleSignOut = () => {
    onLogout();
  };

  return (
    <SidebarFooter className="mt-auto !pb-3 !px-1.5">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar
                  className="h-8 w-8 rounded-lg !border-0"
                  style={{ border: "none", borderWidth: 0, outline: "none" }}
                >
                  <AvatarFallback
                    className="rounded-lg !border-0 !bg-sidebar-primary"
                    style={{ border: "none", borderWidth: 0, outline: "none" }}
                  >
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={state === "collapsed" ? 14 : 14}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar
                    className="h-8 w-8 rounded-lg !border-0"
                    style={{ border: "none", borderWidth: 0, outline: "none" }}
                  >
                    <AvatarFallback
                      className="rounded-lg !border-0 !bg-sidebar-primary"
                      style={{ border: "none", borderWidth: 0, outline: "none" }}
                    >
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{displayName}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Theme
                </DropdownMenuLabel>
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = colorMode === option.id;

                  return (
                    <DropdownMenuItem
                      key={option.id}
                      onClick={() => handleThemeChange(option.id)}
                      className="cursor-pointer"
                    >
                      <Icon className="mr-2 size-4" />
                      <span>{option.label}</span>
                      {isActive && <Check className="ml-auto size-4" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                <LogOut className="mr-2 size-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

export default NavUser;
