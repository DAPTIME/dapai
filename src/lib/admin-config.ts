export const MODEL_IDS = ["dap-ai-1.0", "dap-ai-lite"] as const;

export const FEATURE_KEYS = [
  "pro_model",
  "lite_model",
  "daps",
  "team",
  "games",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  pro_model: "DAP AI 3.2 (Pro)",
  lite_model: "DAP AI Lite",
  daps: "DAPs (Custom assistants)",
  team: "Our Team page",
  games: "Games (DAP Arcade)",
};