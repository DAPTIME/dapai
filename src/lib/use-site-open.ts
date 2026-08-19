/**
 * Is the site usable by whoever is looking, right now?
 *
 * site_status has three values — on, admin, off — and "admin" means the
 * site is closed to everyone except site admins. Answering that needs both
 * the stored status and who the viewer is, so it cannot be read off
 * SiteConfig alone: siteConfig.enabled is "open to the public", which is
 * false in admin mode even for the admin the mode exists for.
 *
 * That mismatch is what made admin mode unusable. The composer had the
 * admin-aware check, but the pages above it passed
 * `offline={!siteConfig.enabled}` down as a prop, which forced the composer
 * offline before its own check ran — so the one person admin mode is for
 * could not type. One hook now answers the question everywhere.
 *
 * The admin lookup is only issued in admin mode, and shares a query key so
 * the several callers on a page make one request between them.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSiteConfig } from "@/lib/site-config";
import { adminAmIAdmin } from "@/lib/admin.functions";
import { siteOpenTo } from "@/lib/site-status";
import { useAuth } from "@/lib/auth";

export function useSiteOpen(): boolean {
  const siteConfig = useSiteConfig();
  const { user } = useAuth();
  const amIAdmin = useServerFn(adminAmIAdmin);
  const adminQuery = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: () => amIAdmin(),
    enabled: !!user && siteConfig.status === "admin",
    staleTime: 60_000,
  });
  return siteOpenTo(siteConfig.status, adminQuery.data?.isAdmin === true);
}
