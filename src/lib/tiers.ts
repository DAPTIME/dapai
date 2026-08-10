/**
 * Tier + usage-token configuration (client-safe: no secrets, no server imports).
 *
 * Four tiers: free, go, pro, exclusive. Tiers are assigned by an admin on the
 * user's profile row — there is no checkout flow.
 *
 * Usage tokens are an abstract budget, NOT model tokens. Each user message
 * costs 1.0–4.5 usage tokens depending on how long it is relative to that
 * tier's own max prompt size (see USAGE_COST_BANDS).
 *
 * Reset policy: the daily total resets at 00:00 UTC. The weekly total uses a
 * FIXED week that starts Monday 00:00 UTC (not rolling).
 */

export const TIERS = ["free", "go", "pro", "exclusive"] as const;
export type Tier = (typeof TIERS)[number];

export interface TierConfig {
  id: Tier;
  /** Product name shown to the user. */
  productName: string;
  tagline: string | null;
  /** Usage tokens per day / per fixed UTC week. null = unlimited. */
  dailyTokens: number | null;
  weeklyTokens: number | null;
  maxPromptTokens: number;
  maxResponseTokens: number;
  /** Expert-routing cap. Not wired to any UI yet — stored for later. */
  expertRoutingCap: number;
  /** Images allowed in a single response. null = no per-response cap. */
  maxImagesPerResponse: number | null;
  /** Images per day. null = unlimited. */
  maxImagesPerDay: number | null;
  webSearch: boolean;
  memory: boolean;
  imageQuality: "standard" | "best";
}

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  free: {
    id: "free",
    productName: "DAP AI 4 Lite",
    tagline: null,
    dailyTokens: 15,
    weeklyTokens: 60,
    maxPromptTokens: 1000,
    maxResponseTokens: 2000,
    expertRoutingCap: 0,
    maxImagesPerResponse: 1,
    maxImagesPerDay: 2,
    webSearch: false,
    memory: false,
    imageQuality: "standard",
  },
  go: {
    id: "go",
    productName: "DAP AI 4 Pro Lite",
    tagline: "Smarter, fast responses",
    dailyTokens: 25,
    weeklyTokens: 80,
    maxPromptTokens: 2000,
    maxResponseTokens: 3000,
    expertRoutingCap: 0,
    maxImagesPerResponse: 2,
    maxImagesPerDay: 5,
    webSearch: true,
    memory: true,
    imageQuality: "standard",
  },
  pro: {
    id: "pro",
    productName: "DAP AI 4 Pro",
    tagline: "Smartest responses — takes the longest time",
    dailyTokens: 50,
    weeklyTokens: 400,
    maxPromptTokens: 4000,
    maxResponseTokens: 5000,
    expertRoutingCap: 0,
    maxImagesPerResponse: 3,
    maxImagesPerDay: 8,
    webSearch: true,
    memory: true,
    imageQuality: "standard",
  },
  exclusive: {
    id: "exclusive",
    productName: "DAP AI 4 Pro",
    tagline: "Smartest responses — takes the longest time",
    dailyTokens: null,
    weeklyTokens: null,
    maxPromptTokens: 5000,
    maxResponseTokens: 7000,
    expertRoutingCap: 0,
    maxImagesPerResponse: null,
    maxImagesPerDay: null,
    webSearch: true,
    memory: true,
    imageQuality: "best",
  },
};

export function tierConfig(tier: string | null | undefined): TierConfig {
  return TIER_CONFIG[(tier ?? "free") as Tier] ?? TIER_CONFIG.free;
}

/** Where the "Contact Us" button for Exclusive goes. */
export const EXCLUSIVE_CONTACT_URL = "https://linktr.ee/daptime";

/** Exact user-facing copy — do not paraphrase. */
export const MSG_PROMPT_TOO_LONG =
  "Sorry, this prompt is too long. Please edit it or consider upgrading your plan.";
export const MSG_SAFETY_BLOCKED =
  "Sorry, my safety filters blocked that request. Please edit the prompt and send it again.";

/**
 * Cost bands: fraction of the tier's max_prompt_tokens → usage-token cost.
 * Over 100% is rejected before sending (MSG_PROMPT_TOO_LONG).
 */
export const USAGE_COST_BANDS: { upTo: number; cost: number }[] = [
  { upTo: 0.125, cost: 1.0 },
  { upTo: 0.25, cost: 1.5 },
  { upTo: 0.375, cost: 2.0 },
  { upTo: 0.5, cost: 2.5 },
  { upTo: 0.625, cost: 3.0 },
  { upTo: 0.75, cost: 3.5 },
  { upTo: 1.0, cost: 4.5 },
];

/**
 * Rough token estimate (~4 chars per token). Good enough for budgeting; the
 * real model tokenizer lives in the backend and isn't reachable from here.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}

/** null = over the cap, i.e. the message must be rejected. */
export function usageCostFor(text: string, tier: Tier | string): number | null {
  const cfg = tierConfig(tier);
  const ratio = estimateTokens(text) / cfg.maxPromptTokens;
  if (ratio > 1) return null;
  for (const band of USAGE_COST_BANDS) {
    if (ratio <= band.upTo) return band.cost;
  }
  return null;
}

/** Next 00:00 UTC, as a friendly UTC time string. */
export function nextDailyResetLabel(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return `${d.toUTCString().replace("GMT", "UTC")}`;
}

/** Start of the next fixed UTC week (Monday 00:00 UTC). */
export function nextWeeklyResetLabel(): string {
  const d = new Date();
  const daysUntilMonday = (8 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  d.setUTCHours(0, 0, 0, 0);
  return `${d.toUTCString().replace("GMT", "UTC")}`;
}
