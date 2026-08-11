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
  Info,
  Users,
  Gamepad2,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import {
  listChats,
  deleteChat,
} from "@/lib/chats.functions";
import { useIncognito } from "@/lib/use-incognito";
import { useSiteConfig } from "@/lib/site-config";

const main = [
  { title: "Custom AI's", url: "/daps", icon: Sparkles },
  { title: "Games", url: "/games", icon: Gamepad2 },
  { title: "Our Team", url: "/team", icon: Users },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const qc = useQueryClient();
  const incognito = useIncognito();
  const list = useServerFn(listChats);
  const remove = useServerFn(deleteChat);

  const siteConfig = useSiteConfig();
  // Admins can switch the arcade off; drop its link when they have.
  const nav = main.filter(
    (item) => item.url !== "/games" || siteConfig.flags.games
  );


  const chatsQuery = useQuery({
    queryKey: ["chats", user?.id ?? "anon"],
    queryFn: () => list(),
    enabled: !!user && !incognito,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { chatId: id } }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      if (isMobile) setOpenMobile(false);
      if (pathname === `/c/${id}`) navigate({ to: "/" });
    },
  });

  const threads = chatsQuery.data ?? [];
  const closeIfMobile = () => { if (isMobile) setOpenMobile(false); };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/" onClick={closeIfMobile} className="group/logo flex items-center gap-2">
          <img
            src={logo.url}
            alt="DAP AI"
            className="h-[3.03rem] w-[3.03rem] rounded-xl object-contain transition-transform duration-300 ease-out group-hover/logo:scale-110 group-hover/logo:rotate-3"
          />
          <span className="text-lg font-semibold tracking-tight transition-colors group-hover/logo:text-primary group-data-[collapsible=icon]:hidden">
            DAP AI
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem className="animate-fade-in" style={{ animationDelay: "0ms" }}>
                <SidebarMenuButton
                  onClick={() => {
                    closeIfMobile();
                    if (!user) {
                      navigate({ to: "/login" });
                      return;
                    }
                    // A new chat starts from the home screen; the thread is
                    // created once the first message is sent.
                    navigate({ to: "/" });
                  }}
                  className="group/item transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110 hover:[&>svg]:rotate-6"
                >
                  <MessageSquarePlus />
                  <span>New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {nav.map((item, i) => (
                <SidebarMenuItem
                  key={item.url}
                  className="animate-fade-in"
                  style={{ animationDelay: `${(i + 1) * 60}ms` }}
                >
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url}
                    className="group/item transition-all duration-200 hover:translate-x-0.5 data-[active=true]:shadow-sm [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110 hover:[&>svg]:rotate-6"
                  >
                    <Link to={item.url} onClick={closeIfMobile}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>


        {user && !incognito && (
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
                            onClick={closeIfMobile}
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
                          className="mr-1 flex h-10 w-10 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 md:hidden md:h-7 md:w-7 md:group-hover/row:flex"
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
              <SidebarMenuButton
                asChild
                isActive={pathname === "/admin"}
                className="transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110 hover:[&>svg]:rotate-6"
              >
                <Link to="/admin" onClick={closeIfMobile}>
                  <Cpu />
                  <span>Admin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === "/settings"}
              className="transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:rotate-45"
            >
              <Link to="/settings" onClick={closeIfMobile}>
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110"
            >
              <Link to="/help" onClick={closeIfMobile}>
                <HelpCircle />
                <span>Help</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === "/terms"}
              className="transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110"
            >
              <Link to="/terms" onClick={closeIfMobile}>
                <Scale />
                <span>Terms</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === "/about-dap-ai"}
              className="transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110"
            >
              <Link to="/about-dap-ai" onClick={closeIfMobile}>
                <Info />
                <span>About DAP AI</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

        </SidebarMenu>
      </SidebarFooter>

    </Sidebar>
  );
}
