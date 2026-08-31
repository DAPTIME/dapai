import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
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
import type { FeatureKey } from "@/lib/site-config.functions";

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

  /* A flag that is explicitly off hides the item. Anything the config
     doesn't mention stays visible, so a failed config read leaves the
     sidebar intact rather than emptying it. */
  const hiddenByAdmin = (...flags: FeatureKey[]) =>
    flags.some((f) => siteConfig.flags[f] === false);

  /* Hidden means hidden for everyone — that is what the toggle is for.
     An admin still sees the entry, dimmed and marked, because hiding
     Settings should not also remove the admin's own way back to it. */
  const showEntry = (...flags: FeatureKey[]) => !hiddenByAdmin(...flags) || isAdmin;

  const closeIfMobile = () => { if (isMobile) setOpenMobile(false); };


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
