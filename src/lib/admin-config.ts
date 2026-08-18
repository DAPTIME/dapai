export { MODEL_IDS, type ModelId } from "@/lib/models";

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

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  ai_enabled: "AI Enabled (master switch)",
  pro_model: "DAP AI 4 Pro",
  pro_lite_model: "DAP AI 4 Pro Lite",
  lite_model: "DAP AI 4 Lite",
  daps: "DAPs (Custom assistants)",
  rooms: "Study Rooms",
  account: "Account page",
  settings: "Settings page",
  security: "Security page",
  help: "Help page",
  terms: "Terms page",
  about: "About DAP AI page",
  games: "Games (DAP Arcade)",
  game_2048: "2048",
  game_snake: "Snake",
  game_daptrack: "DAP Track",
  game_river: "River Crosser",
  game_flappy: "Flappy",
  game_breakout: "Brick Breaker",
};

/** Which toggles belong together in the admin console. */
export const FEATURE_GROUPS = {
  models: ["ai_enabled", "pro_model", "pro_lite_model", "lite_model"],
  pages: [
    "daps",
    "rooms",
    "account",
    "settings",
    "security",
    "help",
    "terms",
    "about",
    "games",
  ],
  games: [
    "game_2048",
    "game_snake",
    "game_daptrack",
    "game_river",
    "game_flappy",
    "game_breakout",
  ],
} as const satisfies Record<string, readonly FeatureKey[]>;