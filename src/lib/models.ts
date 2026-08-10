/**
 * Client-safe catalog of the three selectable DAP AI models.
 *
 * Access rules (also re-enforced server-side in chats.functions.ts):
 *   DAP AI 4 Lite      → everyone, including signed-out visitors
 *   DAP AI 4 Pro Lite  → Go, Pro, Exclusive
 *   DAP AI 4 Pro       → Pro, Exclusive
 *
 * The admin console can take any of the three offline; that flag wins over
 * tier access.
 */
import type { Tier } from "@/lib/tiers";

export type ChatModelId = "dap-ai-1.0" | "dap-ai-pro-lite" | "dap-ai-lite";

export interface ChatModelInfo {
  id: ChatModelId;
  label: string;
  short: string;
  description: string;
  /** Tiers allowed to pick this model. */
  tiers: Tier[];
  /** Feature-flag key in the admin console. */
  flag: "pro_model" | "pro_lite_model" | "lite_model";
  /** Lite has no vision/web-search support yet. */
  supportsImages: boolean;
}

export const CHAT_MODELS: ChatModelInfo[] = [
  {
    id: "dap-ai-lite",
    label: "DAP AI 4 Lite",
    short: "4 Lite",
    description: "Fastest. Great for simple questions and quick answers.",
    tiers: ["free", "go", "pro", "exclusive"],
    flag: "lite_model",
    supportsImages: false,
  },
  {
    id: "dap-ai-pro-lite",
    label: "DAP AI 4 Pro Lite",
    short: "4 Pro Lite",
    description: "Smarter answers at Lite speed, with web search and memory.",
    tiers: ["go", "pro", "exclusive"],
    flag: "pro_lite_model",
    supportsImages: true,
  },
  {
    id: "dap-ai-1.0",
    label: "DAP AI 4 Pro",
    short: "4 Pro",
    description: "Our most capable model. Thinks the longest, answers the best.",
    tiers: ["pro", "exclusive"],
    flag: "pro_model",
    supportsImages: true,
  },
];

export function modelInfo(id: string | null | undefined): ChatModelInfo {
  return (
    CHAT_MODELS.find((m) => m.id === id) ??
    CHAT_MODELS.find((m) => m.id === "dap-ai-lite")!
  );
}

export function isModelAllowedForTier(
  model: ChatModelInfo,
  tier: Tier,
  signedIn: boolean
): boolean {
  if (!signedIn) return model.id === "dap-ai-lite";
  return model.tiers.includes(tier);
}

/** Highest model this tier can use, ignoring admin flags. */
export function bestModelForTier(tier: Tier, signedIn: boolean): ChatModelId {
  const allowed = CHAT_MODELS.filter((m) =>
    isModelAllowedForTier(m, tier, signedIn)
  );
  return (allowed[allowed.length - 1] ?? CHAT_MODELS[0]).id;
}

/**
 * Resolve the model to actually use: prefers the saved choice, falls back to
 * the best model this account can reach that the admin hasn't disabled.
 */
export function resolveModelChoice(opts: {
  saved: string | null;
  tier: Tier;
  signedIn: boolean;
  flags: Partial<Record<ChatModelInfo["flag"], boolean>> | undefined;
}): ChatModelId {
  const enabled = (m: ChatModelInfo) => opts.flags?.[m.flag] !== false;
  const usable = CHAT_MODELS.filter(
    (m) => isModelAllowedForTier(m, opts.tier, opts.signedIn) && enabled(m)
  );
  const saved = usable.find((m) => m.id === opts.saved);
  if (saved) return saved.id;
  const best = usable[usable.length - 1];
  if (best) return best.id;
  return bestModelForTier(opts.tier, opts.signedIn);
}

export const MODEL_STORAGE_KEY = "dap.model";
