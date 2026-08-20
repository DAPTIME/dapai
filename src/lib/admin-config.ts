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
  // Sidebar visibility. Deliberately separate from the page flags above: a
  // page flag turns the feature off for everyone, these only decide whether
  // the entry is listed in the sidebar. Hiding a link and closing a page
  // are different intentions.
  "nav_daps",
  "nav_rooms",
  "nav_games",
  "nav_chats",
  "nav_settings",
  "nav_help",
  "nav_terms",
  "nav_about",
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
  nav_daps: "Custom AI's",
  nav_rooms: "Study Rooms",
  nav_games: "Arcade",
  nav_chats: "Chat history list",
  nav_settings: "Settings",
  nav_help: "Help",
  nav_terms: "Terms",
  nav_about: "About DAP AI",
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
  sidebar: [
    "nav_daps",
    "nav_rooms",
    "nav_games",
    "nav_chats",
    "nav_settings",
    "nav_help",
    "nav_terms",
    "nav_about",
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