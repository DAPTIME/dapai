export { MODEL_IDS, type ModelId } from "@/lib/models";

export const FEATURE_KEYS = [
  "pro_model",
  "pro_lite_model",
  "lite_model",
  "daps",
  "team",
  "games",
  "game_2048",
  "game_snake",
  "game_spacewar",
  "game_daptrack",
  "game_river",
  "game_flappy",
  "game_breakout",
  "game_stunt",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  pro_model: "DAP AI 4 Pro",
  pro_lite_model: "DAP AI 4 Pro Lite",
  lite_model: "DAP AI 4 Lite",
  daps: "DAPs (Custom assistants)",
  team: "Our Team page",
  games: "Games (DAP Arcade)",
  game_2048: "2048",
  game_snake: "Snake",
  game_spacewar: "Spacewar",
  game_daptrack: "DAP Track",
  game_river: "River Crosser",
  game_flappy: "Flappy",
  game_breakout: "Brick Breaker",
  game_stunt: "Stunt Racer",
};

/** Which toggles belong together in the admin console. */
export const FEATURE_GROUPS = {
  models: ["pro_model", "pro_lite_model", "lite_model"],
  pages: ["daps", "team", "games"],
  games: [
    "game_2048",
    "game_snake",
    "game_spacewar",
    "game_daptrack",
    "game_river",
    "game_flappy",
    "game_breakout",
    "game_stunt",
  ],
} as const satisfies Record<string, readonly FeatureKey[]>;