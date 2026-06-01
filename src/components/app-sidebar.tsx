import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  MessageSquarePlus,
  Compass,
  Sparkles,
  History,
  Settings,
  HelpCircle,
  Cpu,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import {
  createThread,
  deleteThread,
  listThreads,
  type Thread,
} from "@/lib/chats";

const main = [
  { title: "Explore", url: "/explore", icon: Compass },
  { title: "Gems", url: "/gems", icon: Sparkles },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    const refresh = () => setThreads(listThreads());
    refresh();
    window.addEventListener("dap:threads-changed", refresh);
    return () => window.removeEventListener("dap:threads-changed", refresh);
  }, []);

  const onNewChat = () => {
    const t = createThread();
    navigate({ to: "/c/$threadId", params: { threadId: t.id } });
  };

  const onDelete = (id: string) => {
    deleteThread(id);
    if (pathname === `/c/${id}`) navigate({ to: "/" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={logo.url}
            alt="DAP AI"
            className="h-14 w-14 rounded-xl object-contain"
          />
          <span className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            DAP AI
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onNewChat}>
                  <MessageSquarePlus />
                  <span>New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
            <History className="mr-1.5 h-3.5 w-3.5" /> Chats
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {threads.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No chats yet
                </div>
              )}
              {threads.map((t) => {
                const active = pathname === `/c/${t.id}`;
                return (
                  <SidebarMenuItem key={t.id}>
                    <div
                      className={`group/row flex items-center gap-1 rounded-md ${
                        active ? "bg-sidebar-accent" : ""
                      }`}
                    >
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="flex-1"
                      >
                        <Link
                          to="/c/$threadId"
                          params={{ threadId: t.id }}
                          className="text-sm"
                        >
                          <span className="truncate">{t.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDelete(t.id);
                        }}
                        className="mr-1 hidden h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground group-hover/row:flex"
                        aria-label="Delete chat"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </SidebarMenuItem>
                );
              })}
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
