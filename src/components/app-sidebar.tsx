import { Link, useRouterState } from "@tanstack/react-router";
import { MessageSquarePlus, Compass, Sparkles, History, Settings, HelpCircle, Cpu } from "lucide-react";
import logo from "@/assets/logo.png.asset.json";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const main = [
  { title: "New chat", url: "/", icon: MessageSquarePlus },
  { title: "Explore", url: "/explore", icon: Compass },
  { title: "Gems", url: "/gems", icon: Sparkles },
];

const recent = [
  "Project brainstorm ideas",
  "Travel itinerary for Japan",
  "Explain quantum computing",
  "Resume feedback draft",
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo.url} alt="DAP AI" className="h-14 w-14 rounded-xl object-contain" />
          <span className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            DAP AI
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>
            <History className="mr-1.5 h-3.5 w-3.5" /> Recent
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recent.map((t) => (
                <SidebarMenuItem key={t}>
                  <SidebarMenuButton className="text-sm text-muted-foreground hover:text-foreground">
                    <span className="truncate">{t}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/admin"}>
              <Link to="/admin">
                <Cpu />
                <span>Admin</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/settings"}>
              <Link to="/settings">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/help">
                <HelpCircle />
                <span>Help</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
