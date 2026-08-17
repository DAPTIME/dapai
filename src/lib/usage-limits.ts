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
 * say what is left before anyone hits the wall. Keep the two in step.
 */
import type { Tier } from "@/lib/tier-rank";

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
  /** Usage tokens per week, resetting Monday 00:00 UTC. */
  tokensPerWeek: number;
  /** Longest prompt accepted, in model tokens. Also the cost-curve base. */
  maxPromptTokens: number;
  /** Cap handed to the orchestrator for its reply. */
  maxResponseTokens: number;
  /** Images that may be generated across a UTC day. */
  imagesPerDay: number;
  /** Diffusion steps for this tier's images; 0 when it cannot make any. */
  imageSteps: number;
  /** Web search available. */
  webSearch: boolean;
  /** Stored memory sent with each request. */
  memory: boolean;
};

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    tokensPerDay: 10,
    tokensPerWeek: 40,
    maxPromptTokens: 1_000,
    maxResponseTokens: 3_000,
    imagesPerDay: 0,
    imageSteps: 0,
    webSearch: false,
    memory: false,
  },
  go: {
    tokensPerDay: 25,
    tokensPerWeek: 100,
    maxPromptTokens: 2_500,
    maxResponseTokens: 5_000,
    imagesPerDay: 3,
    imageSteps: 2,
    webSearch: true,
    memory: true,
  },
  pro: {
    tokensPerDay: 50,
    tokensPerWeek: 400,
    maxPromptTokens: 4_000,
    maxResponseTokens: 7_500,
    imagesPerDay: 8,
    imageSteps: 3,
    webSearch: true,
    memory: true,
  },
  exclusive: {
    tokensPerDay: INF,
    tokensPerWeek: INF,
    maxPromptTokens: 5_000,
    maxResponseTokens: 7_500,
    imagesPerDay: INF,
    imageSteps: 3,
    webSearch: true,
    memory: true,
  },
};

/** At most one image per response, on every plan. */
export const MAX_IMAGES_PER_RESPONSE = 1;

/**
 * Shown verbatim when a prompt exceeds the tier's input cap.
 * Fixed copy — do not paraphrase at the call site.
 */
export const PROMPT_TOO_LONG_MESSAGE =
  "Sorry, this prompt is too long. Please edit it or consider upgrading your plan.";

/**
 * Shown verbatim whenever a message is blocked for safety, in every tier.
 * Fixed copy — do not paraphrase at the call site.
 */
export const SAFETY_BLOCKED_MESSAGE =
  "Sorry, my safety filters blocked that request. Please edit the prompt and send it again.";

/**
 * Rough token count for a piece of text.
 *
 * Deliberately an estimate: the real count depends on the model's
 * tokeniser, which lives on the orchestrator, and shipping a tokeniser to
 * the browser to bill someone half a token is not a good trade. Four
 * characters per token is the usual approximation for English and errs
 * slightly high on code, which is the safe direction for a limit.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}

/**
 * The cost curve: eight bands, each an eighth of the tier's own input cap.
 *
 * Measuring against the tier's own cap rather than an absolute length is
 * what stops a Free user's 900-token question costing the same as a Pro
 * user's — both are using nearly everything they were given, and both are
 * charged 4.5 for it.
 */
export const COST_BANDS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5] as const;

/** Is this prompt longer than the tier allows? Checked before anything else. */
export function isPromptTooLong(tier: Tier, promptTokens: number): boolean {
  return promptTokens > TIER_LIMITS[tier].maxPromptTokens;
}

/**
 * What a prompt costs, in usage tokens.
 *
 * Returns null when the prompt is over the cap — the caller must reject it
 * and deduct nothing, rather than charging the top band for a message that
 * is never sent.
 *
 * Exclusive is never charged, so its ledger stays at zero rather than
 * counting up toward a limit that will never arrive.
 */
export function costOfPrompt(tier: Tier, promptTokens: number): number | null {
  if (isPromptTooLong(tier, promptTokens)) return null;
  if (tier === "exclusive") return 0;

  const cap = TIER_LIMITS[tier].maxPromptTokens;
  // An empty prompt still sits in the first band: every message costs
  // something, and 0 would make a flood of blank sends free.
  const eighth = Math.ceil((promptTokens / cap) * 8);
  const band = Math.min(COST_BANDS.length, Math.max(1, eighth));
  return COST_BANDS[band - 1]!;
}

export const isUnlimited = (n: number) => !Number.isFinite(n);

/**
 * Start of the current UTC day — when the daily allowance resets.
 */
export function dayResetsAt(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

/**
 * Next Monday 00:00 UTC — when the weekly allowance resets.
 *
 * getUTCDay() is 0 for Sunday, so Monday is 1 and the days remaining is
 * `(8 - day) % 7`, which lands on 7 for a Monday rather than 0: a reset
 * that has already happened today is next week's, not this instant's.
 */
export function weekResetsAt(now = new Date()): Date {
  const d = new Date(now);
  const daysAhead = (8 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** "at 00:00 UTC" / "on Monday at 00:00 UTC", for a refusal message. */
export function describeReset(kind: "day" | "week"): string {
  return kind === "day" ? "at midnight UTC" : "on Monday at midnight UTC";
}

/** What charge_usage hands back when it refuses or allows a message. */
export type ChargeResult = {
  ok: boolean;
  reason?: string | null;
  day_used?: number | null;
  day_limit?: number | null;
  week_used?: number | null;
  week_limit?: number | null;
  images_used?: number | null;
  images_limit?: number | null;
};

/**
 * Why the message was refused, and when the caller can try again.
 *
 * Built here from the returned balances rather than passed through from
 * the database, so which limit was hit and when it lifts are worded once
 * and identically wherever a message can be refused. A refusal that just
 * says "limit reached" leaves someone reloading the page to find out.
 */
export function limitRefusal(r: ChargeResult, tier: Tier): string {
  const dayLeft = num(r.day_limit) === null ? INF : num(r.day_limit)! - (num(r.day_used) ?? 0);
  const weekLeft = num(r.week_limit) === null ? INF : num(r.week_limit)! - (num(r.week_used) ?? 0);
  const imgLimit = num(r.images_limit);
  const imgLeft = imgLimit === null ? INF : imgLimit - (num(r.images_used) ?? 0);

  if (imgLeft <= 0 && imgLimit !== null) {
    return imgLimit === 0
      ? "Image generation isn't part of your plan. Upgrade to generate images."
      : `You've used all ${imgLimit} of today's images. Your allowance resets ${describeReset("day")}.`;
  }
  if (dayLeft <= 0) {
    return `You've used today's ${TIER_LIMITS[tier].tokensPerDay} usage tokens. They reset ${describeReset("day")}.`;
  }
  if (weekLeft <= 0) {
    return `You've used this week's ${TIER_LIMITS[tier].tokensPerWeek} usage tokens. They reset ${describeReset("week")}.`;
  }
  // Reached only if the database refused for a reason the balances do not
  // explain. Passing its own wording through is better than inventing one.
  return r.reason?.trim() || "You've used up your allowance for now.";
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

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
