/**
 * Server-side usage-token + image quota enforcement.
 *
 * Counters live in public.usage_quota and are only writable by the service
 * role, so a user can't reset their own budget from the browser.
 *
 * Reset policy: daily totals reset at 00:00 UTC; weekly totals use a FIXED
 * week starting Monday 00:00 UTC.
 *
 * The "exclusive" tier is never checked and never deducted.
 */
import {
  MSG_PROMPT_TOO_LONG,
  nextDailyResetLabel,
  nextWeeklyResetLabel,
  tierConfig,
  usageCostFor,
  type Tier,
} from "@/lib/tiers";

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Monday of the current week, in UTC, as YYYY-MM-DD. */
function utcWeekStart(): string {
  const d = new Date();
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - back);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export interface UsageRow {
  day_date: string;
  day_tokens: number;
  day_images: number;
  week_start: string;
  week_tokens: number;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Read the user's counters, rolling over the day/week buckets when stale.
 * Always returns values for the CURRENT day and week.
 */
export async function loadUsage(userId: string): Promise<UsageRow> {
  const db = await admin();
  const today = utcToday();
  const weekStart = utcWeekStart();

  const { data } = await db
    .from("usage_quota")
    .select("day_date, day_tokens, day_images, week_start, week_tokens")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    const fresh: UsageRow = {
      day_date: today,
      day_tokens: 0,
      day_images: 0,
      week_start: weekStart,
      week_tokens: 0,
    };
    await db.from("usage_quota").insert({ user_id: userId, ...fresh });
    return fresh;
  }

  const rolled: UsageRow = {
    day_date: today,
    day_tokens: data.day_date === today ? Number(data.day_tokens) : 0,
    day_images: data.day_date === today ? Number(data.day_images) : 0,
    week_start: weekStart,
    week_tokens: data.week_start === weekStart ? Number(data.week_tokens) : 0,
  };

  if (data.day_date !== today || data.week_start !== weekStart) {
    await db.from("usage_quota").update(rolled).eq("user_id", userId);
  }
  return rolled;
}

export interface QuotaSnapshot {
  tier: Tier;
  unlimited: boolean;
  dayTokensUsed: number;
  weekTokensUsed: number;
  dayTokensLimit: number | null;
  weekTokensLimit: number | null;
  dayImagesUsed: number;
  dayImagesLimit: number | null;
  dailyResetsAt: string;
  weeklyResetsAt: string;
}

export async function getQuotaSnapshot(
  userId: string,
  tier: string
): Promise<QuotaSnapshot> {
  const cfg = tierConfig(tier);
  const usage = await loadUsage(userId);
  return {
    tier: cfg.id,
    unlimited: cfg.dailyTokens === null && cfg.weeklyTokens === null,
    dayTokensUsed: usage.day_tokens,
    weekTokensUsed: usage.week_tokens,
    dayTokensLimit: cfg.dailyTokens,
    weekTokensLimit: cfg.weeklyTokens,
    dayImagesUsed: usage.day_images,
    dayImagesLimit: cfg.maxImagesPerDay,
    dailyResetsAt: nextDailyResetLabel(),
    weeklyResetsAt: nextWeeklyResetLabel(),
  };
}

const upgradeHint = (tier: string) =>
  tier === "exclusive" ? "" : " Upgrade your plan for more.";

/**
 * Validate a pending message against the tier's prompt cap, usage-token
 * budget and image quotas. Throws a user-facing Error when blocked.
 * Returns the usage-token cost to deduct after the send succeeds.
 */
export async function assertQuotaAllows(opts: {
  userId: string;
  tier: string;
  text: string;
  imageCount: number;
}): Promise<{ cost: number; unlimited: boolean }> {
  const cfg = tierConfig(opts.tier);

  // Prompt length: over 100% of the tier cap is rejected with no deduction.
  const cost = usageCostFor(opts.text, cfg.id);
  if (cost === null) throw new Error(MSG_PROMPT_TOO_LONG);

  // Exclusive: no checks, no deduction.
  if (cfg.dailyTokens === null && cfg.weeklyTokens === null) {
    if (
      cfg.maxImagesPerResponse !== null &&
      opts.imageCount > cfg.maxImagesPerResponse
    ) {
      throw new Error(
        `Your plan allows ${cfg.maxImagesPerResponse} image${cfg.maxImagesPerResponse === 1 ? "" : "s"} per response.`
      );
    }
    return { cost: 0, unlimited: true };
  }

  const usage = await loadUsage(opts.userId);

  if (cfg.dailyTokens !== null && usage.day_tokens + cost > cfg.dailyTokens) {
    throw new Error(
      `You've used your usage tokens for today. They reset at ${nextDailyResetLabel()}.${upgradeHint(cfg.id)}`
    );
  }
  if (cfg.weeklyTokens !== null && usage.week_tokens + cost > cfg.weeklyTokens) {
    throw new Error(
      `You've used your usage tokens for this week. They reset at ${nextWeeklyResetLabel()}.${upgradeHint(cfg.id)}`
    );
  }

  if (opts.imageCount > 0) {
    if (
      cfg.maxImagesPerResponse !== null &&
      opts.imageCount > cfg.maxImagesPerResponse
    ) {
      throw new Error(
        `Your plan allows ${cfg.maxImagesPerResponse} image${cfg.maxImagesPerResponse === 1 ? "" : "s"} per response.${upgradeHint(cfg.id)}`
      );
    }
    if (
      cfg.maxImagesPerDay !== null &&
      usage.day_images + opts.imageCount > cfg.maxImagesPerDay
    ) {
      throw new Error(
        `You've used today's images (${cfg.maxImagesPerDay} per day). They reset at ${nextDailyResetLabel()}.${upgradeHint(cfg.id)}`
      );
    }
  }

  return { cost, unlimited: false };
}

/** Deduct usage tokens + images after a message went through. */
export async function recordUsage(opts: {
  userId: string;
  tier: string;
  cost: number;
  imageCount: number;
}): Promise<void> {
  const cfg = tierConfig(opts.tier);
  if (cfg.dailyTokens === null && cfg.weeklyTokens === null) return; // exclusive
  const usage = await loadUsage(opts.userId);
  const db = await admin();
  await db
    .from("usage_quota")
    .update({
      day_date: usage.day_date,
      week_start: usage.week_start,
      day_tokens: usage.day_tokens + opts.cost,
      week_tokens: usage.week_tokens + opts.cost,
      day_images: usage.day_images + opts.imageCount,
    })
    .eq("user_id", opts.userId);
}

/**
 * Safety hook placeholder. The real classifier isn't live yet; when it is,
 * return true here and the caller surfaces MSG_SAFETY_BLOCKED verbatim.
 */
export function isSafetyBlocked(_text: string): boolean {
  return false;
}
