export const MODEL_IDS = ["dap-ai-1.0", "dap-ai-pro-lite", "dap-ai-lite"] as const;

export const FEATURE_KEYS = [
  "pro_model",
  "pro_lite_model",
  "lite_model",
  "daps",
  "team",
  "games",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  pro_model: "DAP AI 4 Pro",
  pro_lite_model: "DAP AI 4 Pro Lite",
  lite_model: "DAP AI 4 Lite",
  daps: "DAPs (Custom assistants)",
  team: "Our Team page",
  games: "Games (DAP Arcade)",
};