export const FEATURE_KEYS = [
  "account",
  "settings",
  "security",
  "help",
  "terms",
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
  "nav_games",
  "nav_settings",
  "nav_help",
  "nav_terms",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  account: "Account page",
  settings: "Settings page",
  security: "Security page",
  help: "Help page",
  terms: "Terms page",
  games: "Games (DAP Arcade)",
  game_2048: "2048",
  game_snake: "Snake",
  game_daptrack: "DAP Track",
  game_river: "River Crosser",
  game_flappy: "Flappy",
  game_breakout: "Brick Breaker",
  nav_games: "Arcade",
  nav_settings: "Settings",
  nav_help: "Help",
  nav_terms: "Terms",
};

/** Which toggles belong together in the admin console. */
export const FEATURE_GROUPS = {
  pages: [
    "account",
    "settings",
    "security",
    "help",
    "terms",
    "games",
  ],
  sidebar: [
    "nav_games",
    "nav_settings",
    "nav_help",
    "nav_terms",
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
