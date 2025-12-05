import { useNavigate, useLocation } from "react-router-dom";
import { BookOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";

const guides = [
  { title: "Quick Start", slug: "quick-start" },
  { title: "Submit Threat Model", slug: "submit-threat-model" },
  { title: "Interact with Results", slug: "interact-with-threat-model-results" },
  { title: "Replay Threat Model", slug: "replay-threat-model" },
  { title: "Using Attack Trees", slug: "using-attack-trees" },
  { title: "Using Sentry", slug: "using-sentry" },
  { title: "Collaborate on Threat Models", slug: "collaborate-on-threat-models" },
];

export function NavGuides() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, state } = useSidebar();

  const isGuideActive = location.pathname.startsWith("/guides");

  const handleGuideClick = (slug) => {
    navigate(`/guides/${slug}`);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip="Guides"
              isActive={isGuideActive}
              className="cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <BookOpen className="size-4 shrink-0" />
              {state !== "collapsed" && <span className="ml-2">Documentation</span>}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={state === "collapsed" ? 14 : 14}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Quick Guides
              </DropdownMenuLabel>
              {guides.map((guide) => {
                const isActive = location.pathname === `/guides/${guide.slug}`;
                return (
                  <DropdownMenuItem
                    key={guide.slug}
                    onClick={() => handleGuideClick(guide.slug)}
                    className={`cursor-pointer ${isActive ? "bg-accent" : ""}`}
                  >
                    <span>{guide.title}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export default NavGuides;
