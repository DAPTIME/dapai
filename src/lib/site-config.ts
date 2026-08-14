import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLoaderData } from "@tanstack/react-router";
import {
  DEFAULT_SITE_CONFIG,
  getPublicSiteConfig,
  type SiteConfig,
} from "./site-config.functions";

export const SITE_CONFIG_QUERY_KEY = ["site-config"] as const;

/**
 * Admin site state (global switch + feature flags).
 *
 * The value is loaded once in the root route loader, so it's already in the
 * server-rendered HTML — components read it instantly with no loading flash.
 * It's kept fresh in the background so admin toggles land within a minute.
 */
export function useSiteConfig(): SiteConfig {
  const fetchConfig = useServerFn(getPublicSiteConfig);
  const rootData = useLoaderData({ from: "__root__" }) as
    | { siteConfig?: SiteConfig }
    | undefined;
  const initial = rootData?.siteConfig ?? DEFAULT_SITE_CONFIG;

  const query = useQuery({
    queryKey: SITE_CONFIG_QUERY_KEY,
    queryFn: () => fetchConfig(),
    initialData: initial,
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  return query.data ?? initial;
}
