/**
 * One public read that returns the whole admin-controlled site state:
 * the global on/off switch plus every feature flag.
 *
 * This exists so the app never needs two (or six) separate round trips to
 * find out whether the admin disabled something — it's a single query,
 * fetched once during SSR and shared by every component.
 */
import { createServerFn } from "@tanstack/react-start";
import { parseSiteStatus, type SiteStatus } from "@/lib/site-status";

export const FEATURE_KEYS = [
  "ai_enabled",
  "pro_model",
  "pro_lite_model",
  "lite_model",
  "daps",
  "rooms",
  "account",
  "settings",
  "security",
  "help",
  "terms",
  "about",
  "games",
  "game_2048",
  "game_snake",
  "game_daptrack",
  "game_river",
  "game_flappy",
  "game_breakout",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface SiteConfig {
  /** True when the site is open to everyone. False in "admin" and "off". */
  enabled: boolean;
  /** The raw three-way setting, so admins can be let through "admin". */
  status: SiteStatus;
  flags: Record<FeatureKey, boolean>;
  /** Admin-authored text shown in the typing bar while DAP AI is offline. */
  offlineMessage: string;
}

export const DEFAULT_OFFLINE_MESSAGE =
  "DAP AI is offline right now — check back soon.";

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  enabled: true,
  status: "on",
  flags: {
    ai_enabled: true,
    pro_model: true,
    pro_lite_model: true,
    lite_model: true,
    daps: true,
    rooms: true,
    account: true,
    settings: true,
    security: true,
    help: true,
    terms: true,
    about: true,
    games: true,
    game_2048: true,
    game_snake: true,
    game_daptrack: true,
    game_river: true,
    game_flappy: true,
    game_breakout: true,
  },
  offlineMessage: DEFAULT_OFFLINE_MESSAGE,
};

export const getPublicSiteConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteConfig> => {
    const config: SiteConfig = {
      enabled: true,
      status: "on",
      flags: { ...DEFAULT_SITE_CONFIG.flags },
      offlineMessage: DEFAULT_OFFLINE_MESSAGE,
    };
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const ids = [
        "site_status",
        "offline_message",
        ...FEATURE_KEYS.map((k) => `feature_${k}`),
      ];
      const { data } = await supabaseAdmin
        .from("ai_settings")
        .select("id, system_prompt")
        .in("id", ids);
      for (const row of data ?? []) {
        if (row.id === "offline_message") {
          const msg = (row.system_prompt ?? "").trim();
          if (msg) config.offlineMessage = msg;
          continue;
        }
        if (row.id === "site_status") {
          config.status = parseSiteStatus(row.system_prompt);
          config.enabled = config.status === "on";
          continue;
        }
        const on = (row.system_prompt ?? "on").trim().toLowerCase() !== "off";
        const key = row.id.replace(/^feature_/, "") as FeatureKey;
        if ((FEATURE_KEYS as readonly string[]).includes(key)) {
          config.flags[key] = on;
        }
      }
    } catch (e) {

      // Never let a settings lookup take the site down — fail open.
      console.error("[site-config] lookup failed:", (e as Error).message);
    }
    return config;
  }
);
