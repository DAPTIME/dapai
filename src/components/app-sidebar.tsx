import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Gamepad2,
  Grid3x3,
  Users2,
  PenSquare,
  Settings,
  HelpCircle,
  Scale,
  Cpu,
  User as UserIcon,
} from "lucide-react";

import { adminAmIAdmin } from "@/lib/admin.functions";
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
import { useSiteConfig } from "@/lib/site-config";
import { useBeta } from "@/lib/use-beta";
import type { FeatureKey } from "@/lib/site-config.functions";
import { topGames } from "@/lib/game-catalog";

/** Shown to an admin beside an entry the console is hiding from everyone. */
function HiddenMark() {
  return (
    <span
      className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      title="Hidden from everyone — turn it back on under Sidebar, or Pages &amp; features"
    >
      Hidden
    </span>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();

  // Same query key as the account menu, so both read one cached answer.
  const amIAdmin = useServerFn(adminAmIAdmin);
  const adminQuery = useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => amIAdmin(),
    enabled: !!user,
    retry: false,
  });
  const isAdmin = adminQuery.data?.isAdmin === true;

  const siteConfig = useSiteConfig();
  const beta = useBeta();

  /* A flag that is explicitly off hides the item. Anything the config
     doesn't mention stays visible, so a failed config read leaves the
     sidebar intact rather than emptying it. */
  const hiddenByAdmin = (...flags: FeatureKey[]) =>
    flags.some((f) => siteConfig.flags[f] === false);

  /* Hidden means hidden for everyone — that is what the toggle is for.
     An admin still sees the entry, dimmed and marked, because hiding
     Settings should not also remove the admin's own way back to it. */
  const showEntry = (...flags: FeatureKey[]) => !hiddenByAdmin(...flags) || isAdmin;

  /* A beta the account cannot reach is not listed at all. */
  const betaBlocks = (flag: FeatureKey) => beta(flag).lockedByBeta && !isAdmin;

  const closeIfMobile = () => { if (isMobile) setOpenMobile(false); };

  const topPicks = topGames(6);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/" onClick={closeIfMobile} className="group/logo flex items-center gap-2">
          <img
            src={logo.url}
            alt="DAP Games"
            className="h-[3.03rem] w-[3.03rem] rounded-xl object-contain transition-transform duration-300 ease-out group-hover/logo:scale-110 group-hover/logo:rotate-3"
          />
          <span className="text-lg font-semibold tracking-tight transition-colors group-hover/logo:text-primary group-data-[collapsible=icon]:hidden">
            DAP Games
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {showEntry("games", "nav_games") && !betaBlocks("games") && (
          <SidebarGroup>
            <SidebarGroupLabel>Top Games</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {topPicks.map((g, i) => (
                  <SidebarMenuItem
                    key={g.slug}
                    className="animate-fade-in"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === g.route || pathname.startsWith(`${g.route}/`)}
                      className="group/item transition-all duration-200 hover:translate-x-0.5 data-[active=true]:shadow-sm"
                    >
                      <Link to={g.route} onClick={closeIfMobile}>
                        <span aria-hidden className="text-base leading-none">{g.emoji}</span>
                        <span>{g.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {showEntry("games", "nav_games") && !betaBlocks("games") && (
                <SidebarMenuItem className="animate-fade-in">
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/games"}
                    className="group/item transition-all duration-200 hover:translate-x-0.5 data-[active=true]:shadow-sm [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110 hover:[&>svg]:rotate-6"
                  >
                    <Link
                      to="/games"
                      onClick={closeIfMobile}
                      className={hiddenByAdmin("games", "nav_games") ? "opacity-60" : undefined}
                    >
                      <Grid3x3 />
                      <span>All Games</span>
                      {hiddenByAdmin("games", "nav_games") && <HiddenMark />}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem className="animate-fade-in">
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/games/daptrack/browse"}
                  className="group/item transition-all duration-200 hover:translate-x-0.5 data-[active=true]:shadow-sm [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110 hover:[&>svg]:rotate-6"
                >
                  <Link to="/games/daptrack/browse" onClick={closeIfMobile}>
                    <Users2 />
                    <span>Community Tracks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem className="animate-fade-in">
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/games/daptrack/editor"}
                  className="group/item transition-all duration-200 hover:translate-x-0.5 data-[active=true]:shadow-sm [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110 hover:[&>svg]:rotate-6"
                >
                  <Link
                    to="/games/daptrack/editor"
                    onClick={() => {
                      closeIfMobile();
                      if (!user) navigate({ to: "/login" });
                    }}
                  >
                    <PenSquare />
                    <span>Track Editor</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <SidebarMenu>
          {user && showEntry("account") && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/account"}
                className="transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110"
              >
                <Link to="/account" onClick={closeIfMobile}>
                  <UserIcon />
                  <span>Account</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {showEntry("settings", "nav_settings") && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/settings"}
                className="transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:rotate-45"
              >
                <Link
                  to="/settings"
                  onClick={closeIfMobile}
                  className={hiddenByAdmin("settings", "nav_settings") ? "opacity-60" : undefined}
                >
                  <Settings />
                  <span>Settings</span>
                  {hiddenByAdmin("settings", "nav_settings") && <HiddenMark />}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {showEntry("help", "nav_help") && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/help"}
                className="transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110"
              >
                <Link
                  to="/help"
                  onClick={closeIfMobile}
                  className={hiddenByAdmin("help", "nav_help") ? "opacity-60" : undefined}
                >
                  <HelpCircle />
                  <span>Help</span>
                  {hiddenByAdmin("help", "nav_help") && <HiddenMark />}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {showEntry("terms", "nav_terms") && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/terms"}
                className="transition-all duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110"
              >
                <Link
                  to="/terms"
                  onClick={closeIfMobile}
                  className={hiddenByAdmin("terms", "nav_terms") ? "opacity-60" : undefined}
                >
                  <Scale />
                  <span>Terms</span>
                  {hiddenByAdmin("terms", "nav_terms") && <HiddenMark />}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {isAdmin && (
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
        </SidebarMenu>
      </SidebarFooter>

    </Sidebar>
  );
}
