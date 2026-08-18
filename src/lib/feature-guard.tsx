import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSiteConfig } from "@/lib/site-config";
import { FEATURE_LABELS, type FeatureKey } from "@/lib/admin-config";

/** Which flag owns each arcade route, so a single game can be turned off. */
export const GAME_FLAGS: Record<string, FeatureKey> = {
  "/games/2048": "game_2048",
  "/games/snake": "game_snake",
  "/games/daptrack": "game_daptrack",
  "/games/river": "game_river",
  "/games/flappy": "game_flappy",
  "/games/breakout": "game_breakout",
};

const PAGE_FLAGS: Array<[string, FeatureKey]> = [
  ["/daps", "daps"],
  ["/rooms", "rooms"],
  ["/team", "team"],
  ["/account", "account"],
  ["/settings", "settings"],
  ["/security", "security"],
  ["/help", "help"],
  ["/terms", "terms"],
  ["/about-dap-ai", "about"],
  ["/games", "games"],
];

export function pageFlagFor(pathname: string): FeatureKey | null {
  return PAGE_FLAGS.find(([path]) =>
    pathname === path || pathname.startsWith(`${path}/`)
  )?.[1] ?? null;
}

/** The flag for a pathname inside the arcade, if any. */
export function gameFlagFor(pathname: string): FeatureKey | null {
  const hit = Object.keys(GAME_FLAGS).find(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  return hit ? GAME_FLAGS[hit] : null;
}

/**
 * Send someone home the moment the admin turns a feature off — even
 * mid-session — and tell them why. Returns true while the redirect is
 * pending so the caller can stop rendering the feature.
 */
export function useFeatureGuard(key: FeatureKey | null | undefined): boolean {
  const siteConfig = useSiteConfig();
  const navigate = useNavigate();
  const off = !!key && siteConfig.flags[key] === false;
  const label = key ? FEATURE_LABELS[key] : "";

  useEffect(() => {
    if (!off) return;
    toast.info(`${label} is under maintenance right now.`);
    void navigate({ to: "/", replace: true });
  }, [off, label, navigate]);

  return off;
}
