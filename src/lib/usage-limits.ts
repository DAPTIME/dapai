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

/** Infinity means unlimited, so callers compare without a null check. */
const INF = Number.POSITIVE_INFINITY;

/**
 * How many chats stay in history. Older ones are pruned when a new chat
 * starts, so this is a rolling window rather than a hard stop.
 */
export const CHAT_HISTORY_LIMIT: Record<Tier, number> = {
  free: 5,
  go: 15,
  pro: 30,
  // Genuinely unlimited rather than a large number: a cap of 100 would
  // still silently delete somebody's 101st chat one day.
  exclusive: INF,
};

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
  /**
   * How many past turns of this conversation the model is shown, where a
   * turn is one message and its reply.
   *
   * This belongs to the account, not to the model the picker is on. The
   * orchestrator derives an effective tier from min(account tier, model)
   * and has been applying its history depth from that, so choosing a
   * faster model quietly shortened what DAP AI could remember — a Pro
   * account asking a quick question on Lite lost most of its thread.
   * Sending an already-trimmed history states the intent here instead of
   * relying on the far end to infer it, and stops a long thread being
   * re-sent in full on every single turn.
   */
  historyTurns: number;
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
    historyTurns: 3,
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
    historyTurns: 5,
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
    historyTurns: 8,
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
    historyTurns: 10,
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
 * The cost curve, as a band table per tier.
 *
 * Each entry is [upper bound as a percentage of THAT TIER'S input cap,
 * cost in usage tokens]. A prompt costs the first band whose upper bound
 * it does not exceed; above 100% it is rejected and costs nothing.
 *
 * Written out per tier rather than derived from one shared formula,
 * because the tiers genuinely differ: the ceilings are 3.5 / 4.5 / 5.5 and
 * the band counts are 6 / 8 / 10, so any single expression covering all
 * three would be a worse description of the rule than the rule itself.
 *
 * Measuring against the tier's own cap is what stops a Free user's
 * 950-token question costing the same as a Pro user's 3,800-token one —
 * both are using nearly everything they were given, and both pay their own
 * tier's maximum.
 *
 * Note on Free: the spec's prose says "7 bands" while its table lists six
 * (1.0 through 3.5 in 0.5 steps, the last running 71.4%–100%). The table
 * is followed, being the unambiguous half.
 */
export type CostBand = readonly [maxPercent: number, cost: number];

export const COST_BANDS: Record<Tier, readonly CostBand[]> = {
  free: [
    [14.3, 1.0],
    [28.6, 1.5],
    [42.9, 2.0],
    [57.1, 2.5],
    [71.4, 3.0],
    [100, 3.5],
  ],
  go: [
    [12.5, 1.0],
    [25, 1.5],
    [37.5, 2.0],
    [50, 2.5],
    [62.5, 3.0],
    [75, 3.5],
    [87.5, 4.0],
    [100, 4.5],
  ],
  pro: [
    [10, 1.0],
    [20, 1.5],
    [30, 2.0],
    [40, 2.5],
    [50, 3.0],
    [60, 3.5],
    [70, 4.0],
    [80, 4.5],
    [90, 5.0],
    [100, 5.5],
  ],
  // Never charged. Kept as an empty table rather than omitted so the record
  // stays total and a missing tier cannot read as "no limit configured".
  exclusive: [],
};

/** The most a single prompt can cost on this tier. */
export function maxCostFor(tier: Tier): number {
  const bands = COST_BANDS[tier];
  return bands.length ? bands[bands.length - 1]![1] : 0;
}

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
  const pct = (promptTokens / cap) * 100;

  // An empty prompt still sits in the first band: every message costs
  // something, and 0 would make a flood of blank sends free.
  for (const [upTo, cost] of COST_BANDS[tier]) {
    if (pct <= upTo) return cost;
  }
  // Unreachable while the last band ends at 100 and the cap was checked
  // above, but a curve that silently returned undefined would charge NaN.
  return maxCostFor(tier);
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
