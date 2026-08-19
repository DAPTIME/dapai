/**
 * The three selectable DAP AI models, shared by the composer, the server
 * functions and the admin console.
 *
 * Tier gating:
 *   free                → Lite only
 *   go                  → Lite + Pro Lite
 *   pro / exclusive     → all three
 */
import { TIER_RANK, type Tier } from "@/lib/tier-rank";
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

/**
 * Which model an account actually gets, given what the picker asked for.
 *
 * The picker may only ever move *down* the ladder: a request is honoured
 * when the account's plan reaches the model's minTier, and otherwise falls
 * back to the best model the plan does reach. A Free account asking for
 * "DAP AI 4 Pro" gets Lite — the profile tier is the ceiling, and this is
 * the only place that decides it.
 *
 * This lived twice, inline, in api/chat.ts and chats.functions.ts. The two
 * copies agreed, but nothing made them: they are the rule that stops the
 * picker being an authorisation bypass, so they belong in one function that
 * can be exercised on its own.
 */
export function effectiveModelFor(tier: Tier, requested: string | undefined): ModelId {
  const info = modelInfo(requested ?? "");
  if (info && TIER_RANK[tier] >= TIER_RANK[info.minTier]) return info.id;
  return bestModelFor(tier);
}

/**
 * The strongest model a plan may use.
 *
 * Both fallbacks land here. For a request the plan cannot have, this is the
 * nearest thing it can — Free asking for Pro gets Lite, Go gets Pro Lite.
 * For a client that sent no model at all (an older bundle), it is what that
 * account had before the picker was wired up, rather than silently dropping
 * a Pro subscriber to the cheapest model.
 *
 * Derived from MODELS rather than spelled out, for the same reason the
 * maintenance check is: a fourth model or a fifth tier must not be able to
 * reintroduce a hand-written table that is subtly wrong.
 */
export function bestModelFor(tier: Tier): ModelId {
  let best: ModelInfo | undefined;
  for (const m of MODELS) {
    if (TIER_RANK[tier] < TIER_RANK[m.minTier]) continue;
    if (!best || TIER_RANK[m.minTier] > TIER_RANK[best.minTier]) best = m;
  }
  return best?.id ?? "dap-ai-lite";
}

/**
 * The exact string the orchestrator routes on.
 *
 * It matches on the substrings "lite" and "pro lite", so this must be the
 * display name verbatim — not lowercased, not the internal id, not
 * abbreviated. Everything that calls the orchestrator goes through here so
 * there is one place to be wrong.
 */
export function orchestratorModelName(id: ModelId): string {
  return modelInfo(id)!.label;
}
