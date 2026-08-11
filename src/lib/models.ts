/**
 * The three selectable DAP AI models, shared by the composer, the server
 * functions and the admin console.
 *
 * Tier gating:
 *   free                → Lite only
 *   go                  → Lite + Pro Lite
 *   pro / exclusive     → all three
 */
import type { Tier } from "@/lib/tier-gate";
import type { FeatureKey } from "@/lib/site-config.functions";

export const MODEL_IDS = [
  "dap-ai-lite",
  "dap-ai-pro-lite",
  "dap-ai-1.0",
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

export interface ModelInfo {
  id: ModelId;
  label: string;
  description: string;
  /** Minimum account tier required to select this model. */
  minTier: Tier;
  /** Admin feature flag that turns this model on/off. */
  flag: FeatureKey;
  /** Lite-style backends are text-only and get the no-think prompt. */
  lite: boolean;
}

export const MODELS: ModelInfo[] = [
  {
    id: "dap-ai-lite",
    label: "DAP AI 4 Lite",
    description: "Fast responses and simple answers.",
    minTier: "free",
    flag: "lite_model",
    lite: true,
  },
  {
    id: "dap-ai-pro-lite",
    label: "DAP AI 4 Pro Lite",
    description: "Quick like Lite, sharper answers.",
    minTier: "go",
    flag: "pro_lite_model",
    lite: true,
  },
  {
    id: "dap-ai-1.0",
    label: "DAP AI 4 Pro",
    description: "Our most capable and ambitious model yet.",
    minTier: "pro",
    flag: "pro_model",
    lite: false,
  },
];

export function modelInfo(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}
