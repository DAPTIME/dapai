/**
 * Per-plan allowances, in one place.
 *
 * These numbers were scattered across whichever module happened to need
 * them — the chat-history cap lived as a private const inside
 * chats.functions.ts, so no screen could tell anyone what their limit was.
 * Anything that limits an account by plan belongs here, and the account
 * page reads from it, so the figure a person is shown is the figure that
 * is enforced.
 *
 * The database holds the same numbers in public.usage_limit() and does the
 * actual enforcing. That duplication is deliberate and the reason is the
 * same one behind the track quotas: the app writes through the caller's own
 * key under RLS, so a limit checked only in TypeScript can be stepped
 * around by posting straight to PostgREST. This copy exists so the UI can
 * say "9 of 15 left" before anyone hits the wall. Keep the two in step.
 */
import type { Tier } from "@/lib/tier-rank";
import type { ModelId } from "@/lib/models";

/**
 * How many chats stay in history. Older ones are pruned when a new chat
 * starts, so this is a rolling window rather than a hard stop.
 */
export const CHAT_HISTORY_LIMIT: Record<Tier, number> = {
  free: 5,
  go: 10,
  pro: 25,
  exclusive: 100,
};

/** Infinity means unlimited, so callers compare without a null check. */
const INF = Number.POSITIVE_INFINITY;

export type TierLimits = {
  /** Usage tokens per UTC day. */
  tokensPerDay: number;
  /** Usage tokens per rolling week, anchored to the first prompt of it. */
  tokensPerWeek: number;
  /** Longest prompt accepted, in model tokens. */
  maxPromptTokens: number;
  /** Cap handed to the backend for its reply. */
  maxResponseTokens: number;
  /** Images that may be attached across a day. */
  imagesPerDay: number;
  /** Web search available. */
  webSearch: boolean;
  /** Stored memory sent with each request. */
  memory: boolean;
};

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    tokensPerDay: 15,
    tokensPerWeek: 60,
    maxPromptTokens: 1_000,
    maxResponseTokens: 2_000,
    imagesPerDay: 2,
    webSearch: false,
    memory: false,
  },
  go: {
    tokensPerDay: 25,
    tokensPerWeek: 80,
    maxPromptTokens: 2_000,
    maxResponseTokens: 3_000,
    imagesPerDay: 5,
    webSearch: true,
    memory: true,
  },
  pro: {
    tokensPerDay: 50,
    tokensPerWeek: 400,
    maxPromptTokens: 4_000,
    maxResponseTokens: 5_000,
    imagesPerDay: 8,
    webSearch: true,
    memory: true,
  },
  exclusive: {
    tokensPerDay: INF,
    tokensPerWeek: INF,
    maxPromptTokens: 5_000,
    maxResponseTokens: 7_000,
    imagesPerDay: INF,
    webSearch: true,
    memory: true,
  },
};

/** At most one image may be attached to a single prompt, on every plan. */
export const MAX_IMAGES_PER_PROMPT = 1;

/**
 * The most a single prompt can cost, by model. A heavier model costs more
 * for the same prompt, which is what makes Lite worth choosing when the
 * question is simple.
 */
export const MAX_COST_PER_PROMPT: Record<ModelId, number> = {
  "dap-ai-lite": 2.5,
  "dap-ai-pro-lite": 3.5,
  "dap-ai-1.0": 4.5,
};

/** What attaching an image adds, before the per-model ceiling applies. */
export const IMAGE_SURCHARGE = 1;

/**
 * Rough token count for a piece of text.
 *
 * Deliberately an estimate: the real count depends on the model's
 * tokeniser, which lives on the backend, and shipping a tokeniser to the
 * browser to bill someone a quarter of a token is not a good trade. Four
 * characters per token is the usual approximation for English and errs
 * slightly high on code, which is the safe direction for a limit.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}

/**
 * What a prompt costs, in usage tokens.
 *
 * The cost scales with how much of *this tier's own* prompt budget the
 * message uses, in quarter bands, then an image adds a fixed amount, and
 * the whole thing is capped at the model's ceiling. Scaling against the
 * tier's own budget rather than an absolute length is what stops a Free
 * user's 900-token question costing the same as a Pro user's — they are
 * both using most of what they were given.
 *
 * Exclusive is not charged at all, so its ledger stays at zero rather than
 * counting up toward a limit that will never arrive.
 */
export function costOfPrompt(opts: {
  tier: Tier;
  model: ModelId;
  promptTokens: number;
  hasImage: boolean;
}): number {
  if (opts.tier === "exclusive") return 0;

  const max = MAX_COST_PER_PROMPT[opts.model] ?? 2.5;
  const cap = TIER_LIMITS[opts.tier].maxPromptTokens;
  const band = Math.min(4, Math.max(1, Math.ceil((opts.promptTokens / cap) * 4)));
  const text = (band / 4) * max;
  const raw = Math.min(text + (opts.hasImage ? IMAGE_SURCHARGE : 0), max);

  // Quarter-token granularity keeps the numbers readable on the account
  // page; rounding up means the ledger never under-charges.
  return Math.ceil(raw * 4) / 4;
}

export const isUnlimited = (n: number) => !Number.isFinite(n);

/**
 * Is this error "the ledger isn't installed yet" rather than "you're out"?
 *
 * The allowance lives in a database function. If that function is missing
 * — the migration hasn't run, or it's a fresh environment — the honest
 * reading is that no limit has been configured, not that the caller has
 * exhausted one. Blocking there would take chat down on every deployment
 * whose migrations lag the code by a few minutes, which is a worse outcome
 * than briefly not counting.
 *
 * A real refusal still fails closed: this only matches the function being
 * absent (42883 from Postgres, PGRST202 from PostgREST's schema cache).
 */
export function isLedgerMissing(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  if (err.code === "42883" || err.code === "PGRST202") return true;
  return /could not find the function|does not exist/i.test(err.message ?? "");
}
