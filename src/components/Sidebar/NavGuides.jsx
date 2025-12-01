import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { BookOpen, ChevronDown } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const [isOpen, setIsOpen] = useState(false);

  const isGuideActive = location.pathname.startsWith("/guides");

  const handleGuideClick = (slug) => {
    navigate(`/guides/${slug}`);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip="Guides"
            isActive={isGuideActive}
            className="guides-collapsible-trigger"
          >
            <BookOpen className="size-4" />
            <span>Guides</span>
            <ChevronDown
              className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              style={{ marginLeft: "auto", position: "relative" }}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub>
            {guides.map((guide) => {
              const isActive = location.pathname === `/guides/${guide.slug}`;
              return (
                <SidebarMenuSubItem key={guide.slug}>
                  <SidebarMenuSubButton
                    isActive={isActive}
                    onClick={() => handleGuideClick(guide.slug)}
                  >
                    <span>{guide.title}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export default NavGuides;
