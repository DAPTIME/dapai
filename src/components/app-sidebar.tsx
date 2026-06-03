import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageSquarePlus,
  Sparkles,
  History,
  Settings,
  HelpCircle,
  Cpu,
  Trash2,
  Scale,
  Users,
} from "lucide-react";

const ADMIN_EMAIL = "pancholiadevansh@gmail.com";
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
import { useAuth } from "@/lib/auth";
import {
  listChats,
  createChat,
  deleteChat,
} from "@/lib/chats.functions";

const main = [
  { title: "DAPs", url: "/daps", icon: Sparkles },
  { title: "Our Team", url: "/team", icon: Users },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listChats);
  const create = useServerFn(createChat);
  const remove = useServerFn(deleteChat);

  const chatsQuery = useQuery({
    queryKey: ["chats", user?.id ?? "anon"],
    queryFn: () => list(),
    enabled: !!user,
  });

  const createMut = useMutation({
    mutationFn: () => create(),
    onSuccess: (chat) => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      navigate({ to: "/c/$threadId", params: { threadId: chat.id } });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { chatId: id } }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      if (pathname === `/c/${id}`) navigate({ to: "/" });
    },
  });

  const threads = chatsQuery.data ?? [];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={logo.url}
            alt="DAP AI"
            className="h-[3.03rem] w-[3.03rem] rounded-xl object-contain"
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
                <SidebarMenuButton
                  onClick={() => {
                    if (!user) {
                      navigate({ to: "/login" });
                      return;
                    }
                    createMut.mutate();
                  }}
                >
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

        {user && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>
              <History className="mr-1.5 h-3.5 w-3.5" /> Chats
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {threads.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {chatsQuery.isLoading ? "Loading…" : "No chats yet"}
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
                          disabled={deleteMut.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteMut.mutate(t.id);
                          }}
                          className="mr-1 flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 md:hidden md:h-7 md:w-7 md:group-hover/row:flex"
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
        )}
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <SidebarMenu>
          {user?.email?.toLowerCase() === ADMIN_EMAIL && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/admin"}>
                <Link to="/admin">
                  <Cpu />
                  <span>Admin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
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
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/terms"}>
              <Link to="/terms">
                <Scale />
                <span>Terms</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
